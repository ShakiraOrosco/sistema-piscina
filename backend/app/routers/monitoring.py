from __future__ import annotations

import time
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from ..db import get_connection, get_dict_cursor
from ..services.dosificacion_service import dosificacion_manager
from ..services.notificacion_service import (
    actualizar_config_notificaciones,
    limpiar_cooldown_falla,
    notificar_falla_dispositivo,
    obtener_config_notificaciones,
)
from ..services.piscina_service import (
    correr_prediccion,
    detalle_franjas,
    estado_y_pronostico,
    obtener_datos_prediccion,
    obtener_perfil_historico,
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
def crear_lectura(payload: Dict[str, Any]):
    """Recibe una lectura del sensor IoT, la guarda en `medicion` y dispara la predicción LSTM.

    Cuerpo esperado: {"ph": 7.2, "turbidez": 4.1, "temperatura": 28.0, "personas": 30}
    ("personas" es opcional; si llega se guarda en `aforo_camara`).
    """
    if payload is None:
        raise HTTPException(status_code=400, detail="Se requiere un cuerpo JSON")

    if "turbidez" not in payload and "ntu" in payload:
        payload["turbidez"] = payload["ntu"]

    # Un sensor que falla puede no enviar su campo, enviar null o un valor
    # fuera de rango: se guarda NULL y luego el sistema estima ese valor.
    rangos = {"ph": (0.0, 14.0), "turbidez": (0.0, 1000.0), "temperatura": (0.0, 50.0)}
    valores: Dict[str, Any] = {}
    sensores_fallidos = []
    for campo, (lo, hi) in rangos.items():
        try:
            v = float(payload.get(campo)) if payload.get(campo) is not None else None
        except (TypeError, ValueError):
            v = None
        if v is None or not (lo <= v <= hi):
            sensores_fallidos.append(campo)
            v = None
        valores[campo] = v

    if len(sensores_fallidos) == len(rangos):
        notificar_falla_dispositivo(
            clave_falla="monitoreo_todos_sensores_fallidos",
            titulo="Falla general en estación de sensores de monitoreo (pH, Turbidez, Temperatura)",
            modulo="Monitoreo",
            dispositivo="Nodo ESP32 de Sensores Físicos",
            detalle=f"La estación de monitoreo envió una lectura sin ningún valor válido: {payload}",
        )
        raise HTTPException(status_code=400, detail="La lectura no contiene ningún valor válido de sensor")

    # Si algún sensor individual falló en esta lectura, enviar alerta por Correo y WhatsApp
    nombres_legibles = {"ph": "pH", "turbidez": "Turbidez", "temperatura": "Temperatura"}
    for campo_ok in rangos:
        if campo_ok not in sensores_fallidos:
            limpiar_cooldown_falla(f"sensor_{campo_ok}_sin_dato")
            limpiar_cooldown_falla(f"sensor_{campo_ok}_fuera_rango")
            limpiar_cooldown_falla(f"sensor_{campo_ok}_sin_conexion")
    for campo_fallido in sensores_fallidos:
        val_recibido = payload.get(campo_fallido)
        motivo_str = "no envió dato (NULL)" if val_recibido is None else f"envió un valor fuera de rango ({val_recibido})"
        tipo_clave = "sin_dato" if val_recibido is None else "fuera_rango"
        nom_s = nombres_legibles.get(campo_fallido, campo_fallido)
        notificar_falla_dispositivo(
            clave_falla=f"sensor_{campo_fallido}_{tipo_clave}",
            titulo=f"Falla en Sensor de {nom_s}",
            modulo="Monitoreo",
            dispositivo=f"Sensor de {nom_s} (ESP32)",
            detalle=f"El sensor de {nom_s} {motivo_str}. El sistema está utilizando estimación inteligente para mantener el monitoreo continuo.",
        )

    ph, turbidez, temperatura = valores["ph"], valores["turbidez"], valores["temperatura"]

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        cur = conn.cursor()
        
        # Usar hora local del sistema por defecto, o la del payload si el simulador la envía
        if "fecha_hora" in payload:
            try:
                fecha_hora = datetime.fromisoformat(payload["fecha_hora"].replace("Z", ""))
            except ValueError:
                fecha_hora = datetime.now()
        else:
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

        if payload.get("personas") is not None:
            try:
                personas = int(payload["personas"])
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO aforo_camara (id_jornada, fecha_hora, cantidad_personas, id_dispositivo)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (id_jornada, fecha_hora, personas, str(payload.get("id_dispositivo", "ESP32"))),
                )
                conn.commit()
                cur.close()
            except (TypeError, ValueError):
                pass

        # Igual que el proyecto de referencia: cada lectura nueva actualiza
        # el resumen del día y genera una nueva predicción LSTM.
        respuesta = {
            "mensaje": "Lectura guardada correctamente",
            "id": id_medicion,
            "id_jornada": id_jornada,
            "sensores_fallidos": sensores_fallidos,
        }
        try:
            resumen = recalcular_resumen(conn, id_jornada)
            prediccion, error_lstm = correr_prediccion(conn, id_jornada, resumen or {})
        except Exception as exc:  # la lectura ya quedó guardada
            conn.rollback()
            resumen, prediccion, error_lstm = None, None, str(exc)

        respuesta["resumen_actualizado"] = resumen
        respuesta["prediccion"] = prediccion
        if error_lstm:
            respuesta["advertencia_lstm"] = error_lstm
        return respuesta
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/api/v1/aforo-camara", status_code=201)
@router.post("/api/aforo-camara", status_code=201)
def registrar_aforo_camara(payload: Dict[str, Any]):
    """Guarda una lectura del aforo detectado por la cámara inteligente en `aforo_camara`."""
    if payload is None or "cantidad_personas" not in payload:
        raise HTTPException(status_code=400, detail="Se requiere el campo 'cantidad_personas'")

    try:
        cantidad = int(payload["cantidad_personas"])
        id_dispositivo = str(payload.get("id_dispositivo", "ESP32-CAM"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Valor de cantidad inválido: {exc}") from exc

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        cur = conn.cursor()
        fecha_hora = datetime.now()
        cur.execute(
            """
            INSERT INTO aforo_camara (id_jornada, fecha_hora, cantidad_personas, id_dispositivo)
            VALUES (%s, %s, %s, %s)
            RETURNING id_registro
            """,
            (id_jornada, fecha_hora, cantidad, id_dispositivo),
        )
        id_registro = cur.fetchone()[0]
        conn.commit()
        cur.close()

        return {
            "mensaje": "Aforo de cámara registrado correctamente",
            "id_registro": id_registro,
            "id_jornada": id_jornada,
            "cantidad_personas": cantidad,
        }
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("/api/v1/aforo-camara/historial")
@router.get("/api/aforo-camara/historial")
def historial_aforo_camara():
    """Devuelve el historial de registros detectados por la cámara inteligente para la jornada de hoy."""
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
                    "ultimo_conteo": 0,
                    "pico_personas": 0,
                    "promedio_personas": 0.0,
                    "total_registros": 0,
                },
            }

        id_jornada = jornada_row["id_jornada"]

        cur.execute(
            """
            SELECT id_registro, fecha_hora, cantidad_personas, id_dispositivo, creado_en
            FROM aforo_camara
            WHERE id_jornada = %s
            ORDER BY fecha_hora DESC
            """,
            (id_jornada,),
        )
        registros = [serializar_dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT
                COALESCE(MAX(cantidad_personas), 0)                      AS pico_personas,
                COALESCE(ROUND(AVG(cantidad_personas)::numeric, 1), 0.0) AS promedio_personas,
                COUNT(*)                                                 AS total_registros
            FROM aforo_camara
            WHERE id_jornada = %s
            """,
            (id_jornada,),
        )
        cam_stats = cur.fetchone() or {}

        ultimo_conteo = registros[0]["cantidad_personas"] if registros else 0

        resumen = {
            "ultimo_conteo": ultimo_conteo,
            "pico_personas": int(cam_stats.get("pico_personas") or 0),
            "promedio_personas": float(cam_stats.get("promedio_personas") or 0.0),
            "total_registros": int(cam_stats.get("total_registros") or 0),
        }

        return {
            "jornada_activa": True,
            "id_jornada": id_jornada,
            "fecha": fecha_hoy.isoformat(),
            "resumen": resumen,
            "registros": registros,
        }
    finally:
        conn.close()


@router.get("/api/v1/aforo-manual/historial")
@router.get("/api/aforo-manual/historial")
def historial_aforo_manual(fecha: Optional[str] = None):
    """Devuelve el historial de ingresos manuales (taquilla) para la jornada seleccionada (o la de hoy)."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        cur = get_dict_cursor(conn)
        if fecha:
            try:
                fecha_obj = datetime.strptime(fecha.strip(), "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")
        else:
            fecha_obj = date.today()

        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
            (fecha_obj,)
        )
        jornada_row = cur.fetchone()

        if jornada_row:
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
                "fecha": fecha_obj.isoformat(),
                "registros": registros,
                "resumen": serializar_dict(resumen_row),
            }

        # Fallback a fecha de hora_entrada si no existe jornada registrada
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
            WHERE DATE(hora_entrada) = %s
            ORDER BY hora_entrada DESC
            """,
            (fecha_obj,),
        )
        registros_directos = [serializar_dict(r) for r in cur.fetchall()]
        if registros_directos:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(total_personas), 0)     AS total_personas,
                    COALESCE(SUM(cantidad_tarifa_15), 0) AS total_tarifa_15,
                    COALESCE(SUM(cantidad_tarifa_20), 0) AS total_tarifa_20,
                    COALESCE(SUM(total_recaudado), 0)    AS total_recaudado,
                    COUNT(*)                             AS cantidad_registros
                FROM aforo_manual
                WHERE DATE(hora_entrada) = %s
                """,
                (fecha_obj,),
            )
            resumen_directo = cur.fetchone()
            return {
                "jornada_activa": False,
                "id_jornada": None,
                "fecha": fecha_obj.isoformat(),
                "registros": registros_directos,
                "resumen": serializar_dict(resumen_directo),
            }

        return {
            "jornada_activa": False,
            "id_jornada": None,
            "fecha": fecha_obj.isoformat(),
            "registros": [],
            "resumen": {
                "total_personas": 0,
                "total_tarifa_15": 0,
                "total_tarifa_20": 0,
                "total_recaudado": 0.0,
                "cantidad_registros": 0,
            },
        }
    finally:
        conn.close()


@router.get("/api/v1/camera/roi")
@router.get("/api/camera/roi")
async def obtener_geocerca_roi():
    """Obtiene la configuración de la geocerca (delimitación del área de piscina)."""
    try:
        from detector_camara import load_roi_config
    except ImportError:
        from backend.detector_camara import load_roi_config
    return load_roi_config()


@router.post("/api/v1/camera/roi")
@router.post("/api/camera/roi")
async def actualizar_geocerca_roi(payload: Dict[str, Any]):
    """Actualiza la configuración del polígono de la geocerca de la piscina."""
    try:
        from detector_camara import save_roi_config
    except ImportError:
        from backend.detector_camara import save_roi_config
    if not payload:
        raise HTTPException(status_code=400, detail="Se requieren datos JSON")
    
    save_roi_config(payload)
    return {"mensaje": "Configuración de geocerca actualizada correctamente", "roi": payload}




@router.get("/lecturas")
def obtener_lecturas():
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


@router.post("/api/dosificacion_parcial", status_code=201)
def registrar_dosificacion_parcial(payload: Dict[str, Any]):
    if not payload or "quimico" not in payload or "cantidad_g" not in payload:
        raise HTTPException(status_code=400, detail="Se requiere quimico y cantidad_g")
    
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    
    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO dosificacion_parcial (id_jornada, fecha_hora, quimico, cantidad_g)
            VALUES (%s, CURRENT_TIMESTAMP, %s, %s)
            RETURNING id_parcial
            """,
            (id_jornada, payload["quimico"], float(payload["cantidad_g"]))
        )
        id_parcial = cur.fetchone()[0]
        conn.commit()
        return {"mensaje": "Dosificación parcial registrada", "id_parcial": id_parcial}
    finally:
        conn.close()


@router.get("/api/estado_actual")
def estado_actual():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        id_jornada = _id_jornada_hoy(conn)
        if not id_jornada:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")

        cur = get_dict_cursor(conn)

        # 1. Mediciones de hoy (una sola consulta para historial, última lectura y datos LSTM)
        cur.execute(
            """
            SELECT fecha_hora, ph, turbidez, temperatura
            FROM medicion
            WHERE id_jornada = %s
            ORDER BY fecha_hora ASC
            """,
            (id_jornada,),
        )
        med_rows = [dict(r) for r in cur.fetchall()]
        med = med_rows[-1] if med_rows else None
        historial = [serializar_dict(r) for r in med_rows]

        # 2. Resumen diario y predicción
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

        # 3. Dosis parciales aplicadas hoy
        cur.execute(
            """
            SELECT quimico, COALESCE(SUM(cantidad_g), 0) as total, MAX(fecha_hora) as ultima_hora
            FROM dosificacion_parcial
            WHERE id_jornada = %s
            GROUP BY quimico
            """,
            (id_jornada,)
        )
        parcial_rows = cur.fetchall()
        dosis_aplicadas = {r["quimico"].lower(): float(r["total"]) for r in parcial_rows}
        ultimas_horas_dosis = {r["quimico"].lower(): r["ultima_hora"] for r in parcial_rows}

        # 4. Aforo Manual (una sola consulta, resumen calculado en memoria)
        cur.execute(
            """
            SELECT id_registro, hora_entrada, cantidad_tarifa_15, cantidad_tarifa_20,
                   total_personas, total_recaudado, observaciones, creado_en
            FROM aforo_manual
            WHERE id_jornada = %s
            ORDER BY hora_entrada DESC
            """,
            (id_jornada,),
        )
        man_rows = [dict(r) for r in cur.fetchall()]
        aforo_manual_registros = [serializar_dict(r) for r in man_rows]
        aforo_manual = sum(int(r.get("total_personas") or 0) for r in man_rows)
        aforo_manual_resumen = {
            "total_personas": float(aforo_manual),
            "total_tarifa_15": float(sum(int(r.get("cantidad_tarifa_15") or 0) for r in man_rows)),
            "total_tarifa_20": float(sum(int(r.get("cantidad_tarifa_20") or 0) for r in man_rows)),
            "total_recaudado": float(sum(float(r.get("total_recaudado") or 0) for r in man_rows)),
            "cantidad_registros": float(len(man_rows)),
        }

        # 5. Aforo Cámara Inteligente (una sola consulta, resumen calculado en memoria)
        cur.execute(
            """
            SELECT id_registro, fecha_hora, cantidad_personas, id_dispositivo, creado_en
            FROM aforo_camara
            WHERE id_jornada = %s
            ORDER BY fecha_hora DESC
            """,
            (id_jornada,),
        )
        cam_rows = [dict(r) for r in cur.fetchall()]
        aforo_camara_registros = [serializar_dict(r) for r in cam_rows]
        aforo_camara = int(cam_rows[0]["cantidad_personas"]) if cam_rows else 0
        conteos_cam = [int(r.get("cantidad_personas") or 0) for r in cam_rows]
        aforo_camara_resumen = {
            "ultimo_conteo": aforo_camara,
            "pico_personas": max(conteos_cam) if conteos_cam else 0,
            "promedio_personas": round(sum(conteos_cam) / len(conteos_cam), 1) if conteos_cam else 0.0,
            "total_registros": len(cam_rows),
        }

        # Reusar datos ya consultados sin hacer 3 queries extra en obtener_datos_prediccion
        datos = (
            med_rows,
            [{"fecha_hora": r["fecha_hora"], "cantidad_personas": r["cantidad_personas"]} for r in reversed(cam_rows)],
            [{"hora_entrada": r["hora_entrada"], "total_personas": r["total_personas"]} for r in reversed(man_rows)],
        )
        perfiles = obtener_perfil_historico(conn)

        try:
            franjas_info = detalle_franjas(conn, id_jornada, perfiles=perfiles, datos=datos)
        except Exception:
            conn.rollback()
            franjas_info = None

        try:
            sensores_info = estado_y_pronostico(conn, id_jornada, perfiles=perfiles, datos=datos) or {}
        except Exception as exc:
            print(f"⚠️ No se pudo calcular el pronóstico: {exc}")
            sensores_info = {}

        _snapshot_dashboard["ts"] = time.monotonic()
        _snapshot_dashboard["data"] = {
            "id_jornada": id_jornada,
            "mediciones": med_rows,
            "sensores_info": sensores_info,
            "pred": dict(pred) if pred else None,
            "aforo_camara": aforo_camara,
            "dosis_aplicadas": dict(dosis_aplicadas),
            "ultimas_horas": dict(ultimas_horas_dosis),
        }

        return {
            "id_jornada": id_jornada,
            "fecha": date.today().isoformat(),
            "ultima_medicion": serializar_dict(med),
            "aforo_manual": aforo_manual,
            "aforo_camara": aforo_camara,
            "personas_hoy": aforo_manual,
            "aforo_manual_registros": aforo_manual_registros,
            "aforo_manual_resumen": aforo_manual_resumen,
            "aforo_camara_registros": aforo_camara_registros,
            "aforo_camara_resumen": aforo_camara_resumen,
            "resumen": serializar_dict(resumen_row),
            "prediccion": serializar_dict(pred),
            "dosis_aplicadas": dosis_aplicadas,
            "prediccion_detalle": franjas_info,
            "estado_sensores": sensores_info.get("estado_sensores"),
            "valores_estimados": sensores_info.get("valores_estimados", {}),
            "pronostico": sensores_info.get("pronostico", {}),
            "historial": historial,
            "timestamp": datetime.now().isoformat(),
        }
    finally:
        conn.close()


@router.post("/api/predecir")
def predecir_ahora():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        id_jornada = _id_jornada_hoy(conn)
        if not id_jornada:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")

        resumen = recalcular_resumen(conn, id_jornada)
        if not resumen:
            raise HTTPException(status_code=400, detail="Sin datos suficientes para predecir")

        resultado, error_lstm = correr_prediccion(conn, id_jornada, resumen)
        if error_lstm:
            raise HTTPException(status_code=500, detail=error_lstm)
        return resultado
    finally:
        conn.close()


def _id_jornada_hoy(conn):
    try:
        return obtener_o_crear_jornada_hoy(conn)
    except Exception:
        cur = conn.cursor()
        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
            (date.today(),)
        )
        row = cur.fetchone()
        cur.close()
        return row[0] if row else None


@router.get("/api/pronostico")
def pronostico():
    """Pronóstico hora a hora (hasta las 20:00) de pH, turbidez, temperatura y bañistas,
    más el estado de cada sensor y el valor estimado de los que fallaron."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")
    try:
        id_jornada = _id_jornada_hoy(conn)
        if id_jornada is None:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")
        info = estado_y_pronostico(conn, id_jornada)
        if info is None:
            raise HTTPException(status_code=500, detail="Módulo de pronóstico no disponible")
        return {"id_jornada": id_jornada, **info}
    finally:
        conn.close()


NOMBRES_SENSOR = {"ph": "pH", "turbidez": "turbidez", "temperatura": "temperatura"}
MOTIVOS_FALLA = {
    "sin_dato": "no envió dato",
    "fuera_rango": "envió un valor fuera de rango",
    "sin_conexion": "sin conexión",
}

_snapshot_dashboard: Dict[str, Any] = {"ts": 0.0, "data": None}


def _construir_alertas_desde_datos(
    mediciones: list,
    info: Optional[Dict[str, Any]],
    pred_dict: Optional[Dict[str, Any]],
    aforo_actual: int,
    aplicadas: Dict[str, float],
    ultimas_horas: Dict[str, Any],
) -> list:
    alertas_list = []
    if info and info.get("estado_sensores"):
        estado = info["estado_sensores"]
        estimados = info.get("valores_estimados") or {}
        actuales = {}
        for var, nombre in NOMBRES_SENSOR.items():
            e = estado[var]["estado"]
            if e in MOTIVOS_FALLA:
                est = estimados.get(var)
                extra = f" — usando valor estimado {est['valor']:.2f}" if est else ""
                msg_falla = f"Sensor de {nombre} {MOTIVOS_FALLA[e]}{extra}"
                alertas_list.append({
                    "tipo": "warning",
                    "msg": msg_falla,
                })
                notificar_falla_dispositivo(
                    clave_falla=f"sensor_{var}_{e}",
                    titulo=f"Falla en Sensor de {nombre} ({MOTIVOS_FALLA[e]})",
                    modulo="Monitoreo",
                    dispositivo=f"Sensor de {nombre} (ESP32)",
                    detalle=msg_falla,
                )
                if est:
                    actuales[var] = est["valor"]
            else:
                limpiar_cooldown_falla(f"sensor_{var}_sin_dato")
                limpiar_cooldown_falla(f"sensor_{var}_fuera_rango")
                limpiar_cooldown_falla(f"sensor_{var}_sin_conexion")
                for m in reversed(mediciones):
                    if m.get(var) is not None:
                        actuales[var] = float(m[var])
                        break

        ph, turb, temp = actuales.get("ph"), actuales.get("turbidez"), actuales.get("temperatura")

        if ph is not None:
            if ph < 7.0:
                alertas_list.append({"tipo": "danger",  "msg": f"pH bajo: {ph:.2f} — riesgo para bañistas"})
            elif ph > 7.6:
                alertas_list.append({"tipo": "warning", "msg": f"pH elevado: {ph:.2f} — monitorear"})

        if turb is not None:
            if turb > 10:
                alertas_list.append({"tipo": "danger",  "msg": f"Turbidez crítica: {turb:.1f} NTU"})
            elif turb > 5:
                alertas_list.append({"tipo": "warning", "msg": f"Turbidez alta: {turb:.1f} NTU"})

        if temp is not None and temp > 32:
            alertas_list.append({"tipo": "warning", "msg": f"Temperatura elevada: {temp:.1f} °C"})

        trigger_microdosis = (turb is not None and turb > 3.0) or aforo_actual > 20
        if pred_dict and trigger_microdosis:
            cloro_total = float(pred_dict.get("cloro_pred") or 0.0)
            cobre_total = float(pred_dict.get("cobre_pred") or 0.0)
            cloro_aplicado = aplicadas.get("cloro", 0.0)
            cobre_aplicado = aplicadas.get("sulfato de cobre", 0.0)
            ultima_dosis_cloro = ultimas_horas.get("cloro")
            ultima_dosis_cobre = ultimas_horas.get("sulfato de cobre")
            ahora = datetime.now(timezone.utc)

            def en_cooldown(ultima_hora):
                if not ultima_hora:
                    return False
                if ultima_hora.tzinfo is None:
                    ultima_hora = ultima_hora.replace(tzinfo=timezone.utc)
                return (ahora - ultima_hora).total_seconds() < 7200

            cloro_restante = cloro_total - cloro_aplicado
            cobre_restante = cobre_total - cobre_aplicado
            motivo = "Pico de turbidez detectado" if turb and turb > 3.0 else "Alta afluencia de bañistas detectada"

            if cloro_restante > 0:
                if en_cooldown(ultima_dosis_cloro):
                    alertas_list.append({
                        "tipo": "ok",
                        "msg": "El pico de turbidez está siendo tratado. Micro-dosis de Cloro actuando (en tiempo de gracia de 2h)."
                    })
                else:
                    dosis_recomendada_cloro = round(min(cloro_restante, 25.0), 1)
                    if dosis_recomendada_cloro > 5.0:
                        alertas_list.append({
                            "tipo": "action",
                            "msg": f"{motivo}. Aplicar micro-dosis de Cloro ({dosis_recomendada_cloro}g) ahora para mantener desinfección.",
                            "quimico": "Cloro",
                            "cantidad": dosis_recomendada_cloro
                        })

            if cobre_restante > 0 and not en_cooldown(ultima_dosis_cobre):
                dosis_recomendada_cobre = round(min(cobre_restante, 5.0), 1)
                if dosis_recomendada_cobre > 1.0:
                    alertas_list.append({
                        "tipo": "action",
                        "msg": f"{motivo}. Aplicar micro-dosis de Sulfato de Cobre ({dosis_recomendada_cobre}g) preventivo.",
                        "quimico": "Sulfato de Cobre",
                        "cantidad": dosis_recomendada_cobre
                    })

    # Incluir alerta en el dashboard si hay falla activa en algún dispositivo de dosificación
    estado_dosif = dosificacion_manager.obtener_estado()
    if estado_dosif.get("error_hardware"):
        alertas_list.insert(0, {
            "tipo": "danger",
            "msg": f"Falla en Dosificador: {estado_dosif['error_hardware']}",
        })

    if not alertas_list:
        alertas_list.append({"tipo": "ok", "msg": "Todos los parámetros dentro del rango normal"})
    return alertas_list


@router.get("/api/notificaciones/config")
def ver_config_notificaciones():
    """Devuelve el estado de configuración de notificaciones por Correo y WhatsApp y el historial reciente."""
    return obtener_config_notificaciones()


@router.put("/api/notificaciones/config")
def guardar_config_notificaciones(payload: Dict[str, Any]):
    """Actualiza el número de WhatsApp, API key de CallMeBot y/o correo adicional para alertas."""
    if not payload:
        raise HTTPException(status_code=400, detail="Se requiere cuerpo JSON")
    cfg = actualizar_config_notificaciones(
        whatsapp_phone=payload.get("whatsapp_phone"),
        whatsapp_apikey=payload.get("whatsapp_apikey"),
        email_extra=payload.get("email_extra"),
    )
    return {"mensaje": "Configuración de alertas actualizada correctamente", "config": cfg}


@router.post("/api/notificaciones/probar")
def probar_notificacion_alerta(payload: Optional[Dict[str, Any]] = None):
    """Envía una alerta de prueba (o reporte manual de falla de dispositivo) al Correo y WhatsApp."""
    datos = payload or {}
    modulo = datos.get("modulo", "Monitoreo y Dosificación")
    dispositivo = datos.get("dispositivo", "Sensor / Bomba Dosificadora ESP32")
    titulo = datos.get("titulo", f"Prueba de Alerta de Falla en {dispositivo}")
    detalle = datos.get(
        "detalle",
        "Verificación de envío automático de alertas por Correo Electrónico y WhatsApp ante falla de dispositivo.",
    )
    resultado = notificar_falla_dispositivo(
        clave_falla=f"test_{int(time.time())}",
        titulo=titulo,
        modulo=modulo,
        dispositivo=dispositivo,
        detalle=detalle,
        forzar=True,
        en_background=False,
    )
    return {
        "mensaje": "Notificación procesada",
        "resultado": resultado,
    }


@router.get("/api/alertas")
def alertas():
    snap = _snapshot_dashboard.get("data")
    if snap is not None and (time.monotonic() - _snapshot_dashboard["ts"]) < 6.0:
        return _construir_alertas_desde_datos(
            mediciones=snap["mediciones"],
            info=snap["sensores_info"],
            pred_dict=snap["pred"],
            aforo_actual=snap["aforo_camara"],
            aplicadas=snap["dosis_aplicadas"],
            ultimas_horas=snap["ultimas_horas"],
        )

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        id_jornada = _id_jornada_hoy(conn)
        if id_jornada is None:
            return [{"tipo": "ok", "msg": "Todos los parámetros dentro del rango normal"}]

        datos = obtener_datos_prediccion(conn, id_jornada)
        mediciones = datos[0]
        info = estado_y_pronostico(conn, id_jornada, datos=datos) if mediciones else None

        cur = conn.cursor()
        cur.execute(
            "SELECT cloro_pred, cobre_pred FROM prediccion WHERE id_jornada = %s ORDER BY fecha_prediccion DESC LIMIT 1",
            (id_jornada,)
        )
        pred_row = cur.fetchone()
        pred_dict = {"cloro_pred": pred_row[0], "cobre_pred": pred_row[1]} if pred_row else None

        aforo_actual = int(datos[1][-1]["cantidad_personas"]) if datos[1] else 0

        cur.execute(
            """
            SELECT quimico, COALESCE(SUM(cantidad_g), 0), MAX(fecha_hora)
            FROM dosificacion_parcial
            WHERE id_jornada = %s
            GROUP BY quimico
            """,
            (id_jornada,)
        )
        aplicadas = {}
        ultimas_horas = {}
        for r in cur.fetchall():
            quim = r[0].lower()
            aplicadas[quim] = float(r[1])
            ultimas_horas[quim] = r[2]
        cur.close()

        return _construir_alertas_desde_datos(
            mediciones=mediciones,
            info=info,
            pred_dict=pred_dict,
            aforo_actual=aforo_actual,
            aplicadas=aplicadas,
            ultimas_horas=ultimas_horas,
        )
    finally:
        conn.close()
