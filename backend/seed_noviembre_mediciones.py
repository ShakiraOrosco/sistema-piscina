import os
import sys
import random
import numpy as np
from datetime import date, datetime, time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.db import get_connection

ULTIMO_DIA = 20          # 20 de noviembre
HORA_CORTE = 17          # hasta las 17:00 (5 PM) del último día


def seed_november_data():
    conn = get_connection()
    if not conn:
        print("ERROR: No se pudo conectar a la base de datos.")
        return

    random.seed(2711)
    np.random.seed(2711)

    print("=" * 66)
    print("INSERCIÓN DE MEDICIONES NOVIEMBRE 2026 (01/11 al 20/11 17:00)")
    print("=" * 66)

    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE OR REPLACE VIEW lecturas AS
                SELECT id_medicion, id_jornada, fecha_hora, ph, turbidez, temperatura
                FROM medicion;
            """)
            conn.commit()

            cur.execute(
                "SELECT id_jornada FROM jornada WHERE fecha >= '2026-11-01' AND fecha <= %s",
                (date(2026, 11, ULTIMO_DIA),),
            )
            ids = [r[0] for r in cur.fetchall()]
            if ids:
                print(f"Limpiando datos previos de {len(ids)} jornadas de noviembre...")
                for t in ("medicion", "aforo_camara", "aforo_manual", "prediccion",
                          "resumen_diario", "dosificacion"):
                    cur.execute(f"DELETE FROM {t} WHERE id_jornada = ANY(%s)", (ids,))
                conn.commit()

        tot_med = tot_taq = tot_pred = 0

        for d in range(1, ULTIMO_DIA + 1):
            curr_date = date(2026, 11, d)
            is_weekend = curr_date.weekday() >= 5
            parcial = (d == ULTIMO_DIA)
            hora_max = HORA_CORTE if parcial else 20

            with conn.cursor() as cur:
                cur.execute("SELECT id_jornada FROM jornada WHERE fecha = %s", (curr_date,))
                row = cur.fetchone()
                if row:
                    id_jornada = row[0]
                else:
                    cur.execute(
                        "INSERT INTO jornada (fecha, observaciones) VALUES (%s, %s) RETURNING id_jornada",
                        (curr_date, f"Jornada operativa {'Fin de semana' if is_weekend else 'Día hábil'} - Monitoreo IoT continuo"),
                    )
                    id_jornada = cur.fetchone()[0]
                conn.commit()

            crowd_factor = random.uniform(1.3, 1.85) if is_weekend else random.uniform(0.7, 1.1)
            clima_frio = -0.8 if d in [4, 12, 17] else (0.45 if d in [8, 14, 20] else 0.0)
            clima_temp = np.sin((d / 30.0) * 2 * np.pi) * 0.35 + clima_frio
            clima_ph = np.cos((d / 30.0) * 2 * np.pi) * 0.03

            ventas = [
                (8, 30, 3, 5, "Ingreso matutino socios"),
                (10, 15, 8, 12, "Grupo matutino libre"),
                (11, 45, 15, 22, "Pico mañana mediodía"),
                (13, 30, 12, 18, "Turno tarde apertura"),
                (15, 0, 18, 26, "Pico vespertino tarde"),
                (16, 45, 10, 16, "Tarde recreativa"),
                (18, 15, 4, 8, "Horario noche / cierre"),
            ]
            total_banistas = 0
            with conn.cursor() as cur:
                for h_v, m_v, b15, b20, obs in ventas:
                    if time(h_v, m_v) > time(hora_max, 0):
                        continue
                    t15, t20 = int(b15 * crowd_factor), int(b20 * crowd_factor)
                    cur.execute(
                        """INSERT INTO aforo_manual (id_jornada, id_usuario, hora_entrada,
                               cantidad_tarifa_15, cantidad_tarifa_20, observaciones)
                           VALUES (%s, 1, %s, %s, %s, %s)""",
                        (id_jornada, datetime.combine(curr_date, time(h_v, m_v)), t15, t20, obs),
                    )
                    tot_taq += 1
                    total_banistas += t15 + t20
                conn.commit()

            phs, turbs, temps, cams = [], [], [], []
            for h in range(8, hora_max + 1):
                dt_r = datetime.combine(curr_date, time(h, 0))
                if 11 <= h <= 16:
                    cam = int(random.uniform(30, 52) * crowd_factor)
                elif 9 <= h <= 10 or 17 <= h <= 18:
                    cam = int(random.uniform(10, 24) * crowd_factor)
                else:
                    cam = int(random.uniform(0, 5) * crowd_factor)

                ph = float(round(max(7.08, min(7.74, 7.37 + clima_ph
                      + np.sin((h - 8) / 12 * np.pi) * 0.11
                      + (cam / 85.0) * 0.10 + np.random.normal(0, 0.10))), 2))
                turb = float(round(max(0.95, min(5.65, 1.25
                      + np.sin((h - 8) / 12 * np.pi) * 1.25
                      + (cam / 62.0) * 2.15 + np.random.normal(0, 0.38))), 2))
                temp = float(round(max(25.1, min(28.7, 26.8 + clima_temp
                      + np.sin((h - 8) / 12 * np.pi) * 0.75
                      + np.random.normal(0, 0.38))), 1))
                phs.append(ph); turbs.append(turb); temps.append(temp); cams.append(cam)

                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO medicion (id_jornada, fecha_hora, ph, turbidez, temperatura) VALUES (%s,%s,%s,%s,%s)",
                        (id_jornada, dt_r, ph, turb, temp),
                    )
                    cur.execute(
                        "INSERT INTO aforo_camara (id_jornada, fecha_hora, cantidad_personas, id_dispositivo) VALUES (%s,%s,%s,%s)",
                        (id_jornada, dt_r, cam, "ESP32-CAM"),
                    )
                tot_med += 1
            conn.commit()

            # Resumen diario (también para el día parcial, con lo medido hasta las 17:00)
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO resumen_diario (id_jornada, promedio_ph, max_ph, min_ph,
                           promedio_turbidez, max_turbidez, promedio_temperatura,
                           total_personas, promedio_personas, pico_personas)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (id_jornada, round(float(np.mean(phs)), 2), max(phs), min(phs),
                     round(float(np.mean(turbs)), 2), max(turbs),
                     round(float(np.mean(temps)), 2),
                     int(total_banistas), round(float(np.mean(cams)), 1), int(max(cams))),
                )

                # Predicción y dosificación solo en jornadas completas (cierre 20:15/21:00)
                if not parcial:
                    cloro = float(round(44.0 + (total_banistas / 500.0) * 14.5 + np.random.normal(0, 1.8), 1))
                    alum = float(round(490.0 + (total_banistas / 500.0) * 90.0 + np.random.normal(0, 14.0), 1))
                    cobre = float(round(410.0 + (total_banistas / 500.0) * 75.0 + np.random.normal(0, 12.0), 1))
                    cur.execute(
                        """INSERT INTO prediccion (id_jornada, cloro_pred, aluminio_pred, cobre_pred,
                               error_cloro, error_aluminio, error_cobre, fecha_prediccion)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (id_jornada, cloro, alum, cobre, 1.3, 8.8, 6.7,
                         datetime.combine(curr_date, time(20, 15))),
                    )
                    cur.execute(
                        """INSERT INTO dosificacion (id_jornada, aluminio_g, cobre_g, cloro_g,
                               sigla_metodo, sigla_estado, fecha_activacion, fecha_finalizacion)
                           VALUES (%s,%s,%s,%s,'AUT','FIN',%s,%s)""",
                        (id_jornada, alum, cobre, cloro,
                         datetime.combine(curr_date, time(20, 30)),
                         datetime.combine(curr_date, time(21, 0))),
                    )
                    tot_pred += 1
            conn.commit()

        print("\n[FINALIZADO CON ÉXITO]")
        print(f" - Jornadas: 01/11/2026 al 20/11/2026 (20 días; el 20 hasta las {HORA_CORTE}:00)")
        print(f" - Mediciones insertadas: {tot_med}")
        print(f" - Registros de taquilla: {tot_taq}")
        print(f" - Predicciones/dosificaciones: {tot_pred}")

    except Exception as e:
        conn.rollback()
        print(f"ERROR DURANTE LA INSERCIÓN: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()


if __name__ == "__main__":
    seed_november_data()
