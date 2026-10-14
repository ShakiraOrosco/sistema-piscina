from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..db import get_connection, get_dict_cursor
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
async def crear_lectura(payload: Dict[str, Any]):
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
        raise HTTPException(status_code=400, detail="La lectura no contiene ningún valor válido de sensor")

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
async def registrar_aforo_camara(payload: Dict[str, Any]):
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


@router.post("/api/dosificacion_parcial", status_code=201)
async def registrar_dosificacion_parcial(payload: Dict[str, Any]):
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

        # Total personas desde aforo_manual (Taquilla)
        cur.execute(
            "SELECT COALESCE(SUM(total_personas),0) AS personas FROM aforo_manual WHERE id_jornada = %s",
            (id_jornada,),
        )
        personas_manual_row = cur.fetchone()

        # Último aforo detectado por la Cámara Inteligente
        cur.execute(
            "SELECT cantidad_personas FROM aforo_camara WHERE id_jornada = %s ORDER BY fecha_hora DESC LIMIT 1",
            (id_jornada,),
        )
        personas_camara_row = cur.fetchone()

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

        # Consultar las dosis parciales aplicadas hoy
        cur.execute(
            """
            SELECT quimico, COALESCE(SUM(cantidad_g), 0) as total
            FROM dosificacion_parcial
            WHERE id_jornada = %s
            GROUP BY quimico
            """,
            (id_jornada,)
        )
        dosis_aplicadas = {r["quimico"].lower(): float(r["total"]) for r in cur.fetchall()}

        datos = obtener_datos_prediccion(conn, id_jornada)
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

        aforo_manual = int(personas_manual_row["personas"]) if personas_manual_row else 0
        aforo_camara = int(personas_camara_row["cantidad_personas"]) if personas_camara_row else 0

        return {
            "id_jornada": id_jornada,
            "fecha": date.today().isoformat(),
            "ultima_medicion": serializar_dict(med),
            "aforo_manual": aforo_manual,
            "aforo_camara": aforo_camara,
            "personas_hoy": aforo_manual,
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
async def predecir_ahora():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
            (date.today(),)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No hay jornada para hoy")
        id_jornada = row[0]

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
    cur = conn.cursor()
    cur.execute(
        "SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1",
        (date.today(),)
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


@router.get("/api/pronostico")
async def pronostico():
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


@router.get("/api/alertas")
async def alertas():
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a Supabase")

    try:
        alertas_list = []
        id_jornada = _id_jornada_hoy(conn)
        info = None
        if id_jornada is not None:
            datos = obtener_datos_prediccion(conn, id_jornada)
            mediciones = datos[0]
            info = estado_y_pronostico(conn, id_jornada, datos=datos) if mediciones else None

        if info:
            estado = info["estado_sensores"]
            estimados = info["valores_estimados"]
            actuales = {}
            for var, nombre in NOMBRES_SENSOR.items():
                e = estado[var]["estado"]
                if e in MOTIVOS_FALLA:
                    est = estimados.get(var)
                    extra = f" — usando valor estimado {est['valor']:.2f}" if est else ""
                    alertas_list.append({
                        "tipo": "warning",
                        "msg": f"Sensor de {nombre} {MOTIVOS_FALLA[e]}{extra}",
                    })
                    if est:
                        actuales[var] = est["valor"]
                else:
                    # Último valor real válido de ese sensor
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

            # Lógica para recomendación de Micro-dosis (Híbrida)
            cur = conn.cursor()
            cur.execute(
                "SELECT cloro_pred, cobre_pred FROM prediccion WHERE id_jornada = %s ORDER BY fecha_prediccion DESC LIMIT 1",
                (id_jornada,)
            )
            pred = cur.fetchone()
            
            # Si hay predicción del modelo LSTM y la turbidez está subiendo o hay mucha gente (ej. aforo cámara > 30)
            aforo_actual = 0
            cur.execute("SELECT cantidad_personas FROM aforo_camara WHERE id_jornada = %s ORDER BY fecha_hora DESC LIMIT 1", (id_jornada,))
            aforo_row = cur.fetchone()
            if aforo_row:
                aforo_actual = int(aforo_row[0])
                
            trigger_microdosis = (turb is not None and turb > 3.0) or aforo_actual > 20
            
            if pred and trigger_microdosis:
                cloro_total = float(pred[0])
                cobre_total = float(pred[1])
                
                # Consultar dosis aplicadas y la última hora de aplicación
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
                    ultimas_horas[quim] = r[2] # datetime
                
                cloro_aplicado = aplicadas.get("cloro", 0.0)
                cobre_aplicado = aplicadas.get("sulfato de cobre", 0.0)
                
                ultima_dosis_cloro = ultimas_horas.get("cloro")
                ultima_dosis_cobre = ultimas_horas.get("sulfato de cobre")
                
                from datetime import timezone
                ahora = datetime.now(timezone.utc)
                
                # Función para verificar si está en cooldown (2 horas = 7200 segundos)
                def en_cooldown(ultima_hora):
                    if not ultima_hora:
                        return False
                    # Asegurar que ultima_hora tenga timezone si es naive
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
                        dosis_recomendada_cloro = round(min(cloro_restante, 25.0), 1) # Micro-dosis de 25g máx
                        if dosis_recomendada_cloro > 5.0:
                            alertas_list.append({
                                "tipo": "action", 
                                "msg": f"{motivo}. Aplicar micro-dosis de Cloro ({dosis_recomendada_cloro}g) ahora para mantener desinfección.", 
                                "quimico": "Cloro", 
                                "cantidad": dosis_recomendada_cloro
                            })
                    
                if cobre_restante > 0:
                    if en_cooldown(ultima_dosis_cobre):
                        # No mostramos alerta redundante para el cobre para no saturar la UI
                        pass
                    else:
                        dosis_recomendada_cobre = round(min(cobre_restante, 5.0), 1) # Micro-dosis de 5g máx
                        if dosis_recomendada_cobre > 1.0:
                            alertas_list.append({
                                "tipo": "action", 
                                "msg": f"{motivo}. Aplicar micro-dosis de Sulfato de Cobre ({dosis_recomendada_cobre}g) preventivo.", 
                                "quimico": "Sulfato de Cobre", 
                                "cantidad": dosis_recomendada_cobre
                            })
            cur.close()

        if not alertas_list:
            alertas_list.append({"tipo": "ok", "msg": "Todos los parámetros dentro del rango normal"})

        return alertas_list
    finally:
        conn.close()
