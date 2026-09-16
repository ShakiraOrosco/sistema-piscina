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


@router.post("/compras", status_code=201)
def registrar_compra(payload: RegistrarCompraPayload):
    """
    Registra la compra o ingreso de un químico:
    1. Aumenta el `stock_actual` en la tabla `quimico`.
    2. Registra el movimiento en `movimiento_inventario` (ENT, COM).
    """
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            "SELECT id_quimico, nombre, sigla, stock_actual, unidad_medida FROM quimico WHERE sigla = %s AND activo = TRUE",
            (payload.sigla_quimico.upper(),),
        )
        quimico = cur.fetchone()
        if not quimico:
            raise HTTPException(status_code=404, detail="Químico no encontrado")

        nuevo_stock = float(quimico["stock_actual"]) + payload.cantidad

        cur = conn.cursor()
        # 1. Actualizar stock del químico
        cur.execute(
            "UPDATE quimico SET stock_actual = %s WHERE sigla = %s",
            (nuevo_stock, payload.sigla_quimico.upper()),
        )

        # 2. Registrar movimiento de inventario (ENT = Entrada, COM = Compra)
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
            ) VALUES (%s, 'ENT', 'COM', %s, %s, %s, %s, %s)
            RETURNING id_movimiento
            """,
            (
                payload.sigla_quimico.upper(),
                payload.cantidad,
                nuevo_stock,
                payload.id_usuario,
                datetime.now(),
                payload.observaciones or "Ingreso por compra de insumos",
            ),
        )
        id_mov = cur.fetchone()[0]
        conn.commit()

        return {
            "mensaje": f"Compra registrada: +{payload.cantidad} {quimico['unidad_medida']} de {quimico['nombre']}",
            "id_movimiento": id_mov,
            "stock_anterior": float(quimico["stock_actual"]),
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


@router.get("/movimientos")
def listar_movimientos():
    """Historial de movimientos de inventario."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT 
                m.id_movimiento,
                m.sigla_quimico,
                q.nombre AS nombre_quimico,
                q.unidad_medida,
                m.sigla_tipo_movimiento,
                tm.nombre AS tipo_movimiento,
                m.sigla_origen,
                om.nombre AS origen_movimiento,
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
            ORDER BY m.fecha_hora DESC
            LIMIT 50
            """
        )
        movimientos = [serializar_dict(m) for m in cur.fetchall()]
        return movimientos
    finally:
        conn.close()
