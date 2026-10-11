from __future__ import annotations

import importlib
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from ..db import get_dict_cursor


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
    """Devuelve el id_jornada del día actual local, creándola si no existe."""
    fecha_hoy = date.today()
    cur = conn.cursor()
    cur.execute(
        "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
        (fecha_hoy,)
    )
    row = cur.fetchone()
    if row:
        cur.close()
        return row[0]

    cur.execute("INSERT INTO jornada (fecha) VALUES (%s) RETURNING id_jornada", (fecha_hoy,))
    id_jornada = cur.fetchone()[0]
    conn.commit()
    cur.close()
    return id_jornada


def recalcular_resumen(conn, id_jornada: int):
    """Recalcula y guarda el resumen diario a partir de las mediciones de la jornada."""
    cur = get_dict_cursor(conn)
    cur.execute(
        """
        SELECT ph, turbidez, temperatura
        FROM medicion
        WHERE id_jornada = %s
        ORDER BY fecha_hora ASC
        """,
        (id_jornada,),
    )
    rows = cur.fetchall()
    cur.close()

    # Cada variable usa solo sus valores válidos (un sensor caído deja NULL)
    phs   = [float(r["ph"])          for r in rows if r["ph"] is not None]
    turbs = [float(r["turbidez"])    for r in rows if r["turbidez"] is not None]
    temps = [float(r["temperatura"]) for r in rows if r["temperatura"] is not None]

    if not (phs or turbs or temps):
        return None

    def _prom(xs):
        return round(sum(xs) / len(xs), 3) if xs else None

    # Total de personas viene de aforo_manual (no de medicion)
    cur2 = conn.cursor()
    cur2.execute(
        "SELECT COALESCE(SUM(total_personas), 0) FROM aforo_manual WHERE id_jornada = %s",
        (id_jornada,),
    )
    total_personas = int(cur2.fetchone()[0])
    cur2.close()

    n = max(1, len(rows))
    nuevo = {
        "promedio_ph":          _prom(phs),
        "max_ph":               max(phs) if phs else None,
        "min_ph":               min(phs) if phs else None,
        "promedio_turbidez":    _prom(turbs),
        "max_turbidez":         max(turbs) if turbs else None,
        "promedio_temperatura": _prom(temps),
        "total_personas":       total_personas,
        "promedio_personas":    round(total_personas / n, 3),
        "pico_personas":        total_personas,
    }

    cur = conn.cursor()
    cur.execute("SELECT 1 FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
    existe = cur.fetchone() is not None

    if existe:
        cur.execute(
            """
            UPDATE resumen_diario SET
                promedio_ph = %s, max_ph = %s, min_ph = %s,
                promedio_turbidez = %s, max_turbidez = %s,
                promedio_temperatura = %s,
                total_personas = %s, promedio_personas = %s, pico_personas = %s
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


_MODULOS_PREDICCION = [
    "lstm.src.prediction.prediccion_service",
    "lstm_piscina",
    "lstm.src.prediction",
    "lstm.prediction",
    "backend.app.services.prediccion",
]


def _importar_modulo_prediccion():
    for name in _MODULOS_PREDICCION:
        try:
            return importlib.import_module(name)
        except ModuleNotFoundError:
            continue
    return None


def obtener_datos_prediccion(conn, id_jornada: int):
    """Lecturas (con hora) y aforos de la jornada, insumo para el modelo LSTM."""
    cur = get_dict_cursor(conn)
    cur.execute(
        """
        SELECT fecha_hora, ph, turbidez, temperatura
        FROM medicion
        WHERE id_jornada = %s
        ORDER BY fecha_hora ASC
        """,
        (id_jornada,),
    )
    mediciones = [dict(r) for r in cur.fetchall()]

    cur.execute(
        """
        SELECT fecha_hora, cantidad_personas
        FROM aforo_camara WHERE id_jornada = %s ORDER BY fecha_hora ASC
        """,
        (id_jornada,),
    )
    aforos_camara = [dict(r) for r in cur.fetchall()]

    aforos_manual = []
    try:
        cur.execute(
            """
            SELECT hora_entrada, total_personas
            FROM aforo_manual WHERE id_jornada = %s ORDER BY hora_entrada ASC
            """,
            (id_jornada,),
        )
        aforos_manual = [dict(r) for r in cur.fetchall()]
    except Exception:
        conn.rollback()
    cur.close()
    return mediciones, aforos_camara, aforos_manual


def obtener_perfil_historico(conn, dias: int = 30) -> Dict[str, Dict[int, float]]:
    """Promedio por hora de cada variable en las jornadas anteriores (forma típica del día)."""
    perfiles: Dict[str, Dict[int, float]] = {"ph": {}, "turbidez": {}, "temperatura": {}, "banistas": {}}
    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT EXTRACT(HOUR FROM m.fecha_hora)::int AS h,
                   AVG(CASE WHEN m.ph BETWEEN 0 AND 14 THEN m.ph END)                   AS ph,
                   AVG(CASE WHEN m.turbidez BETWEEN 0 AND 1000 THEN m.turbidez END)     AS turbidez,
                   AVG(CASE WHEN m.temperatura BETWEEN 0 AND 50 THEN m.temperatura END) AS temperatura
            FROM medicion m
            JOIN jornada j ON j.id_jornada = m.id_jornada
            WHERE j.fecha < CURRENT_DATE AND j.fecha >= CURRENT_DATE - %s
            GROUP BY 1
            """,
            (dias,),
        )
        for r in cur.fetchall():
            for var in ("ph", "turbidez", "temperatura"):
                if r[var] is not None:
                    perfiles[var][int(r["h"])] = float(r[var])

        cur.execute(
            """
            SELECT EXTRACT(HOUR FROM a.fecha_hora)::int AS h, AVG(a.cantidad_personas) AS banistas
            FROM aforo_camara a
            JOIN jornada j ON j.id_jornada = a.id_jornada
            WHERE j.fecha < CURRENT_DATE AND j.fecha >= CURRENT_DATE - %s
            GROUP BY 1
            """,
            (dias,),
        )
        for r in cur.fetchall():
            if r["banistas"] is not None:
                perfiles["banistas"][int(r["h"])] = float(r["banistas"])
        cur.close()
    except Exception as exc:
        conn.rollback()
        print(f"⚠️ No se pudo calcular el perfil histórico: {exc}")
    return perfiles


def _modulo_pronostico():
    try:
        return importlib.import_module("lstm.src.prediction.pronostico_sensores")
    except ModuleNotFoundError:
        return None


def estado_y_pronostico(conn, id_jornada: int, perfiles=None, datos=None):
    """Estado de cada sensor, valores estimados de los que fallaron y pronóstico hasta el cierre."""
    mod = _modulo_pronostico()
    if mod is None:
        return None
    mediciones, aforos_camara, _ = datos or obtener_datos_prediccion(conn, id_jornada)
    if perfiles is None:
        perfiles = obtener_perfil_historico(conn)
    ahora = datetime.now()
    estado = mod.detectar_fallas(mediciones, ahora=ahora)
    return {
        "estado_sensores": estado,
        "valores_estimados": mod.valores_estimados_actuales(mediciones, estado, perfiles, ahora=ahora),
        "pronostico": mod.pronosticar_dia(mediciones, aforos_camara, perfiles, ahora=ahora),
        "usa_perfil_historico": any(perfiles.get(v) for v in ("ph", "turbidez", "temperatura")),
    }


def detalle_franjas(conn, id_jornada: int, perfiles=None, datos=None):
    """Estado de las franjas 08:00/12:00/16:00 (sin ejecutar el modelo)."""
    module = _importar_modulo_prediccion()
    if module is None or not hasattr(module, "seleccionar_franjas"):
        return None
    mediciones, aforos_camara, aforos_manual = datos or obtener_datos_prediccion(conn, id_jornada)
    if not mediciones:
        return None
    if perfiles is None:
        perfiles = obtener_perfil_historico(conn)
    franjas = module.seleccionar_franjas(mediciones, aforos_camara, aforos_manual, perfiles=perfiles)
    capturadas = sum(1 for f in franjas if f["capturada"])
    return {
        "franjas": franjas,
        "franjas_capturadas": capturadas,
        "tipo": "final" if capturadas == len(franjas) else "parcial",
    }


def correr_prediccion(conn, id_jornada: int, resumen: dict):
    try:
        module = _importar_modulo_prediccion()

        if module is None:
            return None, "No existe módulo de predicción LSTM en el proyecto"

        if not hasattr(module, "predecir_cierre_dia") or not hasattr(module, "guardar_prediccion_db"):
            return None, "El módulo LSTM no expone las funciones esperadas"

        mediciones, aforos_camara, aforos_manual = obtener_datos_prediccion(conn, id_jornada)

        if not mediciones:
            return None, "Sin datos suficientes para predecir"

        perfiles = obtener_perfil_historico(conn)

        try:
            resultado = module.predecir_cierre_dia(
                mediciones_parciales=mediciones,
                resumen_parcial=resumen or {},
                aforos_camara=aforos_camara,
                aforos_manual=aforos_manual,
                perfiles=perfiles,
            )
            module.guardar_prediccion_db(id_jornada, resultado, conn=conn)
            return resultado, None
        except Exception as exc:
            return None, str(exc)
    except Exception as exc:
        return None, f"lstm_piscina no disponible: {exc}"
