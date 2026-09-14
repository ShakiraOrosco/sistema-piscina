from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..db import get_connection, get_dict_cursor
from ..services.piscina_service import (
    correr_prediccion,
    obtener_o_crear_jornada_hoy,
    recalcular_resumen,
    serializar_dict,
)

router = APIRouter()


@router.get("/")
async def root():
    return {"mensaje": "Sistema de piscina funcionando"}


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/lecturas", status_code=201)
async def crear_lectura(payload: Dict[str, Any]):
    """Recibe una lectura del sensor IoT y la guarda en la tabla `medicion`."""
    if payload is None:
        raise HTTPException(status_code=400, detail="Se requiere un cuerpo JSON")

    if "turbidez" not in payload and "ntu" in payload:
        payload["turbidez"] = payload["ntu"]

    campos_obligatorios = ["ph", "turbidez", "temperatura"]
    faltantes = [campo for campo in campos_obligatorios if campo not in payload]
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Faltan campos: {faltantes}")

    try:
        ph          = float(payload["ph"])
        turbidez    = float(payload["turbidez"])
        temperatura = float(payload["temperatura"])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Valor inválido: {exc}") from exc

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        cur = conn.cursor()
        fecha_hora = datetime.now()
        cur.execute(
            """
            INSERT INTO medicion (id_jornada, fecha_hora, ph, turbidez, temperatura)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id_medicion
            """,
            (id_jornada, fecha_hora, ph, turbidez, temperatura),
        )
        id_medicion = cur.fetchone()[0]
        conn.commit()
        cur.close()

        return {
            "mensaje": "Lectura guardada correctamente",
            "id": id_medicion,
            "id_jornada": id_jornada,
        }
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("/lecturas")
async def obtener_lecturas():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT id_medicion, id_jornada, fecha_hora, ph, turbidez, temperatura
            FROM medicion
            ORDER BY fecha_hora DESC
            LIMIT 50
            """
        )
        resultados = [serializar_dict(r) for r in cur.fetchall()]
        return resultados
    finally:
        conn.close()


@router.get("/api/estado_actual")
async def estado_actual():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        cur = conn.cursor()
        fecha_hoy = date.today()
        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
            (fecha_hoy,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")

        id_jornada = row[0]
        cur = get_dict_cursor(conn)

        cur.execute(
            """
            SELECT fecha_hora, ph, turbidez, temperatura
            FROM medicion
            WHERE id_jornada = %s
            ORDER BY fecha_hora DESC LIMIT 1
            """,
            (id_jornada,),
        )
        med = cur.fetchone()

        # Total personas desde aforo_manual
        cur.execute(
            "SELECT COALESCE(SUM(total_personas),0) AS personas FROM aforo_manual WHERE id_jornada = %s",
            (id_jornada,),
        )
        personas_row = cur.fetchone()

        cur.execute("SELECT * FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
        resumen_row = cur.fetchone()

        cur.execute(
            """
            SELECT aluminio_pred, cobre_pred, cloro_pred, fecha_prediccion
            FROM prediccion
            WHERE id_jornada = %s
            ORDER BY fecha_prediccion DESC LIMIT 1
            """,
            (id_jornada,),
        )
        pred = cur.fetchone()

        cur.execute(
            """
            SELECT fecha_hora, ph, turbidez, temperatura
            FROM medicion
            WHERE id_jornada = %s
            ORDER BY fecha_hora ASC
            """,
            (id_jornada,),
        )
        historial = [serializar_dict(r) for r in cur.fetchall()]

        return {
            "id_jornada": id_jornada,
            "fecha": date.today().isoformat(),
            "ultima_medicion": serializar_dict(med),
            "personas_hoy": int(personas_row["personas"]) if personas_row else 0,
            "resumen": serializar_dict(resumen_row),
            "prediccion": serializar_dict(pred),
            "historial": historial,
            "timestamp": datetime.now().isoformat(),
        }
    finally:
        conn.close()


@router.post("/api/predecir")
async def predecir_ahora():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = CURRENT_DATE ORDER BY id_jornada DESC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")
        id_jornada = row[0]

        cur = get_dict_cursor(conn)
        cur.execute("SELECT * FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
        resumen = cur.fetchone()
        if not resumen:
            raise HTTPException(status_code=400, detail="Sin datos suficientes para predecir")

        resultado, error_lstm = correr_prediccion(conn, id_jornada, dict(resumen))
        if error_lstm:
            raise HTTPException(status_code=500, detail=error_lstm)
        return resultado
    finally:
        conn.close()


@router.get("/api/alertas")
async def alertas():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT m.ph, m.turbidez, m.temperatura, m.fecha_hora
            FROM medicion m
            JOIN jornada j ON j.id_jornada = m.id_jornada
            WHERE j.fecha = CURRENT_DATE
            ORDER BY m.fecha_hora DESC LIMIT 1
            """
        )
        row = cur.fetchone()

        alertas_list = []
        if row:
            ph   = float(row["ph"]   or 0)
            turb = float(row["turbidez"] or 0)
            temp = float(row["temperatura"] or 0)

            if ph < 7.0:
                alertas_list.append({"tipo": "danger",  "msg": f"pH bajo: {ph:.2f} — riesgo para bañistas"})
            elif ph > 7.6:
                alertas_list.append({"tipo": "warning", "msg": f"pH elevado: {ph:.2f} — monitorear"})

            if turb > 10:
                alertas_list.append({"tipo": "danger",  "msg": f"Turbidez crítica: {turb:.1f} NTU"})
            elif turb > 5:
                alertas_list.append({"tipo": "warning", "msg": f"Turbidez alta: {turb:.1f} NTU"})

            if temp > 32:
                alertas_list.append({"tipo": "warning", "msg": f"Temperatura elevada: {temp:.1f} °C"})

        if not alertas_list:
            alertas_list.append({"tipo": "ok", "msg": "Todos los parámetros dentro del rango normal"})

        return alertas_list
    finally:
        conn.close()
