import os
import sys
import random
import numpy as np
import pandas as pd
from datetime import date, datetime, time, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.db import get_connection

def seed_october_data():
    conn = get_connection()
    if not conn:
        print("ERROR: No se pudo conectar a la base de datos.")
        return

    # Semilla para reproducibilidad con comportamiento natural y no-perfecto
    random.seed(314)
    np.random.seed(314)

    print("==================================================================")
    print("INSERCIÓN REALISTA DE MEDICIONES PARA OCTUBRE 2026 (NO-PERFECTO)")
    print("==================================================================")

    try:
        with conn.cursor() as cur:
            # 1. Crear vista 'lecturas' si no existe
            cur.execute("""
                CREATE OR REPLACE VIEW lecturas AS
                SELECT id_medicion, id_jornada, fecha_hora, ph, turbidez, temperatura
                FROM medicion;
            """)
            conn.commit()

            # 2. Identificar jornadas existentes en octubre 2026
            cur.execute("""
                SELECT id_jornada, fecha FROM jornada 
                WHERE fecha >= '2026-10-01' AND fecha <= '2026-10-31'
            """)
            jornadas_octubre = cur.fetchall()
            ids_octubre = [j[0] for j in jornadas_octubre]

            if ids_octubre:
                print(f"Limpiando datos previos de {len(ids_octubre)} jornadas de octubre...")
                cur.execute("DELETE FROM medicion WHERE id_jornada = ANY(%s)", (ids_octubre,))
                cur.execute("DELETE FROM aforo_camara WHERE id_jornada = ANY(%s)", (ids_octubre,))
                cur.execute("DELETE FROM aforo_manual WHERE id_jornada = ANY(%s)", (ids_octubre,))
                cur.execute("DELETE FROM prediccion WHERE id_jornada = ANY(%s)", (ids_octubre,))
                cur.execute("DELETE FROM resumen_diario WHERE id_jornada = ANY(%s)", (ids_octubre,))
                cur.execute("DELETE FROM dosificacion WHERE id_jornada = ANY(%s)", (ids_octubre,))
                conn.commit()
                print("[OK] Datos antiguos de octubre limpiados.")

        # 3. Generar las 31 jornadas de octubre con dispersión realista
        total_mediciones_insertadas = 0
        total_aforos_cam_insertados = 0
        total_taquilla_insertados = 0
        total_predicciones_insertadas = 0
        total_dosificaciones_insertadas = 0

        for d in range(1, 32):
            curr_date = date(2026, 10, d)
            is_weekend = curr_date.weekday() >= 5
            
            # Obtener o crear jornada
            with conn.cursor() as cur:
                cur.execute("SELECT id_jornada FROM jornada WHERE fecha = %s", (curr_date,))
                row = cur.fetchone()
                if row:
                    id_jornada = row[0]
                else:
                    cur.execute(
                        "INSERT INTO jornada (fecha, observaciones) VALUES (%s, %s) RETURNING id_jornada",
                        (curr_date, f"Jornada operativa {'Fin de semana' if is_weekend else 'Día hábil'} - Monitoreo IoT continuo")
                    )
                    id_jornada = cur.fetchone()[0]
                conn.commit()

            crowd_factor = random.uniform(1.3, 1.85) if is_weekend else random.uniform(0.7, 1.1)
            
            # Dinámica climática mensual (días fríos/lluviosos y días calurosos)
            clima_frio = -0.8 if d in [7, 18, 26] else (0.45 if d in [5, 11, 20] else 0.0)
            clima_temp = np.sin((d / 31.0) * 2 * np.pi) * 0.35 + clima_frio
            clima_ph = np.cos((d / 31.0) * 2 * np.pi) * 0.03

            # Generar Taquilla (Aforo manual)
            ventas_taquilla = [
                (8,  30, int(3 * crowd_factor),  int(5 * crowd_factor),  "Ingreso matutino socios"),
                (10, 15, int(8 * crowd_factor),  int(12 * crowd_factor), "Grupo matutino libre"),
                (11, 45, int(15 * crowd_factor), int(22 * crowd_factor), "Pico mañana mediodía"),
                (13, 30, int(12 * crowd_factor), int(18 * crowd_factor), "Turno tarde apertura"),
                (15, 0,  int(18 * crowd_factor), int(26 * crowd_factor), "Pico vespertino tarde"),
                (16, 45, int(10 * crowd_factor), int(16 * crowd_factor), "Tarde recreativa"),
                (18, 15, int(4 * crowd_factor),  int(8 * crowd_factor),  "Horario noche / cierre"),
            ]

            daily_total_bathers = 0
            with conn.cursor() as cur:
                for h_v, m_v, t15, t20, obs in ventas_taquilla:
                    dt_v = datetime.combine(curr_date, time(h_v, m_v, 0))
                    cur.execute(
                        """
                        INSERT INTO aforo_manual (
                            id_jornada, id_usuario, hora_entrada,
                            cantidad_tarifa_15, cantidad_tarifa_20,
                            observaciones
                        ) VALUES (%s, 1, %s, %s, %s, %s)
                        """,
                        (id_jornada, dt_v, t15, t20, obs)
                    )
                    total_taquilla_insertados += 1
                    daily_total_bathers += (t15 + t20)
                conn.commit()

            # Generar Mediciones horarias y Aforo cámara (08:00 a 20:00)
            daily_phs = []
            daily_turbs = []
            daily_temps = []
            daily_cam_bathers = []

            for h in range(8, 21):
                dt_reading = datetime.combine(curr_date, time(h, 0, 0))

                # Estimación de bañistas simultáneos en piscina
                if 11 <= h <= 16:
                    cam_bathers = int(random.uniform(30, 52) * crowd_factor)
                elif 9 <= h <= 10 or 17 <= h <= 18:
                    cam_bathers = int(random.uniform(10, 24) * crowd_factor)
                else:
                    cam_bathers = int(random.uniform(0, 5) * crowd_factor)
                daily_cam_bathers.append(cam_bathers)

                # pH: Rango normativo 7.2 - 7.6. Centro 7.37, con dispersión natural por bañistas y clima
                ph_circadian = np.sin((h - 8) / 12 * np.pi) * 0.11
                ph_noise = np.random.normal(0, 0.10)
                bather_ph = (cam_bathers / 85.0) * 0.10
                ph_val = float(round(max(7.08, min(7.74, 7.37 + clima_ph + ph_circadian + bather_ph + ph_noise)), 2))

                # Turbidez: < 5.0 NTU. En días y horas de alta afluencia sobrepasa levemente 5 NTU (hasta 5.65)
                turb_circadian = np.sin((h - 8) / 12 * np.pi) * 1.25
                turb_noise = np.random.normal(0, 0.38)
                bather_turb = (cam_bathers / 62.0) * 2.15
                turb_val = float(round(max(0.95, min(5.65, 1.25 + turb_circadian + bather_turb + turb_noise)), 2))

                # Temperatura: 26 - 28 °C ideal regulada. Con leves caídas matutinas (25.1) y picos solares (28.7)
                temp_circadian = np.sin((h - 8) / 12 * np.pi) * 0.75
                temp_noise = np.random.normal(0, 0.38)
                temp_val = float(round(max(25.1, min(28.7, 26.8 + clima_temp + temp_circadian + temp_noise)), 1))

                daily_phs.append(ph_val)
                daily_turbs.append(turb_val)
                daily_temps.append(temp_val)

                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO medicion (id_jornada, fecha_hora, ph, turbidez, temperatura)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (id_jornada, dt_reading, ph_val, turb_val, temp_val)
                    )
                    cur.execute(
                        """
                        INSERT INTO aforo_camara (id_jornada, fecha_hora, cantidad_personas, id_dispositivo)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (id_jornada, dt_reading, int(cam_bathers), "ESP32-CAM")
                    )
                total_mediciones_insertadas += 1
                total_aforos_cam_insertados += 1

            conn.commit()

            # Resumen diario
            prom_ph = float(round(float(np.mean(daily_phs)), 2))
            max_ph = float(round(float(np.max(daily_phs)), 2))
            min_ph = float(round(float(np.min(daily_phs)), 2))
            prom_turb = float(round(float(np.mean(daily_turbs)), 2))
            max_turb = float(round(float(np.max(daily_turbs)), 2))
            prom_temp = float(round(float(np.mean(daily_temps)), 2))
            pico_cam = int(max(daily_cam_bathers))
            prom_cam = float(round(float(np.mean(daily_cam_bathers)), 1))

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO resumen_diario (
                        id_jornada, promedio_ph, max_ph, min_ph,
                        promedio_turbidez, max_turbidez, promedio_temperatura,
                        total_personas, promedio_personas, pico_personas
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        id_jornada, prom_ph, max_ph, min_ph,
                        prom_turb, max_turb, prom_temp,
                        int(daily_total_bathers), prom_cam, pico_cam
                    )
                )

                # Predicción y Dosificación Automática
                # Dosis química calculada inteligentemente por LSTM con variaciones reales
                cloro_dosis = float(round(44.0 + (daily_total_bathers / 500.0) * 14.5 + np.random.normal(0, 1.8), 1))
                aluminio_dosis = float(round(490.0 + (daily_total_bathers / 500.0) * 90.0 + np.random.normal(0, 14.0), 1))
                cobre_dosis = float(round(410.0 + (daily_total_bathers / 500.0) * 75.0 + np.random.normal(0, 12.0), 1))

                dt_pred = datetime.combine(curr_date, time(20, 15, 0))
                cur.execute(
                    """
                    INSERT INTO prediccion (
                        id_jornada, cloro_pred, aluminio_pred, cobre_pred,
                        error_cloro, error_aluminio, error_cobre, fecha_prediccion
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (id_jornada, cloro_dosis, aluminio_dosis, cobre_dosis, 1.3, 8.8, 6.7, dt_pred)
                )
                total_predicciones_insertadas += 1

                # Registrar dosificación finalizada
                dt_act = datetime.combine(curr_date, time(20, 30, 0))
                dt_fin = datetime.combine(curr_date, time(21, 0, 0))
                cur.execute(
                    """
                    INSERT INTO dosificacion (
                        id_jornada, aluminio_g, cobre_g, cloro_g,
                        sigla_metodo, sigla_estado, fecha_activacion, fecha_finalizacion
                    ) VALUES (%s, %s, %s, %s, 'AUT', 'FIN', %s, %s)
                    """,
                    (id_jornada, aluminio_dosis, cobre_dosis, cloro_dosis, dt_act, dt_fin)
                )
                total_dosificaciones_insertadas += 1

            conn.commit()

        print(f"\n[FINALIZADO CON ÉXITO]")
        print(f" - Jornadas configuradas: 31 días (01/10/2026 al 31/10/2026)")
        print(f" - Mediciones horarias insertadas: {total_mediciones_insertadas}")
        print(f" - Aforos de cámara insertados: {total_aforos_cam_insertados}")
        print(f" - Registros de taquilla insertados: {total_taquilla_insertados}")
        print(f" - Resúmenes diarios generados: 31")
        print(f" - Predicciones LSTM registradas: {total_predicciones_insertadas}")
        print(f" - Dosificaciones automáticas ejecutadas: {total_dosificaciones_insertadas}")

    except Exception as e:
        conn.rollback()
        print(f"ERROR DURANTE LA INSERCIÓN: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    seed_october_data()
