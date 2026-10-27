import sys
import os
from datetime import datetime, date

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.db import get_connection
from app.services.piscina_service import (
    obtener_o_crear_jornada_hoy,
    recalcular_resumen,
    correr_prediccion
)

def run():
    conn = get_connection()
    if not conn:
        print("Error: No se pudo conectar a la base de datos.")
        return

    try:
        id_jornada = obtener_o_crear_jornada_hoy(conn)
        today = date.today()
        print(f"Jornada activa ID: {id_jornada} para la fecha: {today}")

        with conn.cursor() as cur:
            # Limpiar mediciones, aforo_camara, prediccion y resumen previo para hoy
            cur.execute("DELETE FROM medicion WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM aforo_camara WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM prediccion WHERE id_jornada = %s", (id_jornada,))
            cur.execute("DELETE FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
            conn.commit()
            print("Datos previos de mediciones de la jornada limpiados exitosamente.")

        # Verificar si hay aforo manual para hoy, si no hay, agregar taquilla coherente
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM aforo_manual WHERE id_jornada = %s", (id_jornada,))
            count_manual = cur.fetchone()[0]
            if count_manual == 0:
                print("Insertando registros de taquilla (aforo manual)...")
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
                    dt = datetime.combine(today, datetime.min.time()).replace(hour=h, minute=m)
                    cur.execute(
                        """
                        INSERT INTO aforo_manual (
                            id_jornada, id_usuario, hora_entrada,
                            cantidad_tarifa_15, cantidad_tarifa_20,
                            observaciones
                        ) VALUES (%s, 1, %s, %s, %s, %s)
                        """,
                        (id_jornada, dt, t15, t20, obs)
                    )
                conn.commit()
                print(f"[OK] {len(ventas_taquilla)} registros de taquilla insertados.")

        # Mediciones horarias desde las 08:00 hasta las 20:00 (8:00 PM)
        lecturas = [
            # hora, ph, turbidez, temperatura, banistas_camara
            (8,  7.22, 1.15, 26.4, 5),   # 08:00
            (9,  7.25, 1.40, 27.1, 14),  # 09:00
            (10, 7.29, 1.85, 28.3, 26),  # 10:00
            (11, 7.34, 2.45, 29.5, 45),  # 11:00
            (12, 7.38, 3.05, 30.6, 58),  # 12:00
            (13, 7.42, 3.35, 31.2, 50),  # 13:00
            (14, 7.46, 3.75, 31.8, 65),  # 14:00
            (15, 7.48, 3.95, 31.4, 56),  # 15:00
            (16, 7.44, 3.50, 30.4, 34),  # 16:00
            (17, 7.39, 2.95, 29.3, 12),  # 17:00
            (18, 7.35, 2.40, 28.4, 8),   # 18:00 (6:00 PM)
            (19, 7.31, 1.95, 27.6, 3),   # 19:00 (7:00 PM)
            (20, 7.28, 1.65, 26.9, 0),   # 20:00 (8:00 PM - Cierre)
        ]

        print(f"\nInsertando {len(lecturas)} mediciones horarias (08:00 - 20:00 / 8:00 PM)...")
        with conn.cursor() as cur:
            for h, ph, turb, temp, pers in lecturas:
                fecha_hora = datetime.combine(today, datetime.min.time()).replace(hour=h, minute=0, second=0)
                cur.execute(
                    """
                    INSERT INTO medicion (id_jornada, fecha_hora, ph, turbidez, temperatura)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id_medicion
                    """,
                    (id_jornada, fecha_hora, ph, turb, temp)
                )
                id_med = cur.fetchone()[0]

                cur.execute(
                    """
                    INSERT INTO aforo_camara (id_jornada, fecha_hora, cantidad_personas, id_dispositivo)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (id_jornada, fecha_hora, pers, "ESP32-CAM")
                )
                print(f" -> [{fecha_hora.strftime('%H:%M')}] ID {id_med}: pH={ph}, Turb={turb} NTU, Temp={temp}°C, Aforo={pers} personas")
            conn.commit()

        # Recalcular resumen diario
        print("\nRecalculando resumen diario...")
        resumen = recalcular_resumen(conn, id_jornada)
        print("Resumen diario calculado:", resumen)

        # Correr predicción LSTM final del día
        print("\nGenerando predicción LSTM de químicos para cierre de jornada...")
        pred, err = correr_prediccion(conn, id_jornada, resumen or {})
        if pred:
            print("[OK] Predicción exitosa!")
            print(f"   Cloro sugerido: {pred.get('cloro_g')} g")
            print(f"   Aluminio (sulfato): {pred.get('aluminio_g')} g")
            print(f"   Cobre (sulfato): {pred.get('cobre_g')} g")
            print(f"   Tipo de predicción: {pred.get('tipo')} ({pred.get('franjas_capturadas')}/3 franjas)")
        if err:
            print(f"Advertencia en predicción: {err}")

        print("\n" + "="*60)
        print("[EXITO] Se insertaron correctamente todas las mediciones de 08:00 a 20:00 (8:00 PM) en la base de datos.")
        print("="*60)

    except Exception as e:
        conn.rollback()
        print(f"Error durante el proceso: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    run()
