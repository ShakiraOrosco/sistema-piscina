from __future__ import annotations

import io
from datetime import date, datetime, timedelta, time
from typing import Any, Dict, List, Optional
import math

from fastapi import APIRouter, HTTPException, Query, Response, Depends
from fastapi.responses import StreamingResponse

from ..db import get_connection, get_dict_cursor
from ..services.piscina_service import serializar_dict
from .auditoria import registrar_log

# ReportLab imports for formal PDF generation
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

router = APIRouter(prefix="/api/v1/reportes", tags=["reportes"])

# Costos referenciales según Tabla 1.2 del documento de grado (Piscina Playa Azul)
PRECIOS_QUIMICOS_KG = {
    "cloro": 55.0,              # Bs. 55 / kg
    "sulfato de cobre": 50.0,   # Bs. 50 / kg
    "sulfato de aluminio": 25.0 # Bs. 25 / kg
}

RANGOS_NORMATIVOS = {
    "ph": {"min": 7.2, "max": 7.6, "ideal": 7.4, "unidad": ""},
    "turbidez": {"max": 5.0, "unidad": "NTU"},
    "temperatura": {"min": 24.0, "max": 30.0, "ideal_min": 26.0, "ideal_max": 28.0, "unidad": "°C"},
}


def resolver_rango_fechas(tipo_rango: str, fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None):
    """Calcula las fechas de inicio y fin en base a predefinidos o personalizados."""
    hoy = date.today()
    if tipo_rango == "hoy":
        ini = hoy
        fin = hoy
    elif tipo_rango == "semana":
        ini = hoy - timedelta(days=6)
        fin = hoy
    elif tipo_rango == "mes":
        ini = hoy - timedelta(days=29)
        fin = hoy
    elif tipo_rango == "personalizado":
        if not fecha_inicio or not fecha_fin:
            raise HTTPException(status_code=400, detail="Debe proporcionar fecha_inicio y fecha_fin para rango personalizado")
        try:
            ini = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
            fin = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido. Utilice AAAA-MM-DD")
        if ini > fin:
            raise HTTPException(status_code=400, detail="La fecha de inicio no puede ser posterior a la fecha de fin")
    else:
        # Por defecto los últimos 7 días
        ini = hoy - timedelta(days=6)
        fin = hoy

    dt_ini = datetime.combine(ini, time.min)
    dt_fin = datetime.combine(fin, time.max)
    return ini, fin, dt_ini, dt_fin


@router.get("/calidad-agua")
def reporte_calidad_agua(
    tipo_rango: str = Query("semana", description="hoy, semana, mes, personalizado"),
    fecha_inicio: Optional[str] = Query(None, description="AAAA-MM-DD"),
    fecha_fin: Optional[str] = Query(None, description="AAAA-MM-DD"),
):
    """
    RF-05 / HU-005: Generación de reporte estadístico de calidad del agua.
    Calcula promedios, valores mínimos, máximos y porcentaje de cumplimiento normativo.
    """
    ini_date, fin_date, dt_ini, dt_fin = resolver_rango_fechas(tipo_rango, fecha_inicio, fecha_fin)

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        cur = get_dict_cursor(conn)
        cur.execute(
            """
            SELECT 
                m.id_medicion,
                m.id_jornada,
                m.fecha_hora,
                m.ph,
                m.turbidez,
                m.temperatura,
                j.fecha AS fecha_jornada
            FROM medicion m
            LEFT JOIN jornada j ON j.id_jornada = m.id_jornada
            WHERE m.fecha_hora >= %s AND m.fecha_hora <= %s
            ORDER BY m.fecha_hora ASC
            """,
            (dt_ini, dt_fin),
        )
        rows = cur.fetchall()

        # Extraer aforos para correlación
        cur.execute(
            """
            SELECT fecha_hora, cantidad_personas 
            FROM aforo_camara 
            WHERE fecha_hora >= %s AND fecha_hora <= %s
            ORDER BY fecha_hora ASC
            """,
            (dt_ini, dt_fin)
        )
        aforos_cam = cur.fetchall()

        # Auditoría del reporte generado
        registrar_log(
            modulo="Reportes",
            accion="CONSULTAR",
            entidad="reporte_calidad_agua",
            detalle={"tipo_rango": tipo_rango, "inicio": str(ini_date), "fin": str(fin_date), "registros": len(rows)},
        )

        total_mediciones = len(rows)

        phs = [float(r["ph"]) for r in rows if r["ph"] is not None]
        turbs = [float(r["turbidez"]) for r in rows if r["turbidez"] is not None]
        temps = [float(r["temperatura"]) for r in rows if r["temperatura"] is not None]

        def calcular_metricas(valores: List[float], cond_valida):
            if not valores:
                return {
                    "promedio": None,
                    "min": None,
                    "max": None,
                    "desv_estandar": None,
                    "total": 0,
                    "en_rango": 0,
                    "fuera_rango": 0,
                    "pct_cumplimiento": 0.0,
                }
            n = len(valores)
            prom = round(sum(valores) / n, 2)
            en_r = sum(1 for v in valores if cond_valida(v))
            fuera_r = n - en_r
            pct = round((en_r / n) * 100.0, 1)
            varianza = sum((v - prom) ** 2 for v in valores) / n if n > 1 else 0.0
            desv = round(math.sqrt(varianza), 2)
            return {
                "promedio": prom,
                "min": round(min(valores), 2),
                "max": round(max(valores), 2),
                "desv_estandar": desv,
                "total": n,
                "en_rango": en_r,
                "fuera_rango": fuera_r,
                "pct_cumplimiento": pct,
            }

        est_ph = calcular_metricas(phs, lambda v: 7.2 <= v <= 7.6)
        est_turb = calcular_metricas(turbs, lambda v: v < 5.0)
        est_temp = calcular_metricas(temps, lambda v: 24.0 <= v <= 30.0)

        # Índice global de conformidad
        pesos = []
        if est_ph["total"] > 0:
            pesos.append(est_ph["pct_cumplimiento"])
        if est_turb["total"] > 0:
            pesos.append(est_turb["pct_cumplimiento"])
        if est_temp["total"] > 0:
            pesos.append(est_temp["pct_cumplimiento"])
        indice_global = round(sum(pesos) / len(pesos), 1) if pesos else 0.0

        # Lista formateada para tabla y gráfica
        detalle_cronologico = []
        for r in rows:
            p_val = float(r["ph"]) if r["ph"] is not None else None
            t_val = float(r["turbidez"]) if r["turbidez"] is not None else None
            temp_val = float(r["temperatura"]) if r["temperatura"] is not None else None

            # Determinar estados
            st_ph = "OPTIMO" if (p_val is not None and 7.2 <= p_val <= 7.6) else ("ALCALINO" if (p_val is not None and p_val > 7.6) else ("ACIDO" if p_val is not None else "SIN_DATO"))
            st_turb = "OPTIMA" if (t_val is not None and t_val < 5.0) else ("TURBIA" if (t_val is not None and t_val < 10.0) else ("CRITICA" if t_val is not None else "SIN_DATO"))
            st_temp = "CONFORT" if (temp_val is not None and 26.0 <= temp_val <= 28.0) else ("ACEPTABLE" if (temp_val is not None and 24.0 <= temp_val <= 30.0) else ("FUERA" if temp_val is not None else "SIN_DATO"))

            cumple_todo = (st_ph == "OPTIMO") and (st_turb == "OPTIMA") and (st_temp in ("CONFORT", "ACEPTABLE"))

            detalle_cronologico.append({
                "id_medicion": r["id_medicion"],
                "fecha_hora": r["fecha_hora"].strftime("%Y-%m-%d %H:%M:%S") if r["fecha_hora"] else "",
                "hora": r["fecha_hora"].strftime("%H:%M") if r["fecha_hora"] else "",
                "fecha": r["fecha_hora"].strftime("%Y-%m-%d") if r["fecha_hora"] else "",
                "ph": p_val,
                "estado_ph": st_ph,
                "turbidez": t_val,
                "estado_turbidez": st_turb,
                "temperatura": temp_val,
                "estado_temperatura": st_temp,
                "conforme": cumple_todo,
            })

        # Alertas detectadas en el rango
        alertas_resumen = {
            "ph_acido": sum(1 for v in phs if v < 7.2),
            "ph_alcalino": sum(1 for v in phs if v > 7.6),
            "turbidez_alta": sum(1 for v in turbs if 5.0 <= v < 10.0),
            "turbidez_critica": sum(1 for v in turbs if v >= 10.0),
            "temp_fuera_rango": sum(1 for v in temps if v < 24.0 or v > 30.0),
        }

        # Conclusiones técnicas automáticas
        evaluacion = []
        if indice_global >= 85.0:
            evaluacion.append("El agua de la piscina presentó condiciones sanitarias estables y aptas para uso recreativo durante el período evaluado.")
        elif indice_global >= 70.0:
            evaluacion.append("Se observaron variaciones moderadas en los parámetros fisicoquímicos que requirieron dosificación correctiva.")
        else:
            evaluacion.append("Atención prioritaria: alto índice de mediciones fuera de los límites normativos que comprometen la calidad del agua.")

        if est_turb["fuera_rango"] > 0:
            evaluacion.append(f"Se registraron {est_turb['fuera_rango']} lecturas de turbidez por encima del límite normativo (<5 NTU), recomendándose reforzar floculación con Sulfato de Aluminio.")
        if est_ph["fuera_rango"] > 0:
            evaluacion.append(f"El pH osciló fuera del margen 7.2-7.6 en {est_ph['fuera_rango']} ocasiones, influyendo en la eficacia desinfectante del cloro.")

        return {
            "rango": {
                "tipo": tipo_rango,
                "fecha_inicio": str(ini_date),
                "fecha_fin": str(fin_date),
                "dias": (fin_date - ini_date).days + 1,
            },
            "normativa_referencia": "Ley Municipal N° 020 (Tarija) & Real Decreto 742/2013",
            "total_mediciones": total_mediciones,
            "indice_global_cumplimiento": indice_global,
            "estadisticas": {
                "ph": est_ph,
                "turbidez": est_turb,
                "temperatura": est_temp,
            },
            "alertas": alertas_resumen,
            "evaluacion_tecnica": evaluacion,
            "mediciones": detalle_cronologico,
        }
    finally:
        conn.close()


@router.get("/quimicos-dosificacion")
def reporte_quimicos_dosificacion(
    tipo_rango: str = Query("semana"),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    """
    Reporte de consumo de químicos y dosificaciones realizadas vs predicciones LSTM.
    Incluye estimación de costo económico según Tabla 1.2.
    """
    ini_date, fin_date, dt_ini, dt_fin = resolver_rango_fechas(tipo_rango, fecha_inicio, fecha_fin)

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        cur = get_dict_cursor(conn)
        
        # Dosificaciones parciales ejecutadas
        cur.execute(
            """
            SELECT 
                dp.id_parcial,
                dp.fecha_hora,
                dp.quimico,
                dp.cantidad_g
            FROM dosificacion_parcial dp
            WHERE dp.fecha_hora >= %s AND dp.fecha_hora <= %s
            ORDER BY dp.fecha_hora ASC
            """,
            (dt_ini, dt_fin)
        )
        dosif_rows = cur.fetchall()

        # Predicciones generadas por el modelo LSTM
        cur.execute(
            """
            SELECT 
                p.id_prediccion,
                p.fecha_prediccion,
                p.cloro_pred,
                p.cobre_pred,
                p.aluminio_pred,
                j.fecha AS fecha_jornada
            FROM prediccion p
            LEFT JOIN jornada j ON j.id_jornada = p.id_jornada
            WHERE p.fecha_prediccion >= %s AND p.fecha_prediccion <= %s
            ORDER BY p.fecha_prediccion ASC
            """,
            (dt_ini, dt_fin)
        )
        pred_rows = cur.fetchall()

        # Agrupar dosificaciones por químico
        totales_g = {"cloro": 0.0, "sulfato de cobre": 0.0, "sulfato de aluminio": 0.0}
        conteo_dosis = {"cloro": 0, "sulfato de cobre": 0, "sulfato de aluminio": 0}
        
        historial_dosificaciones = []
        for d in dosif_rows:
            q_norm = d["quimico"].strip().lower()
            cant = float(d["cantidad_g"] or 0.0)
            
            # Normalizar nombres comunes
            if "cloro" in q_norm:
                totales_g["cloro"] += cant
                conteo_dosis["cloro"] += 1
            elif "cobre" in q_norm:
                totales_g["sulfato de cobre"] += cant
                conteo_dosis["sulfato de cobre"] += 1
            elif "aluminio" in q_norm:
                totales_g["sulfato de aluminio"] += cant
                conteo_dosis["sulfato de aluminio"] += 1

            historial_dosificaciones.append({
                "id": d["id_parcial"],
                "fecha_hora": d["fecha_hora"].strftime("%Y-%m-%d %H:%M:%S") if d["fecha_hora"] else "",
                "quimico": d["quimico"],
                "cantidad_g": round(cant, 2),
                "cantidad_kg": round(cant / 1000.0, 3),
            })

        # Predicciones acumuladas del LSTM
        total_pred_g = {
            "cloro": sum(float(p["cloro_pred"] or 0.0) for p in pred_rows),
            "sulfato de cobre": sum(float(p["cobre_pred"] or 0.0) for p in pred_rows),
            "sulfato de aluminio": sum(float(p["aluminio_pred"] or 0.0) for p in pred_rows),
        }

        # Cálculo de costos en Bolivianos (Bs)
        costos_bs = {
            "cloro": round((totales_g["cloro"] / 1000.0) * PRECIOS_QUIMICOS_KG["cloro"], 2),
            "sulfato de cobre": round((totales_g["sulfato de cobre"] / 1000.0) * PRECIOS_QUIMICOS_KG["sulfato de cobre"], 2),
            "sulfato de aluminio": round((totales_g["sulfato de aluminio"] / 1000.0) * PRECIOS_QUIMICOS_KG["sulfato de aluminio"], 2),
        }
        costo_total_bs = round(sum(costos_bs.values()), 2)

        # Consumo de referencia manual (tradicional sin sistema inteligente)
        # En la piscina se gastaban periódicamente 8kg aluminio, 2kg cobre, 2kg cloro por recarga
        dias_periodo = max(1, (fin_date - ini_date).days + 1)

        return {
            "rango": {
                "tipo": tipo_rango,
                "fecha_inicio": str(ini_date),
                "fecha_fin": str(fin_date),
                "dias": dias_periodo,
            },
            "totales_dosificados_g": {k: round(v, 2) for k, v in totales_g.items()},
            "totales_dosificados_kg": {k: round(v / 1000.0, 3) for k, v in totales_g.items()},
            "conteo_activaciones": conteo_dosis,
            "totales_predichos_lstm_g": {k: round(v, 2) for k, v in total_pred_g.items()},
            "costos_estimados_bs": costos_bs,
            "costo_total_bs": costo_total_bs,
            "precios_referencia_kg": PRECIOS_QUIMICOS_KG,
            "historial_dosificaciones": historial_dosificaciones,
            "total_registros_dosificacion": len(dosif_rows),
            "total_predicciones_lstm": len(pred_rows),
        }
    finally:
        conn.close()


@router.get("/afluencia")
def reporte_afluencia(
    tipo_rango: str = Query("semana"),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
):
    """
    RF-16 / HU-016: Resumen estadístico de afluencia de bañistas por períodos.
    Consolida ingresos de taquilla/caja y aforo de visión artificial.
    """
    ini_date, fin_date, dt_ini, dt_fin = resolver_rango_fechas(tipo_rango, fecha_inicio, fecha_fin)

    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")

    try:
        cur = get_dict_cursor(conn)

        # Aforo manual / Taquilla
        cur.execute(
            """
            SELECT 
                am.id_registro,
                am.hora_entrada,
                am.cantidad_tarifa_15,
                am.cantidad_tarifa_20,
                am.total_personas,
                am.total_recaudado,
                am.observaciones,
                u.nombre AS nombre_cajero,
                u.primer_apellido AS apellido_cajero
            FROM aforo_manual am
            LEFT JOIN usuario u ON u.id_usuario = am.id_usuario
            WHERE am.hora_entrada >= %s AND am.hora_entrada <= %s
            ORDER BY am.hora_entrada ASC
            """,
            (dt_ini, dt_fin)
        )
        ventas = cur.fetchall()

        total_banistas = sum(v["total_personas"] or 0 for v in ventas)
        total_recaudado = sum(float(v["total_recaudado"] or 0.0) for v in ventas)
        total_t15 = sum(v["cantidad_tarifa_15"] or 0 for v in ventas)
        total_t20 = sum(v["cantidad_tarifa_20"] or 0 for v in ventas)

        # Agrupación por hora del día para identificar horarios pico
        distribucion_horas = {h: 0 for h in range(8, 21)}
        por_fecha = {}

        for v in ventas:
            if v["hora_entrada"]:
                h = v["hora_entrada"].hour
                if h in distribucion_horas:
                    distribucion_horas[h] += (v["total_personas"] or 0)
                f_str = v["hora_entrada"].strftime("%Y-%m-%d")
                por_fecha[f_str] = por_fecha.get(f_str, 0) + (v["total_personas"] or 0)

        hora_pico = max(distribucion_horas, key=distribucion_horas.get) if total_banistas > 0 else None
        pico_personas = distribucion_horas[hora_pico] if hora_pico is not None else 0

        dias_periodo = max(1, (fin_date - ini_date).days + 1)
        promedio_diario = round(total_banistas / dias_periodo, 1)

        lista_ventas = []
        for v in ventas:
            lista_ventas.append({
                "id": v["id_registro"],
                "fecha_hora": v["hora_entrada"].strftime("%Y-%m-%d %H:%M:%S") if v["hora_entrada"] else "",
                "total_personas": v["total_personas"],
                "tarifa_15": v["cantidad_tarifa_15"],
                "tarifa_20": v["cantidad_tarifa_20"],
                "total_recaudado": float(v["total_recaudado"] or 0.0),
                "cajero": f"{v.get('nombre_cajero') or ''} {v.get('apellido_cajero') or ''}".strip(),
                "observaciones": v.get("observaciones") or "",
            })

        return {
            "rango": {
                "tipo": tipo_rango,
                "fecha_inicio": str(ini_date),
                "fecha_fin": str(fin_date),
                "dias": dias_periodo,
            },
            "resumen": {
                "total_banistas": total_banistas,
                "total_recaudado_bs": round(total_recaudado, 2),
                "promedio_diario_banistas": promedio_diario,
                "total_tarifa_15bs": total_t15,
                "total_tarifa_20bs": total_t20,
                "hora_pico": f"{hora_pico:02d}:00 - {hora_pico+1:02d}:00" if hora_pico is not None else "N/A",
                "personas_hora_pico": pico_personas,
            },
            "distribucion_por_hora": [{"hora": f"{h:02d}:00", "personas": cant} for h, cant in distribucion_horas.items()],
            "afluencia_por_fecha": [{"fecha": k, "personas": v} for k, v in sorted(por_fecha.items())],
            "registros_taquilla": lista_ventas,
        }
    finally:
        conn.close()


@router.get("/pdf")
def descargar_reporte_pdf(
    tipo_reporte: str = Query("calidad_agua", description="calidad_agua, dosificacion, afluencia, completo"),
    tipo_rango: str = Query("semana"),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    usuario_generador: Optional[str] = Query("Administrador del Sistema"),
):
    """
    RF-05 / RF-20: Generación y exportación de reporte formal a PDF.
    Diseño institucional formal de la Piscina Playa Azul con membrete,
    resumen estadístico, cumplimiento normativo y detalle de datos.
    """
    ini_date, fin_date, dt_ini, dt_fin = resolver_rango_fechas(tipo_rango, fecha_inicio, fecha_fin)

    # 1. Obtener datos según el tipo de reporte
    data_calidad = None
    data_quimicos = None
    data_afluencia = None

    if tipo_reporte in ("calidad_agua", "completo"):
        data_calidad = reporte_calidad_agua(tipo_rango, fecha_inicio, fecha_fin)
    if tipo_reporte in ("dosificacion", "completo"):
        data_quimicos = reporte_quimicos_dosificacion(tipo_rango, fecha_inicio, fecha_fin)
    if tipo_reporte in ("afluencia", "completo"):
        data_afluencia = reporte_afluencia(tipo_rango, fecha_inicio, fecha_fin)

    # 2. Construir PDF con ReportLab
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Estilos personalizados
    titulo_style = ParagraphStyle(
        "TituloReporte",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#1E3A8A"), # Azul marino formal
        alignment=TA_CENTER,
    )

    subtitulo_style = ParagraphStyle(
        "SubtituloReporte",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
        alignment=TA_CENTER,
    )

    h2_style = ParagraphStyle(
        "H2Seccion",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1E40AF"),
        spaceBefore=10,
        spaceAfter=5,
    )

    body_style = ParagraphStyle(
        "CuerpoTexto",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1F2937"),
    )

    body_bold = ParagraphStyle(
        "CuerpoNegrita",
        parent=body_style,
        fontName="Helvetica-Bold",
    )

    center_style = ParagraphStyle(
        "TextoCentrado",
        parent=body_style,
        alignment=TA_CENTER,
    )

    alert_style = ParagraphStyle(
        "AlertaTexto",
        parent=body_style,
        textColor=colors.HexColor("#B91C1C"),
        fontName="Helvetica-Bold",
    )

    story = []

    # ── Membrete Institucional ──
    header_data = [
        [
            Paragraph("<b>PISCINA PLAYA AZUL</b><br/><font size=7 color='#64748B'>REYES - BENI, BOLIVIA<br/>SISTEMA IoT CON REDES NEURONALES LSTM</font>", body_style),
            Paragraph("<b>REPORTE TÉCNICO OFICIAL</b><br/><font size=7 color='#64748B'>MONITOREO Y CALIDAD DEL AGUA</font>", ParagraphStyle("RightH", parent=body_style, alignment=TA_RIGHT)),
        ]
    ]
    t_header = Table(header_data, colWidths=[3.8 * inch, 3.8 * inch])
    t_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t_header)
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceBefore=4, spaceAfter=8))

    # Título principal
    titulos_map = {
        "calidad_agua": "INFORME TÉCNICO DE CALIDAD FISICOQUÍMICA DEL AGUA",
        "dosificacion": "REPORTE DE DOSIFICACIÓN Y CONSUMO DE QUÍMICOS",
        "afluencia": "REPORTE DE AFLUENCIA Y REGISTRO DE BAÑISTAS",
        "completo": "INFORME INTEGRAL DE MONITOREO, QUÍMICOS Y AFLUENCIA",
    }
    story.append(Paragraph(titulos_map.get(tipo_reporte, "INFORME TÉCNICO DEL SISTEMA"), titulo_style))
    story.append(Spacer(1, 3))
    story.append(Paragraph(f"Período evaluado: Del <b>{ini_date.strftime('%d/%m/%Y')}</b> al <b>{fin_date.strftime('%d/%m/%Y')}</b> ({(fin_date - ini_date).days + 1} días)", subtitulo_style))
    story.append(Spacer(1, 8))

    # Metadatos del informe
    meta_data = [
        [
            Paragraph(f"<b>Fecha de emisión:</b> {datetime.now().strftime('%d/%m/%Y %H:%M')}", body_style),
            Paragraph(f"<b>Emitido por:</b> {usuario_generador}", body_style),
            Paragraph("<b>Estado de piscina:</b> OPERATIVA", body_style),
        ],
        [
            Paragraph("<b>Norma de ref.:</b> Ley Municipal 020 / RD 742/2013", body_style),
            Paragraph("<b>Tecnología:</b> Sensores IoT ESP32 + AI LSTM", body_style),
            Paragraph("<b>Vigencia:</b> 30 días", body_style),
        ]
    ]
    t_meta = Table(meta_data, colWidths=[2.6 * inch, 2.6 * inch, 2.4 * inch])
    t_meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # ── Sección 1: Calidad del Agua ──
    if data_calidad:
        story.append(Paragraph("1. RESUMEN ESTADÍSTICO DE PARÁMETROS FISICOQUÍMICOS", h2_style))
        
        c_ph = data_calidad["estadisticas"]["ph"]
        c_turb = data_calidad["estadisticas"]["turbidez"]
        c_temp = data_calidad["estadisticas"]["temperatura"]
        ind_global = data_calidad["indice_global_cumplimiento"]

        stats_table_data = [
            [
                Paragraph("<b>Parámetro</b>", center_style),
                Paragraph("<b>Rango Normativo</b>", center_style),
                Paragraph("<b>Promedio</b>", center_style),
                Paragraph("<b>Mín.</b>", center_style),
                Paragraph("<b>Máx.</b>", center_style),
                Paragraph("<b>En Rango</b>", center_style),
                Paragraph("<b>Fuera Rango</b>", center_style),
                Paragraph("<b>% Cumplimiento</b>", center_style),
            ],
            [
                Paragraph("<b>pH del Agua</b>", body_style),
                Paragraph("7.20 – 7.60", center_style),
                Paragraph(f"{c_ph['promedio'] or '—'}", center_style),
                Paragraph(f"{c_ph['min'] or '—'}", center_style),
                Paragraph(f"{c_ph['max'] or '—'}", center_style),
                Paragraph(f"{c_ph['en_rango']}", center_style),
                Paragraph(f"{c_ph['fuera_rango']}", center_style),
                Paragraph(f"<b>{c_ph['pct_cumplimiento']}%</b>", center_style),
            ],
            [
                Paragraph("<b>Turbidez (NTU)</b>", body_style),
                Paragraph("&lt; 5.00 NTU", center_style),
                Paragraph(f"{c_turb['promedio'] or '—'}", center_style),
                Paragraph(f"{c_turb['min'] or '—'}", center_style),
                Paragraph(f"{c_turb['max'] or '—'}", center_style),
                Paragraph(f"{c_turb['en_rango']}", center_style),
                Paragraph(f"{c_turb['fuera_rango']}", center_style),
                Paragraph(f"<b>{c_turb['pct_cumplimiento']}%</b>", center_style),
            ],
            [
                Paragraph("<b>Temperatura (°C)</b>", body_style),
                Paragraph("24.0 – 30.0 °C", center_style),
                Paragraph(f"{c_temp['promedio'] or '—'}", center_style),
                Paragraph(f"{c_temp['min'] or '—'}", center_style),
                Paragraph(f"{c_temp['max'] or '—'}", center_style),
                Paragraph(f"{c_temp['en_rango']}", center_style),
                Paragraph(f"{c_temp['fuera_rango']}", center_style),
                Paragraph(f"<b>{c_temp['pct_cumplimiento']}%</b>", center_style),
            ],
        ]

        t_stats = Table(stats_table_data, colWidths=[1.4 * inch, 1.1 * inch, 0.7 * inch, 0.6 * inch, 0.6 * inch, 0.8 * inch, 0.9 * inch, 1.3 * inch])
        t_stats.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t_stats)
        story.append(Spacer(1, 5))

        # Indicador Global de Conformidad
        conformidad_txt = (
            f"<b>Índice Global de Cumplimiento Sanitario: {ind_global}%</b> "
            f"({data_calidad['total_mediciones']} mediciones analizadas en {data_calidad['rango']['dias']} días). "
            f"Alertas de pH registradas: {data_calidad['alertas']['ph_acido'] + data_calidad['alertas']['ph_alcalino']}, "
            f"Alertas de turbidez (&ge;5 NTU): {data_calidad['alertas']['turbidez_alta'] + data_calidad['alertas']['turbidez_critica']}."
        )
        story.append(Paragraph(conformidad_txt, body_style))
        story.append(Spacer(1, 6))

        # Dictamen técnico y recomendaciones
        story.append(Paragraph("<b>Evaluación y Conclusiones Técnicas:</b>", body_bold))
        for ev in data_calidad.get("evaluacion_tecnica", []):
            story.append(Paragraph(f"• {ev}", body_style))
        story.append(Spacer(1, 8))

        # Muestra representativa de lecturas (primeras 15 para no saturar PDF)
        story.append(Paragraph("<b>Registro Cronológico Reciente de Mediciones:</b>", body_bold))
        muestras = data_calidad["mediciones"]
        # Tomar hasta 18 muestras distribuidas
        if len(muestras) > 18:
            step = len(muestras) // 18
            muestras_tab = muestras[::step][:18]
        else:
            muestras_tab = muestras

        tab_meds_data = [
            [
                Paragraph("<b>Fecha y Hora</b>", center_style),
                Paragraph("<b>pH</b>", center_style),
                Paragraph("<b>Turbidez (NTU)</b>", center_style),
                Paragraph("<b>Temp (°C)</b>", center_style),
                Paragraph("<b>Estado General</b>", center_style),
            ]
        ]
        for m in muestras_tab:
            st_gen = "CONFORME" if m["conforme"] else "FUERA DE RANGO"
            color_txt = "#15803D" if m["conforme"] else "#B91C1C"
            tab_meds_data.append([
                Paragraph(m["fecha_hora"], center_style),
                Paragraph(f"{m['ph']:.2f}" if m['ph'] is not None else "—", center_style),
                Paragraph(f"{m['turbidez']:.2f}" if m['turbidez'] is not None else "—", center_style),
                Paragraph(f"{m['temperatura']:.1f}" if m['temperatura'] is not None else "—", center_style),
                Paragraph(f"<font color='{color_txt}'><b>{st_gen}</b></font>", center_style),
            ])

        t_meds = Table(tab_meds_data, colWidths=[2.2 * inch, 1.2 * inch, 1.3 * inch, 1.1 * inch, 1.6 * inch])
        t_meds.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ]))
        story.append(t_meds)
        story.append(Spacer(1, 10))

    # ── Sección 2: Dosificación y Químicos ──
    if data_quimicos:
        story.append(Paragraph("2. REPORTE DE DOSIFICACIÓN Y COSTOS DE INSUMOS", h2_style))
        
        tot_kg = data_quimicos["totales_dosificados_kg"]
        tot_bs = data_quimicos["costos_estimados_bs"]
        costo_tot = data_quimicos["costo_total_bs"]
        conteo = data_quimicos["conteo_activaciones"]

        quim_table_data = [
            [
                Paragraph("<b>Producto Químico</b>", center_style),
                Paragraph("<b>Dosis Total (kg)</b>", center_style),
                Paragraph("<b>Activaciones</b>", center_style),
                Paragraph("<b>Precio Unit. (Bs/kg)</b>", center_style),
                Paragraph("<b>Costo Total (Bs.)</b>", center_style),
            ],
            [
                Paragraph("Cloro Desinfectante (Pastillas / Granulado)", body_style),
                Paragraph(f"{tot_kg['cloro']:.3f} kg", center_style),
                Paragraph(f"{conteo['cloro']}", center_style),
                Paragraph("Bs. 55.00", center_style),
                Paragraph(f"<b>Bs. {tot_bs['cloro']:.2f}</b>", center_style),
            ],
            [
                Paragraph("Sulfato de Aluminio (Floculante)", body_style),
                Paragraph(f"{tot_kg['sulfato de aluminio']:.3f} kg", center_style),
                Paragraph(f"{conteo['sulfato de aluminio']}", center_style),
                Paragraph("Bs. 25.00", center_style),
                Paragraph(f"<b>Bs. {tot_bs['sulfato de aluminio']:.2f}</b>", center_style),
            ],
            [
                Paragraph("Sulfato de Cobre (Alguicida)", body_style),
                Paragraph(f"{tot_kg['sulfato de cobre']:.3f} kg", center_style),
                Paragraph(f"{conteo['sulfato de cobre']}", center_style),
                Paragraph("Bs. 50.00", center_style),
                Paragraph(f"<b>Bs. {tot_bs['sulfato de cobre']:.2f}</b>", center_style),
            ],
            [
                Paragraph("<b>TOTAL INVERSIÓN QUÍMICOS</b>", body_bold),
                Paragraph(f"<b>{sum(tot_kg.values()):.3f} kg</b>", center_style),
                Paragraph(f"<b>{sum(conteo.values())}</b>", center_style),
                Paragraph("—", center_style),
                Paragraph(f"<b><font color='#1E40AF'>Bs. {costo_tot:.2f}</font></b>", center_style),
            ],
        ]

        t_quim = Table(quim_table_data, colWidths=[2.8 * inch, 1.2 * inch, 1.0 * inch, 1.2 * inch, 1.2 * inch])
        t_quim.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065F46")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t_quim)
        story.append(Spacer(1, 10))

    # ── Sección 3: Afluencia de Bañistas ──
    if data_afluencia:
        story.append(Paragraph("3. ESTADÍSTICAS DE AFLUENCIA Y RECAUDACIÓN EN TAQUILLA", h2_style))
        
        res_af = data_afluencia["resumen"]
        aflu_data = [
            [
                Paragraph("<b>Total Bañistas</b>", center_style),
                Paragraph("<b>Recaudación Total</b>", center_style),
                Paragraph("<b>Promedio Diario</b>", center_style),
                Paragraph("<b>Horario Pico</b>", center_style),
                Paragraph("<b>Bañistas en Pico</b>", center_style),
            ],
            [
                Paragraph(f"<b>{res_af['total_banistas']}</b> personas", center_style),
                Paragraph(f"<b>Bs. {res_af['total_recaudado_bs']:.2f}</b>", center_style),
                Paragraph(f"{res_af['promedio_diario_banistas']} pers/día", center_style),
                Paragraph(f"{res_af['hora_pico']}", center_style),
                Paragraph(f"{res_af['personas_hora_pico']} personas", center_style),
            ],
        ]
        t_aflu = Table(aflu_data, colWidths=[1.5 * inch, 1.6 * inch, 1.4 * inch, 1.5 * inch, 1.4 * inch])
        t_aflu.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284C7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F0F9FF")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_aflu)
        story.append(Spacer(1, 12))

    # ── Sección de Firmas y Validación Institucional ──
    story.append(Spacer(1, 10))
    firmas_data = [
        [
            Paragraph("___________________________________<br/><b>Encargado de Mantenimiento</b><br/>Piscina Playa Azul", center_style),
            Paragraph("___________________________________<br/><b>Administración General</b><br/>Piscina Playa Azul", center_style),
        ]
    ]
    t_firmas = Table(firmas_data, colWidths=[3.7 * inch, 3.7 * inch])
    t_firmas.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(KeepTogether(t_firmas))

    # Pie institucional
    def agregar_pie(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(36, 20, "Sistema IoT de Monitoreo y Dosificación de Químicos - Caso: Piscina Playa Azul (Reyes, Beni)")
        canvas.drawRightString(612 - 36, 20, f"Pág. {canvas.getPageNumber()} | Documento generado el {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        canvas.restoreState()

    # Construir documento
    doc.build(story, onFirstPage=agregar_pie, onLaterPages=agregar_pie)
    buffer.seek(0)

    nombre_archivo = f"reporte_{tipo_reporte}_{ini_date.strftime('%Y%m%d')}_{fin_date.strftime('%Y%m%d')}.pdf"

    # Registrar en auditoría la exportación a PDF (RF-20)
    registrar_log(
        modulo="Reportes",
        accion="EXPORTAR_PDF",
        entidad="reporte_pdf",
        detalle={"tipo_reporte": tipo_reporte, "archivo": nombre_archivo, "usuario": usuario_generador},
    )

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={nombre_archivo}"},
    )
