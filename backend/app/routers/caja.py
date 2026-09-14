from __future__ import annotations

from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import get_connection, get_dict_cursor
from ..services.piscina_service import obtener_o_crear_jornada_hoy, serializar_dict

router = APIRouter(prefix="/api/caja", tags=["caja"])


# ───────────────────────── Schemas ─────────────────────────

class RegistroEntradaPayload(BaseModel):
    cantidad_tarifa_15: int = Field(0, ge=0, description="Personas con tarifa de 15 Bs")
    cantidad_tarifa_20: int = Field(0, ge=0, description="Personas con tarifa de 20 Bs")
    id_usuario: Optional[int] = None
    observaciones: Optional[str] = None


# ───────────────────────── Endpoints ─────────────────────────

@router.post("/registro", status_code=201)
async def registrar_entrada(payload: RegistroEntradaPayload):
    """
    Registra el ingreso de personas a la piscina.
    Acepta la cantidad de personas por tipo de tarifa (15 Bs o 20 Bs).
    """
    if payload.cantidad_tarifa_15 == 0 and payload.cantidad_tarifa_20 == 0:
        raise HTTPException(
            status_code=400,
            detail="Debe ingresar al menos una persona para registrar."
        )

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        cur = conn.cursor()

        fecha_hora = datetime.now()
        cur.execute(
            """
            INSERT INTO aforo_manual (
                id_jornada,
                id_usuario,
                hora_entrada,
                cantidad_tarifa_15,
                cantidad_tarifa_20,
                observaciones
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING
                id_registro,
                hora_entrada,
                cantidad_tarifa_15,
                cantidad_tarifa_20,
                total_personas,
                total_recaudado
            """,
            (
                id_jornada,
                payload.id_usuario,
                fecha_hora,
                payload.cantidad_tarifa_15,
                payload.cantidad_tarifa_20,
                payload.observaciones,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()

        return {
            "mensaje": "Ingreso registrado correctamente",
            "id_registro": row[0],
            "hora_entrada": row[1].isoformat() if row[1] else None,
            "cantidad_tarifa_15": row[2],
            "cantidad_tarifa_20": row[3],
            "total_personas": row[4],
            "total_recaudado": float(row[5]) if row[5] else 0.0,
        }
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("/historial")
async def obtener_historial():
    """
    Devuelve todos los registros de entrada de la jornada de hoy,
    junto con un resumen del total de personas y dinero recaudado.
    """
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        cur = get_dict_cursor(conn)

        fecha_hoy = date.today()
        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
            (fecha_hoy,)
        )
        jornada_row = cur.fetchone()

        if not jornada_row:
            return {
                "jornada_activa": False,
                "registros": [],
                "resumen": {
                    "total_personas": 0,
                    "total_tarifa_15": 0,
                    "total_tarifa_20": 0,
                    "total_recaudado": 0.0,
                    "cantidad_registros": 0,
                },
            }

        id_jornada = jornada_row["id_jornada"]

        cur.execute(
            """
            SELECT
                id_registro,
                hora_entrada,
                cantidad_tarifa_15,
                cantidad_tarifa_20,
                total_personas,
                total_recaudado,
                observaciones,
                creado_en
            FROM aforo_manual
            WHERE id_jornada = %s
            ORDER BY hora_entrada DESC
            """,
            (id_jornada,),
        )
        registros = [serializar_dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT
                COALESCE(SUM(total_personas), 0)     AS total_personas,
                COALESCE(SUM(cantidad_tarifa_15), 0) AS total_tarifa_15,
                COALESCE(SUM(cantidad_tarifa_20), 0) AS total_tarifa_20,
                COALESCE(SUM(total_recaudado), 0)    AS total_recaudado,
                COUNT(*)                             AS cantidad_registros
            FROM aforo_manual
            WHERE id_jornada = %s
            """,
            (id_jornada,),
        )
        resumen_row = cur.fetchone()

        return {
            "jornada_activa": True,
            "id_jornada": id_jornada,
            "fecha": date.today().isoformat(),
            "registros": registros,
            "resumen": serializar_dict(resumen_row),
        }

    finally:
        conn.close()
