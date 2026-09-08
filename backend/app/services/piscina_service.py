from __future__ import annotations

import importlib
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from backend.app.db import get_dict_cursor


def serializable(obj):
    if obj is None:
        return None
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if hasattr(obj, "__float__"):
        return float(obj)
    return str(obj)


def serializar_dict(d):
    if d is None:
        return None
    return {k: (serializable(v) if v is not None else None) for k, v in d.items()}


def obtener_o_crear_jornada_hoy(conn):
    cur = conn.cursor()
    cur.execute(
        "SELECT id_jornada FROM jornadas WHERE fecha = CURRENT_DATE ORDER BY id_jornada DESC LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        cur.close()
        return row[0]

    cur.execute("INSERT INTO jornadas (fecha) VALUES (CURRENT_DATE) RETURNING id_jornada")
    id_jornada = cur.fetchone()[0]
    conn.commit()
    cur.close()
    return id_jornada


def recalcular_resumen(conn, id_jornada: int):
    cur = get_dict_cursor(conn)
    cur.execute(
        """
        SELECT ph, turbidez, temperatura, personas
        FROM mediciones
        WHERE id_jornada = %s AND ph IS NOT NULL
        ORDER BY fecha_hora ASC
        """,
        (id_jornada,),
    )
    rows = cur.fetchall()
    cur.close()

    if not rows:
        return None

    phs = [float(r["ph"]) for r in rows]
    turbs = [float(r["turbidez"]) for r in rows]
    temps = [float(r["temperatura"]) for r in rows]
    pers = [int(r["personas"] or 0) for r in rows]

    nuevo = {
        "promedio_ph": round(sum(phs) / len(phs), 3),
        "max_ph": max(phs),
        "min_ph": min(phs),
        "promedio_turbidez": round(sum(turbs) / len(turbs), 3),
        "max_turbidez": max(turbs),
        "promedio_temperatura": round(sum(temps) / len(temps), 3),
        "total_personas": sum(pers),
        "promedio_personas": round(sum(pers) / len(pers), 3),
        "pico_personas": max(pers),
    }

    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM resumen_diario WHERE id_jornada = %s",
        (id_jornada,),
    )
    existe = cur.fetchone() is not None

    if existe:
        cur.execute(
            """
            UPDATE resumen_diario SET
                promedio_ph = %s,
                max_ph = %s,
                min_ph = %s,
                promedio_turbidez = %s,
                max_turbidez = %s,
                promedio_temperatura = %s,
                total_personas = %s,
                promedio_personas = %s,
                pico_personas = %s
            WHERE id_jornada = %s
            """,
            (
                nuevo["promedio_ph"], nuevo["max_ph"], nuevo["min_ph"],
                nuevo["promedio_turbidez"], nuevo["max_turbidez"],
                nuevo["promedio_temperatura"],
                nuevo["total_personas"], nuevo["promedio_personas"], nuevo["pico_personas"],
                id_jornada,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO resumen_diario (
                id_jornada,
                promedio_ph, max_ph, min_ph,
                promedio_turbidez, max_turbidez,
                promedio_temperatura,
                total_personas, promedio_personas, pico_personas
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                id_jornada,
                nuevo["promedio_ph"], nuevo["max_ph"], nuevo["min_ph"],
                nuevo["promedio_turbidez"], nuevo["max_turbidez"],
                nuevo["promedio_temperatura"],
                nuevo["total_personas"], nuevo["promedio_personas"], nuevo["pico_personas"],
            ),
        )

    conn.commit()
    cur.close()
    return nuevo


def correr_prediccion(conn, id_jornada: int, resumen: dict):
    try:
        candidates = [
            "lstm_piscina",
            "lstm.src.prediction",
            "lstm.prediction",
            "backend.app.services.prediccion",
        ]
        module = None
        for name in candidates:
            try:
                module = importlib.import_module(name)
                break
            except ModuleNotFoundError:
                continue

        if module is None:
            return None, "No existe módulo de predicción LSTM en el proyecto"

        if not hasattr(module, "predecir_cierre_dia") or not hasattr(module, "guardar_prediccion_db"):
            return None, "El módulo LSTM no expone las funciones esperadas"

        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT ph, turbidez, temperatura, personas
            FROM mediciones WHERE id_jornada = %s ORDER BY fecha_hora ASC
            """,
            (id_jornada,),
        )
        mediciones = [dict(r) for r in cur.fetchall()]
        cur.close()

        if not mediciones or not resumen:
            return None, "Sin datos suficientes para predecir"

        try:
            resultado = module.predecir_cierre_dia(
                mediciones_parciales=mediciones,
                resumen_parcial=resumen,
            )
            module.guardar_prediccion_db(id_jornada, resultado, conn=conn)
            return resultado, None
        except Exception as exc:
            return None, str(exc)
    except Exception as exc:
        return None, f"lstm_piscina no disponible: {exc}"
