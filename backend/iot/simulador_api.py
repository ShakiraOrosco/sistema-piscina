import argparse
import random
import time
import requests
from datetime import datetime, date

API_URL = "http://localhost:8000/lecturas"

HORAS_MEDICION = [8, 12, 16]

def generar_jornada_simulada(fecha: date, escenario: str = "aleatorio") -> dict:
    if escenario == "aleatorio":
        escenario = random.choice(["normal", "normal", "cargado", "critico"])

    params = {
        "normal":  {"ph": (7.2, 7.4), "turb": (1.5, 3.5),  "temp": (26.0, 28.0), "pers": (20,  80)},
        "cargado": {"ph": (6.9, 7.2), "turb": (4.0, 8.0),  "temp": (28.0, 30.5), "pers": (80,  160)},
        "critico": {"ph": (6.6, 7.0), "turb": (8.0, 14.0), "temp": (29.0, 32.0), "pers": (60,  130)},
    }
    p = params[escenario]

    def rnd(mn, mx): return round(random.uniform(mn, mx), 2)
    def ruido(v, pct=0.04): return round(v + random.uniform(-v * pct, v * pct), 2)

    mediciones = []
    ph_base   = rnd(*p["ph"])
    turb_base = rnd(*p["turb"])
    temp_base = rnd(*p["temp"])

    for i, hora in enumerate(HORAS_MEDICION):
        factor_deterioro = i * 0.04
        personas = random.randint(
            int(p["pers"][0] * (0.5 + i * 0.3)),
            int(p["pers"][1] * (0.5 + i * 0.3))
        )
        mediciones.append({
            "hora": hora,
            "ph": ruido(ph_base - factor_deterioro * 0.5),
            "turbidez": ruido(turb_base + factor_deterioro * turb_base),
            "temperatura": ruido(temp_base + i * 0.5),
            "personas": personas,
        })

    return {"fecha": fecha, "escenario": escenario, "mediciones": mediciones}

def simular_hoy(escenario: str, pausa: int):
    print(f"\n{'='*55}")
    print(f"  SIMULADOR IOT -> API (Dashboard en tiempo real)")
    print(f"  Enviando datos a: {API_URL}")
    print(f"  Escenario: {escenario}  |  Pausa: {pausa}s")
    print(f"{'='*55}\n")

    jornada = generar_jornada_simulada(date.today(), escenario)
    print(f"  Escenario generado: {jornada['escenario']}\n")

    for idx, m in enumerate(jornada["mediciones"]):
        hora_label = f"{m['hora']:02d}:00"
        print(f"  ── Medición {idx+1}/3  (Franja {hora_label}) ──")
        
        # Simular la hora real del día combinando la fecha de hoy y la hora de la medición
        fecha_hora_simulada = datetime.combine(date.today(), datetime.min.time()).replace(
            hour=m["hora"], minute=0, second=0
        )
        
        payload = {
            "fecha_hora": fecha_hora_simulada.isoformat(),
            "ph": m["ph"],
            "turbidez": m["turbidez"],
            "temperatura": m["temperatura"],
            "personas": m["personas"]
        }
        
        print(f"     Enviando payload: {payload}")
        
        try:
            resp = requests.post(API_URL, json=payload, timeout=30)
            if resp.status_code == 201:
                data = resp.json()
                print(f"     ✓ Registrado en BD (ID: {data.get('id')})")
                
                # Mostrar resultado de la predicción devuelto por la API
                pred = data.get("prediccion")
                if pred:
                    print(f"     ✓ Modelo LSTM ejecutado exitosamente!")
                    print(f"       => Al: {pred.get('aluminio_g')}g | Cu: {pred.get('cobre_g')}g | Cl: {pred.get('cloro_g')}g")
                else:
                    err = data.get("advertencia_lstm")
                    if err:
                        print(f"     ⚠️ Advertencia LSTM: {err}")
            else:
                print(f"     ❌ Error de API: {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"     ❌ Falla de conexión con API: {e}")

        if idx < len(jornada["mediciones"]) - 1:
            print(f"\n  ⏳ Esperando {pausa} segundos antes de la siguiente franja...\n")
            time.sleep(pausa)
            
    print("\n  ✓ Simulación de jornada finalizada. ¡Revisa el dashboard!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulador IoT HTTP")
    parser.add_argument("--escenario", choices=["normal", "cargado", "critico", "aleatorio"], default="aleatorio")
    parser.add_argument("--pausa", type=int, default=5, help="Segundos entre envíos (default: 5)")
    args = parser.parse_args()
    simular_hoy(args.escenario, args.pausa)
