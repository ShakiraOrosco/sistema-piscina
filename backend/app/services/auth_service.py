from __future__ import annotations

import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import bcrypt
import jwt

from ..config import settings


# ─── Utilidades de Criptografía y Contraseñas ─────────────────────────────────

def generar_password_temporal() -> str:
    """Genera una contraseña aleatoria segura para nuevos usuarios o recuperaciones."""
    return secrets.token_urlsafe(12)


def hash_password(password: str) -> str:
    """Genera el hash bcrypt de una contraseña en texto plano."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_password(password: str, password_hash: str) -> bool:
    """Compara una contraseña en texto plano contra su hash bcrypt almacenado."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# ─── Generación de Tokens JWT ─────────────────────────────────────────────────

def crear_token(id_usuario: int, correo: str, sigla_rol: str, debe_cambiar: bool) -> str:
    """Crea el JWT de sesión principal con los datos y rol del usuario."""
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(id_usuario),
        "correo": correo,
        "sigla_rol": sigla_rol,
        "debe_cambiar_password": debe_cambiar,
        "iat": ahora,
        "exp": ahora + timedelta(minutes=settings.JWT_EXPIRES_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def crear_token_2fa(id_usuario: int) -> str:
    """Crea un JWT temporal (10 min) exclusivo para completar el desafío de doble factor (2FA)."""
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(id_usuario),
        "purpose": "2fa",
        "iat": ahora,
        "exp": ahora + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def generar_codigo_2fa() -> str:
    """Genera un código numérico aleatorio de 6 dígitos para verificación 2FA."""
    return f"{secrets.randbelow(1_000_000):06d}"


# ─── Envío de Correos SMTP ────────────────────────────────────────────────────

def enviar_codigo_2fa(destinatario: str, codigo: str) -> None:
    """Envía por correo electrónico el código de verificación 2FA (o lo muestra en consola si no hay SMTP)."""
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        print(f"\n=======================================================")
        print(f"🔐 [2FA] Servidor SMTP no configurado en .env")
        print(f"👉 Tu código de verificación para {destinatario} es: {codigo}")
        print(f"=======================================================\n")
        return

    try:
        mensaje = EmailMessage()
        mensaje["Subject"] = "Código de acceso - Piscina Playa Azul"
        mensaje["From"] = settings.SMTP_FROM
        mensaje["To"] = destinatario
        mensaje.set_content(
            "Tu código de verificación para acceder al sistema es: "
            f"{codigo}\n\nEste código vence en 10 minutos."
        )

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as servidor:
            if settings.SMTP_USE_TLS:
                servidor.starttls()
            if settings.SMTP_USER:
                servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            servidor.send_message(mensaje)
    except Exception as e:
        print(f"\n⚠️ [SMTP Error] No se pudo enviar el correo 2FA a {destinatario}: {e}")
        print(f"👉 CÓDIGO 2FA de respaldo: {codigo}\n")


def enviar_password_temporal(destinatario: str, nombre: str, password: str) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        print(f"\n=======================================================")
        print(f"🔑 [AUTH] Contraseña temporal para {destinatario} ({nombre}): {password}")
        print(f"=======================================================\n")
        return

    try:
        mensaje = EmailMessage()
        mensaje["Subject"] = "Acceso inicial - Piscina Playa Azul"
        mensaje["From"] = settings.SMTP_FROM
        mensaje["To"] = destinatario
        mensaje.set_content(
            f"Hola {nombre},\n\n"
            "Se creó tu usuario para el sistema de la piscina.\n"
            f"Contraseña temporal: {password}\n\n"
            "Usa esta contraseña para iniciar sesión. El sistema te pedirá cambiarla "
            "antes de continuar.\n"
        )

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as servidor:
            if settings.SMTP_USE_TLS:
                servidor.starttls()
            if settings.SMTP_USER:
                servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            servidor.send_message(mensaje)
    except Exception as e:
        print(f"⚠️ [SMTP Error] No se pudo enviar la contraseña temporal a {destinatario}: {e}")
        print(f"👉 Contraseña temporal de respaldo: {password}\n")


def enviar_password_recuperacion(destinatario: str, nombre: str, password: str) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        print(f"\n=======================================================")
        print(f"🔑 [AUTH] Recuperación de contraseña para {destinatario} ({nombre}): {password}")
        print(f"=======================================================\n")
        return

    try:
        mensaje = EmailMessage()
        mensaje["Subject"] = "Restablecimiento de contraseña - Piscina Playa Azul"
        mensaje["From"] = settings.SMTP_FROM
        mensaje["To"] = destinatario
        mensaje.set_content(
            f"Hola {nombre},\n\n"
            "Has solicitado restablecer tu contraseña para ingresar al sistema de la piscina.\n\n"
            f"Tu nueva contraseña temporal es: {password}\n\n"
            "Usa esta contraseña para iniciar sesión. Al ingresar, el sistema te solicitará "
            "crear una nueva contraseña personalizada para tu seguridad.\n\n"
            "Si no solicitaste este cambio, por favor ponte en contacto con el administrador."
        )

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as servidor:
            if settings.SMTP_USE_TLS:
                servidor.starttls()
            if settings.SMTP_USER:
                servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            servidor.send_message(mensaje)
    except Exception as e:
        print(f"⚠️ [SMTP Error] No se pudo enviar la recuperación a {destinatario}: {e}")
        print(f"👉 Contraseña temporal de respaldo: {password}\n")