from __future__ import annotations

from datetime import datetime, timedelta, timezone
import threading
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from ..config import settings
from ..db import get_connection, get_dict_cursor
from ..routers.auditoria import registrar_log
from ..services.auth_service import (
    crear_token,
    crear_token_2fa,
    enviar_codigo_2fa,
    enviar_password_recuperacion,
    enviar_password_temporal,
    generar_codigo_2fa,
    generar_password_temporal,
    hash_password,
    verificar_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["autenticacion"])
bearer = HTTPBearer()

MAX_INTENTOS_FALLIDOS = 3
DURACION_BLOQUEO_MINUTOS = 5
_intentos_login_lock = threading.Lock()
_intentos_login: dict[str, dict] = {}


def _verificar_bloqueo_login(correo: str) -> int | None:
    """Retorna los segundos restantes de bloqueo si el correo está bloqueado, o None."""
    ahora = datetime.now(timezone.utc)
    with _intentos_login_lock:
        registro = _intentos_login.get(correo)
        if not registro:
            return None
        bloqueado_hasta = registro.get("bloqueado_hasta")
        if bloqueado_hasta and bloqueado_hasta > ahora:
            return max(1, int((bloqueado_hasta - ahora).total_seconds()))
        if bloqueado_hasta and bloqueado_hasta <= ahora:
            _intentos_login.pop(correo, None)
        return None


def _registrar_intento_fallido_login(correo: str) -> tuple[int, bool]:
    """Incrementa el conteo de intentos fallidos y bloquea al alcanzar el máximo."""
    ahora = datetime.now(timezone.utc)
    with _intentos_login_lock:
        registro = _intentos_login.get(correo, {"intentos": 0, "bloqueado_hasta": None})
        intentos = registro["intentos"] + 1
        recien_bloqueado = intentos >= MAX_INTENTOS_FALLIDOS
        bloqueado_hasta = (
            ahora + timedelta(minutes=DURACION_BLOQUEO_MINUTOS)
            if recien_bloqueado
            else None
        )
        _intentos_login[correo] = {
            "intentos": intentos,
            "bloqueado_hasta": bloqueado_hasta,
        }
        return intentos, recien_bloqueado


def _limpiar_intentos_login(correo: str) -> None:
    """Reinicia el conteo de intentos fallidos tras un inicio de sesión exitoso."""
    with _intentos_login_lock:
        _intentos_login.pop(correo, None)


class OlvidePassword(BaseModel):
    correo: EmailStr


@router.get("/roles")
def listar_roles():
    """Obtiene la lista de roles desde la base de datos."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute("SELECT sigla, nombre FROM rol_usuario ORDER BY nombre ASC")
        return cur.fetchall()
    finally:
        conn.close()


class CrearUsuario(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    primer_apellido: str = Field(min_length=2, max_length=60)
    segundo_apellido: str = Field(default="", max_length=60)
    correo: EmailStr
    sigla_rol: str = Field(default="OPE", min_length=1, max_length=5)


class Login(BaseModel):
    correo: EmailStr
    password: str = Field(min_length=1, max_length=255)


class CambiarPassword(BaseModel):
    password_actual: str = Field(min_length=1, max_length=255)
    password_nueva: str = Field(min_length=8, max_length=255)
    confirmar_password_nueva: str = Field(min_length=8, max_length=255)


class VerificarCodigo2FA(BaseModel):
    desafio: str
    codigo: str = Field(pattern=r"^\d{6}$")


class Configurar2FA(BaseModel):
    activo: bool


class EditarUsuario(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    primer_apellido: str = Field(min_length=2, max_length=60)
    segundo_apellido: str = Field(default="", max_length=60)
    correo: EmailStr
    sigla_rol: str = Field(min_length=1, max_length=5)


def usuario_actual(
    credenciales: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> dict:
    try:
        return jwt.decode(
            credenciales.credentials,
            settings.JWT_SECRET,
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc


def administrador_actual(claims: Annotated[dict, Depends(usuario_actual)]) -> dict:
    if claims.get("sigla_rol") != "ADM":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol administrador")
    return claims


@router.post("/users", status_code=status.HTTP_201_CREATED)
def crear_usuario(payload: CrearUsuario, _: Annotated[dict, Depends(administrador_actual)]):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    password_temporal = generar_password_temporal()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM usuario WHERE correo = %s AND activo = TRUE", (payload.correo,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")
        cur.execute("SELECT 1 FROM rol_usuario WHERE sigla = %s", (payload.sigla_rol,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="La sigla de rol no existe")
        cur.execute(
            """
            INSERT INTO usuario (nombre, primer_apellido, segundo_apellido, correo, password, sigla_rol, debe_cambiar_password)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
            RETURNING id_usuario
            """,
            (payload.nombre, payload.primer_apellido, payload.segundo_apellido, payload.correo, hash_password(password_temporal), payload.sigla_rol),
        )
        id_usuario = cur.fetchone()[0]
        enviar_password_temporal(payload.correo, f"{payload.nombre} {payload.primer_apellido}", password_temporal)
        conn.commit()
        return {"id_usuario": id_usuario, "correo": payload.correo, "mensaje": "Usuario creado y contraseña enviada por correo"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/login")
def iniciar_sesion(payload: Login, request: Request):
    correo_key = payload.correo.strip().lower()
    segundos_restantes = _verificar_bloqueo_login(correo_key)
    if segundos_restantes is not None:
        minutos = segundos_restantes // 60
        segundos = segundos_restantes % 60
        raise HTTPException(
            status_code=429,
            detail=f"Acceso bloqueado temporalmente tras {MAX_INTENTOS_FALLIDOS} intentos fallidos. Intenta nuevamente en {minutos}m {segundos:02d}s.",
        )

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        ip_cliente = request.client.host if request.client else None
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_usuario, nombre, primer_apellido, segundo_apellido, correo, password, sigla_rol, debe_cambiar_password, doble_factor_activo FROM usuario WHERE correo = %s AND activo = TRUE",
            (payload.correo,),
        )
        usuario = cur.fetchone()
        if not usuario or not verificar_password(payload.password, usuario["password"]):
            intentos, recien_bloqueado = _registrar_intento_fallido_login(correo_key)
            # Registrar intento fallido de inicio de sesión
            registrar_log(
                conn=conn,
                id_usuario=usuario["id_usuario"] if usuario else None,
                modulo="Autenticación",
                accion="LOGIN_BLOCKED" if recien_bloqueado else "LOGIN_FAILED",
                entidad="usuario",
                detalle={
                    "correo_intentado": payload.correo,
                    "intentos_fallidos": intentos,
                    "motivo": (
                        f"Bloqueo temporal ({DURACION_BLOQUEO_MINUTOS} min) tras {MAX_INTENTOS_FALLIDOS} intentos fallidos"
                        if recien_bloqueado
                        else "Contraseña o usuario inválido"
                    ),
                },
                ip_origen=ip_cliente,
            )
            if recien_bloqueado:
                raise HTTPException(
                    status_code=429,
                    detail=f"Has superado los {MAX_INTENTOS_FALLIDOS} intentos fallidos. Tu acceso ha sido bloqueado temporalmente por {DURACION_BLOQUEO_MINUTOS} minutos.",
                )
            restantes = MAX_INTENTOS_FALLIDOS - intentos
            raise HTTPException(
                status_code=401,
                detail=f"Correo o contraseña inválidos. Te quedan {restantes} intento(s) antes del bloqueo temporal.",
            )

        _limpiar_intentos_login(correo_key)

        # Login exitoso: Registrar auditoría
        registrar_log(
            conn=conn,
            id_usuario=usuario["id_usuario"],
            modulo="Autenticación",
            accion="LOGIN_SUCCESS",
            entidad="usuario",
            detalle={"correo": usuario["correo"], "sigla_rol": usuario["sigla_rol"]},
            ip_origen=ip_cliente,
        )

        debe_cambiar = usuario["debe_cambiar_password"]
        if usuario["doble_factor_activo"]:
            codigo = generar_codigo_2fa()
            expira = datetime.now(timezone.utc) + timedelta(minutes=10)
            cur.execute(
                "UPDATE usuario SET codigo_2fa_hash = %s, codigo_2fa_expira = %s WHERE id_usuario = %s",
                (hash_password(codigo), expira, usuario["id_usuario"]),
            )
            enviar_codigo_2fa(usuario["correo"], codigo)
            conn.commit()
            return {
                "requiere_2fa": True,
                "desafio": crear_token_2fa(usuario["id_usuario"]),
                "correo_mascarado": _mascarar_correo(usuario["correo"]),
                "usuario": {"id_usuario": usuario["id_usuario"], "nombre": usuario["nombre"], "primer_apellido": usuario["primer_apellido"], "segundo_apellido": usuario["segundo_apellido"], "correo": usuario["correo"], "sigla_rol": usuario["sigla_rol"]},
            }
        return {
            "access_token": crear_token(usuario["id_usuario"], usuario["correo"], usuario["sigla_rol"], debe_cambiar),
            "token_type": "bearer",
            "must_change_password": debe_cambiar,
            "usuario": {"id_usuario": usuario["id_usuario"], "nombre": usuario["nombre"], "primer_apellido": usuario["primer_apellido"], "segundo_apellido": usuario["segundo_apellido"], "correo": usuario["correo"], "sigla_rol": usuario["sigla_rol"]},
        }
    finally:
        conn.close()


def _mascarar_correo(correo: str) -> str:
    usuario, dominio = correo.split("@", 1)
    visible = usuario[:2] if len(usuario) > 2 else usuario[:1]
    return f"{visible}{'*' * max(2, len(usuario) - len(visible))}@{dominio}"


@router.post("/verify-2fa")
def verificar_2fa(payload: VerificarCodigo2FA):
    try:
        claims = jwt.decode(payload.desafio, settings.JWT_SECRET, algorithms=["HS256"])
        if claims.get("purpose") != "2fa":
            raise HTTPException(status_code=401, detail="Desafío 2FA inválido")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="El código de acceso expiró") from exc

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_usuario, correo, sigla_rol, debe_cambiar_password, codigo_2fa_hash, codigo_2fa_expira FROM usuario WHERE id_usuario = %s AND activo = TRUE AND doble_factor_activo = TRUE",
            (int(claims["sub"]),),
        )
        usuario = cur.fetchone()
        ahora = datetime.now(timezone.utc)
        if not usuario or not usuario["codigo_2fa_hash"] or not usuario["codigo_2fa_expira"]:
            raise HTTPException(status_code=401, detail="No hay un código 2FA pendiente")
        expira = usuario["codigo_2fa_expira"].replace(tzinfo=timezone.utc) if usuario["codigo_2fa_expira"].tzinfo is None else usuario["codigo_2fa_expira"]
        if expira < ahora or not verificar_password(payload.codigo, usuario["codigo_2fa_hash"]):
            raise HTTPException(status_code=401, detail="Código 2FA incorrecto o expirado")
        cur.execute("UPDATE usuario SET codigo_2fa_hash = NULL, codigo_2fa_expira = NULL WHERE id_usuario = %s", (usuario["id_usuario"],))
        conn.commit()
        return {
            "access_token": crear_token(usuario["id_usuario"], usuario["correo"], usuario["sigla_rol"], usuario["debe_cambiar_password"]),
            "token_type": "bearer",
            "must_change_password": usuario["debe_cambiar_password"],
        }
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/profile")
def obtener_perfil(claims: Annotated[dict, Depends(usuario_actual)]):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_usuario, nombre, primer_apellido, segundo_apellido, correo, sigla_rol, doble_factor_activo FROM usuario WHERE id_usuario = %s AND activo = TRUE",
            (int(claims["sub"]),),
        )
        perfil = cur.fetchone()
        if not perfil:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return perfil
    finally:
        conn.close()


@router.put("/profile/2fa")
def configurar_2fa(payload: Configurar2FA, claims: Annotated[dict, Depends(usuario_actual)]):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE usuario SET doble_factor_activo = %s, codigo_2fa_hash = NULL, codigo_2fa_expira = NULL WHERE id_usuario = %s AND activo = TRUE RETURNING doble_factor_activo",
            (payload.activo, int(claims["sub"])),
        )
        resultado = cur.fetchone()
        if not resultado:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        conn.commit()
        return {"doble_factor_activo": resultado[0], "mensaje": "Doble factor actualizado correctamente"}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/users")
def listar_usuarios(claims: Annotated[dict, Depends(administrador_actual)]):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT id_usuario, nombre, primer_apellido, segundo_apellido, correo, sigla_rol, activo, debe_cambiar_password
            FROM usuario
            WHERE id_usuario <> %s AND activo = TRUE
            ORDER BY nombre ASC
            """,
            (int(claims["sub"]),),
        )
        return cur.fetchall()
    finally:
        conn.close()


@router.put("/users/{id_usuario}")
def editar_usuario(id_usuario: int, payload: EditarUsuario, _: Annotated[dict, Depends(administrador_actual)]):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT 1 FROM usuario WHERE correo = %s AND id_usuario <> %s AND activo = TRUE",
            (payload.correo, id_usuario),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")
        cur.execute("SELECT 1 FROM rol_usuario WHERE sigla = %s", (payload.sigla_rol,))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="La sigla de rol no existe")
        cur.execute(
            """
            UPDATE usuario SET nombre = %s, primer_apellido = %s, segundo_apellido = %s, correo = %s, sigla_rol = %s
            WHERE id_usuario = %s AND activo = TRUE
            RETURNING id_usuario, nombre, primer_apellido, segundo_apellido, correo, sigla_rol, activo, debe_cambiar_password
            """,
            (payload.nombre, payload.primer_apellido, payload.segundo_apellido, payload.correo, payload.sigla_rol, id_usuario),
        )
        usuario = cur.fetchone()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        conn.commit()
        return {"usuario": usuario, "mensaje": "Usuario actualizado correctamente"}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.delete("/users/{id_usuario}")
def eliminar_usuario(id_usuario: int, claims: Annotated[dict, Depends(administrador_actual)]):
    if int(claims["sub"]) == id_usuario:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propio usuario")
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE usuario SET activo = FALSE WHERE id_usuario = %s AND activo = TRUE RETURNING id_usuario",
            (id_usuario,),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        conn.commit()
        return {"mensaje": "Usuario desactivado correctamente"}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/change-password")
def cambiar_password(payload: CambiarPassword, claims: Annotated[dict, Depends(usuario_actual)]):
    if payload.password_nueva != payload.confirmar_password_nueva:
        raise HTTPException(status_code=400, detail="La confirmación no coincide con la nueva contraseña")
    if payload.password_actual == payload.password_nueva:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser diferente")
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute("SELECT password FROM usuario WHERE id_usuario = %s", (int(claims["sub"]),))
        usuario = cur.fetchone()
        if not usuario or not verificar_password(payload.password_actual, usuario["password"]):
            raise HTTPException(status_code=401, detail="La contraseña temporal no es válida")
        cur.execute(
            "UPDATE usuario SET password = %s, debe_cambiar_password = FALSE WHERE id_usuario = %s",
            (hash_password(payload.password_nueva), int(claims["sub"])),
        )
        conn.commit()
        return {"mensaje": "Contraseña actualizada correctamente", "must_change_password": False}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.post("/forgot-password")
def recuperar_password(payload: OlvidePassword):
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_usuario, nombre, primer_apellido, correo FROM usuario WHERE correo = %s AND activo = TRUE",
            (payload.correo,),
        )
        usuario = cur.fetchone()
        if not usuario:
            # Por seguridad no revelamos si existe o no
            return {"mensaje": "Si el correo está registrado, recibirás las instrucciones para restablecer tu contraseña."}

        temp_password = generar_password_temporal()
        hashed = hash_password(temp_password)

        cur.execute(
            "UPDATE usuario SET password = %s, debe_cambiar_password = TRUE WHERE id_usuario = %s",
            (hashed, usuario["id_usuario"]),
        )
        enviar_password_recuperacion(
            usuario["correo"],
            f"{usuario['nombre']} {usuario['primer_apellido']}",
            temp_password,
        )
        conn.commit()
        return {"mensaje": "Si el correo está registrado, recibirás las instrucciones para restablecer tu contraseña."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()