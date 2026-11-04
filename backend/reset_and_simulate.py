import sys
import os
import requests
from datetime import datetime, date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import get_connection

API_URL = "http://127.0.0.1:8000/lecturas"


def clean_todays_data():
    conn = get_connection()
    if not conn:
        print("No se pudo conectar a la base de datos.")
        return None
    try:
        from app.services.piscina_service import obtener_o_crear_jornada_hoy
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        with conn.cursor() as cur:
            print(f"Limpiando datos de la jornada de hoy (id: {id_jornada}, fecha: {date.today()})...")
            cur.execute("DELETE FROM medicion WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM aforo_camara WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM prediccion WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM aforo_manual WHERE id_jornada = %s", (id_jornada,))
            conn.commit()
            print("Datos de la jornada limpiados exitosamente.")
        return id_jornada
    except Exception as e:
        print(f"Error al limpiar BD: {e}")
        return None
    finally:
        conn.close()


def seed_aforo_manual(id_jornada):
    conn = get_connection()
    if not conn or not id_jornada:
        return
    try:
        cur = conn.cursor()
        print(f"\n--- Generando registros de Taquilla (Aforo Manual) coherentes para hoy ---")
        
        # Entradas coherentes de taquilla distribuidas a lo largo del día
        ventas_taquilla = [
            (8,  15, 2,  3,  "Apertura temprana"),
            (9,  10, 4,  8,  "Entrada matutina familias"),
            (10, 5,  8,  14, "Grupo escolar / recreativo"),
            (11, 15, 12, 23, "Pico de mañana"),
            (12, 20, 10, 20, "Entradas mediodía"),
            (13, 30, 8,  17, "Turno tarde"),
            (14, 15, 8,  20, "Pico vespertino"),
            (15, 10, 6,  12, "Tarde familiar"),
            (16, 5,  4,  6,  "Tarde recreativa"),
            (17, 15, 2,  3,  "Turno noche / vespertino"),
            (18, 5,  1,  2,  "Último ingreso antes del cierre"),
        ]
        
        for h, m, t15, t20, obs in ventas_taquilla:
            fecha_hora = datetime.combine(date.today(), datetime.min.time()).replace(hour=h, minute=m)
            cur.execute(
                """
                INSERT INTO aforo_manual (
                    id_jornada, id_usuario, hora_entrada,
                    cantidad_tarifa_15, cantidad_tarifa_20,
                    observaciones
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (id_jornada, 1, fecha_hora, t15, t20, obs)
            )
        conn.commit()
        total_boletos = sum(t[2] + t[3] for t in ventas_taquilla)
        total_recaudo = sum(t[2] * 15 + t[3] * 20 for t in ventas_taquilla)
        print(f"[OK] Registradas {len(ventas_taquilla)} transacciones en Taquilla: {total_boletos} banistas (Bs. {total_recaudo:.2f}).")
        cur.close()
    except Exception as e:
        conn.rollback()
        print(f"Error al registrar aforo manual: {e}")
    finally:
        conn.close()


def post_reading(hour, ph, turbidez, temperatura, personas):
    dt_str = f"{date.today().isoformat()}T{hour:02d}:00:00"
    payload = {
        "ph": ph,
        "turbidez": turbidez,
        "temperatura": temperatura,
        "personas": personas,
        "fecha_hora": dt_str
    }
    print(f"\n--- Enviando lectura de las {hour:02d}:00 (pH: {ph}, Turb: {turbidez} NTU, Temp: {temperatura}C, Aforo: {personas} pers) ---", flush=True)
    try:
        response = requests.post(API_URL, json=payload, timeout=30)
    except requests.exceptions.RequestException:
        # Fallback a localhost si 127.0.0.1 difiere
        response = requests.post("http://localhost:8000/lecturas", json=payload, timeout=30)

    if response.status_code == 201:
        data = response.json()
        print("[OK] Guardado con exito en BD!", flush=True)
        pred = data.get('prediccion', {})
        if pred:
            print(f"-> Prediccion actualizada (Franjas capturadas: {pred.get('franjas_capturadas')}/3 - Tipo: {pred.get('tipo')})", flush=True)
            print(f"   Cloro: {pred.get('cloro_g')}g | Aluminio: {pred.get('aluminio_g')}g | Cobre: {pred.get('cobre_g')}g", flush=True)
    else:
        print("Error:", response.status_code, response.text, flush=True)


if __name__ == "__main__":
    id_jornada = clean_todays_data()
    seed_aforo_manual(id_jornada)

    # ── Lecturas horarias coherentes de 08:00 a 20:00 (8:00 PM) ──
    # Siguen la dinámica real de una piscina:
    # - Radiación solar: la temperatura sube desde la mañana (26.4°C) hasta el pico térmico de las 14:00 (31.8°C), bajando al anochecer (26.9°C a las 20:00).
    # - Carga de bañistas: inicia baja (5 pers), alcanza su pico en la tarde (65 pers) y desciende gradualmente al cierre (0 pers a las 20:00).
    # - Turbidez: aumenta con el ingreso de bañistas y protectores solares (1.15 -> 3.95 NTU), luego el filtrado recupera el agua decantando a 1.65 NTU.
    # - pH: oscila fisiológicamente entre 7.22 y 7.48, estabilizándose a 7.28.
    lecturas = [
        # (hora, ph, turbidez, temperatura, bañistas_cámara)
        (8,  7.22, 1.15, 26.4, 5),   # Apertura matutina, agua limpia
        (9,  7.25, 1.40, 27.1, 14),  # Entran primeros bañistas
        (10, 7.29, 1.85, 28.3, 26),  # Mañana soleada, flujo constante
        (11, 7.34, 2.45, 29.5, 45),  # Calienta el sol, más concurrencia
        (12, 7.38, 3.05, 30.6, 58),  # Franja 2 oficial LSTM, afluencia alta
        (13, 7.42, 3.35, 31.2, 50),  # Horario almuerzo, rotación de bañistas
        (14, 7.46, 3.75, 31.8, 65),  # Pico térmico y máxima afluencia de la tarde
        (15, 7.48, 3.95, 31.4, 56),  # Tarde de sol, protectores solares activos
        (16, 7.44, 3.50, 30.4, 34),  # Franja 3 oficial LSTM, bañistas empezando a salir
        (17, 7.39, 2.95, 29.3, 12),  # Tarde/noche, filtrado activo
        (18, 7.35, 2.40, 28.4, 8),   # 18:00 (6:00 PM) - Afluencia reducida
        (19, 7.31, 1.95, 27.6, 3),   # 19:00 (7:00 PM) - Salida de bañistas
        (20, 7.28, 1.65, 26.9, 0),   # 20:00 (8:00 PM) - Cierre de jornada
    ]

    for h, ph, turb, temp, pers in lecturas:
        post_reading(h, ph, turb, temp, pers)

    print("\n" + "="*60)
    print("[OK] Simulacion completa finalizada con exito de 08:00 a 20:00 (8:00 PM).")
    print("[OK] Las 3 franjas LSTM (08:00, 12:00, 16:00) han sido capturadas.")
    print("[OK] Ya puedes revisar el panel en el frontend (Dashboard, Caja y Monitoreo).")
    print("="*60)
