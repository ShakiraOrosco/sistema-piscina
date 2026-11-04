from __future__ import annotations

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from ..db import get_connection, get_dict_cursor
from ..services.piscina_service import serializar_dict

router = APIRouter(prefix="/api/v1/inventario", tags=["inventario"])


class RegistrarCompraPayload(BaseModel):
    sigla_quimico: str = Field(..., min_length=1, max_length=10)
    cantidad: float = Field(..., gt=0, description="Cantidad a agregar al inventario")
    observaciones: Optional[str] = None
    id_usuario: Optional[int] = None


class RegistrarMovimientoPayload(BaseModel):
    sigla_quimico: str = Field(..., min_length=1, max_length=10)
    tipo_movimiento: str = Field(
        ...,
        description="Tipo de movimiento: 'compra', 'dosificacion', o 'merma'",
    )
    cantidad: float = Field(..., gt=0, description="Cantidad del movimiento")
    observaciones: Optional[str] = None
    id_usuario: Optional[int] = None


def asegurar_origen_merma(cur):
    try:
        cur.execute(
            """
            INSERT INTO origen_movimiento (nombre, sigla)
            VALUES ('Merma', 'MER')
            ON CONFLICT (sigla) DO NOTHING
            """
        )
    except Exception:
        pass


class RegistrarQuimicoPayload(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    sigla: str = Field(..., min_length=1, max_length=10)
    unidad_medida: str = Field(..., min_length=1, max_length=20)
    stock_actual: float = Field(0, ge=0)
    stock_minimo: float = Field(0, ge=0)


@router.get("/quimicos")
def listar_quimicos():
    """Obtiene la lista de químicos registrados con su stock actual."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT id_quimico, nombre, sigla, unidad_medida, stock_actual, stock_minimo, activo, creado_en
            FROM quimico
            WHERE activo = TRUE
            ORDER BY nombre ASC
            """
        )
        quimicos = [serializar_dict(q) for q in cur.fetchall()]
        return quimicos
    finally:
        conn.close()


@router.post("/quimicos", status_code=201)
def crear_quimico(payload: RegistrarQuimicoPayload):
    """Registra un nuevo químico en la base de datos."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM quimico WHERE sigla = %s OR LOWER(nombre) = LOWER(%s)",
            (payload.sigla.upper(), payload.nombre.strip()),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Ya existe un químico con esa sigla o nombre")

        cur.execute(
            """
            INSERT INTO quimico (nombre, sigla, unidad_medida, stock_actual, stock_minimo, activo)
            VALUES (%s, %s, %s, %s, %s, TRUE)
            RETURNING id_quimico, nombre, sigla, unidad_medida, stock_actual, stock_minimo
            """,
            (
                payload.nombre.strip(),
                payload.sigla.upper(),
                payload.unidad_medida.strip(),
                payload.stock_actual,
                payload.stock_minimo,
            ),
        )
        nuevo_quimico = cur.fetchone()
        conn.commit()
        return {
            "mensaje": f"Químico '{payload.nombre}' registrado con éxito",
            "quimico": {
                "id_quimico": nuevo_quimico[0],
                "nombre": nuevo_quimico[1],
                "sigla": nuevo_quimico[2],
                "unidad_medida": nuevo_quimico[3],
                "stock_actual": float(nuevo_quimico[4]),
                "stock_minimo": float(nuevo_quimico[5]),
            },
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/movimientos", status_code=201)
def registrar_movimiento(payload: RegistrarMovimientoPayload):
    """
    Registra un movimiento de inventario (compra, dosificación o merma):
    - compra: Entrada de insumo (aumenta stock)
    - dosificacion: Salida de insumo por aplicación a la piscina (descuenta stock)
    - merma: Salida de insumo por pérdida, vencimiento o derrame (descuenta stock)
    """
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    tipo_raw = payload.tipo_movimiento.strip().lower()
    if tipo_raw in ("compra", "com", "entrada", "ent"):
        sigla_tipo = "ENT"
        sigla_origen = "COM"
        es_salida = False
        tipo_label = "Compra"
        default_obs = "Ingreso por compra de insumos"
    elif tipo_raw in ("dosificacion", "dosificación", "dos", "salida_dosificacion"):
        sigla_tipo = "SAL"
        sigla_origen = "DOS"
        es_salida = True
        tipo_label = "Dosificación"
        default_obs = "Salida por dosificación de químicos"
    elif tipo_raw in ("merma", "mer", "perdida", "pérdida"):
        sigla_tipo = "SAL"
        sigla_origen = "MER"
        es_salida = True
        tipo_label = "Merma"
        default_obs = "Salida por merma o pérdida de insumo"
    else:
        raise HTTPException(
            status_code=400,
            detail="Tipo de movimiento no válido. Opciones permitidas: 'compra', 'dosificacion', 'merma'",
        )

    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_quimico, nombre, sigla, stock_actual, unidad_medida FROM quimico WHERE sigla = %s AND activo = TRUE",
            (payload.sigla_quimico.upper(),),
        )
        quimico = cur.fetchone()
        if not quimico:
            raise HTTPException(status_code=404, detail="Químico no encontrado")

        stock_actual = float(quimico["stock_actual"])
        if es_salida:
            if payload.cantidad > stock_actual:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente: no se puede registrar una salida de {payload.cantidad} {quimico['unidad_medida']}. "
                        f"Stock actual disponible: {stock_actual} {quimico['unidad_medida']}."
                    ),
                )
            nuevo_stock = stock_actual - payload.cantidad
        else:
            nuevo_stock = stock_actual + payload.cantidad

        cur = conn.cursor()
        asegurar_origen_merma(cur)

        # 1. Actualizar stock del químico
        cur.execute(
            "UPDATE quimico SET stock_actual = %s WHERE sigla = %s",
            (nuevo_stock, payload.sigla_quimico.upper()),
        )

        # 2. Registrar movimiento en movimiento_inventario
        cur.execute(
            """
            INSERT INTO movimiento_inventario (
                sigla_quimico,
                sigla_tipo_movimiento,
                sigla_origen,
                cantidad,
                stock_resultante,
                id_usuario,
                fecha_hora,
                observaciones
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id_movimiento
            """,
            (
                payload.sigla_quimico.upper(),
                sigla_tipo,
                sigla_origen,
                payload.cantidad,
                nuevo_stock,
                payload.id_usuario,
                datetime.now(),
                payload.observaciones or default_obs,
            ),
        )
        id_mov = cur.fetchone()[0]
        conn.commit()

        signo = "+" if not es_salida else "-"
        return {
            "mensaje": f"{tipo_label} registrada: {signo}{payload.cantidad} {quimico['unidad_medida']} de {quimico['nombre']}",
            "id_movimiento": id_mov,
            "tipo_movimiento": tipo_label,
            "stock_anterior": stock_actual,
            "stock_nuevo": nuevo_stock,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/compras", status_code=201)
def registrar_compra(payload: RegistrarCompraPayload):
    """
    Registra la compra o ingreso de un químico (alias mantenido por compatibilidad):
    1. Aumenta el `stock_actual` en la tabla `quimico`.
    2. Registra el movimiento en `movimiento_inventario` (ENT, COM).
    """
    return registrar_movimiento(
        RegistrarMovimientoPayload(
            sigla_quimico=payload.sigla_quimico,
            tipo_movimiento="compra",
            cantidad=payload.cantidad,
            observaciones=payload.observaciones,
            id_usuario=payload.id_usuario,
        )
    )


@router.get("/movimientos")
def listar_movimientos(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    sigla_quimico: Optional[str] = None,
    tipo: Optional[str] = None,
    limit: Optional[int] = 500,
):
    """Historial de movimientos de inventario con soporte para filtrado por fechas y químicos."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = get_dict_cursor(conn)
        asegurar_origen_merma(cur)

        conditions = []
        params = []

        desde = (fecha_desde or fecha_inicio or "").strip()
        hasta = (fecha_hasta or fecha_fin or "").strip()

        if desde:
            desde_str = f"{desde} 00:00:00" if len(desde) == 10 else desde
            conditions.append("m.fecha_hora >= %s")
            params.append(desde_str)

        if hasta:
            hasta_str = f"{hasta} 23:59:59.999999" if len(hasta) == 10 else hasta
            conditions.append("m.fecha_hora <= %s")
            params.append(hasta_str)

        if sigla_quimico:
            conditions.append("m.sigla_quimico = %s")
            params.append(sigla_quimico.upper().strip())

        if tipo:
            tipo_clean = tipo.upper().strip()
            conditions.append("(m.sigla_tipo_movimiento = %s OR m.sigla_origen = %s)")
            params.extend([tipo_clean, tipo_clean])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query_limit = max(1, min(limit or 200, 1000))
        params.append(query_limit)

        sql = f"""
            SELECT 
                m.id_movimiento,
                m.sigla_quimico,
                q.nombre AS nombre_quimico,
                q.unidad_medida,
                m.sigla_tipo_movimiento,
                COALESCE(tm.nombre, m.sigla_tipo_movimiento) AS tipo_movimiento,
                m.sigla_origen,
                COALESCE(om.nombre, m.sigla_origen) AS origen_movimiento,
                m.cantidad,
                m.stock_resultante,
                m.fecha_hora,
                m.observaciones,
                u.nombre AS nombre_usuario,
                u.primer_apellido AS apellido_usuario
            FROM movimiento_inventario m
            LEFT JOIN quimico q ON q.sigla = m.sigla_quimico
            LEFT JOIN tipo_movimiento_inventario tm ON tm.sigla = m.sigla_tipo_movimiento
            LEFT JOIN origen_movimiento om ON om.sigla = m.sigla_origen
            LEFT JOIN usuario u ON u.id_usuario = m.id_usuario
            {where_clause}
            ORDER BY m.fecha_hora DESC
            LIMIT %s
        """
        cur.execute(sql, tuple(params))
        movimientos = [serializar_dict(m) for m in cur.fetchall()]
        return movimientos
    finally:
        conn.close()
