import os
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

import joblib
import numpy as np

from lstm.src.prediction.pronostico_sensores import estimar_valor, valor_valido

VARIABLES_SENSOR = ("ph", "turbidez", "temperatura")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# Horarios de medición usados en el dataset de entrenamiento:
#   pH_1 / temperatura_1 / turbidez_visual_1 / banistas_1 -> 08:00
#   pH_2 / ...                                            -> 12:00
#   pH_3 / ...                                            -> 16:00
HORAS_FRANJA = (8, 12, 16)
# Una lectura cuenta para una franja si está a ±VENTANA_HORAS de la hora objetivo.
VENTANA_HORAS = 2.0

VALORES_DEFECTO = {"ph": 7.2, "turbidez": 2.0, "temperatura": 26.0, "banistas": 0.0}

_modelo_cache = None
_scaler_x_cache = None
_scaler_y_cache = None


def _cargar_artefactos():
    global _modelo_cache, _scaler_x_cache, _scaler_y_cache
    if _modelo_cache is None:
        # Imports diferidos: así `seleccionar_franjas` se puede usar/probar sin torch.
        import torch
        from lstm.src.training.train_lstm import LSTMRegressor

        lstm_path = os.path.join(MODELS_DIR, "lstm_piscina_model.pth")
        scaler_x_path = os.path.join(MODELS_DIR, "scaler_x.joblib")
        scaler_y_path = os.path.join(MODELS_DIR, "scaler_y.joblib")

        if not os.path.exists(lstm_path):
            raise FileNotFoundError(f"No se encontró el modelo LSTM en {lstm_path}")

        model = LSTMRegressor(input_dim=4, hidden_dim=64, num_layers=2, output_dim=3)
        model.load_state_dict(torch.load(lstm_path, map_location="cpu"))
        model.eval()

        _modelo_cache = model
        _scaler_x_cache = joblib.load(scaler_x_path)
        _scaler_y_cache = joblib.load(scaler_y_path)

    return _modelo_cache, _scaler_x_cache, _scaler_y_cache


# ─────────────────────────────────────────────
# SELECCIÓN DE FRANJAS 08:00 / 12:00 / 16:00
# ─────────────────────────────────────────────
def _a_datetime(valor) -> Optional[datetime]:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.replace(tzinfo=None)
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor.replace("Z", "")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _num(valor, defecto: float) -> float:
    try:
        return float(valor) if valor is not None else defecto
    except (TypeError, ValueError):
        return defecto


def _banistas_en(objetivo: datetime, ventana: timedelta,
                 aforos_camara: List[Dict[str, Any]],
                 aforos_manual: List[Dict[str, Any]]):
    """Bañistas presentes alrededor de `objetivo`.

    1. Registro de la cámara IA más cercano dentro de la ventana.
    2. Si no hay cámara: acumulado de taquilla (aforo_manual) hasta esa hora.
    """
    mejor, mejor_dist = None, None
    for a in aforos_camara:
        t = _a_datetime(a.get("fecha_hora"))
        if t is None:
            continue
        dist = abs(t - objetivo)
        if dist <= ventana and (mejor_dist is None or dist < mejor_dist):
            mejor, mejor_dist = a, dist
    if mejor is not None:
        return _num(mejor.get("cantidad_personas"), 0.0), "camara"

    if aforos_manual:
        total = 0.0
        hay = False
        for a in aforos_manual:
            t = _a_datetime(a.get("hora_entrada") or a.get("fecha_hora"))
            if t is not None and t <= objetivo:
                total += _num(a.get("total_personas"), 0.0)
                hay = True
        if hay:
            return total, "taquilla"

    return None, None


def _mas_cercana(con_hora, objetivo: datetime, ventana: timedelta, variable: Optional[str] = None):
    """Lectura más cercana a `objetivo` dentro de la ventana (opcionalmente con `variable` válida)."""
    mejor, mejor_t, mejor_dist = None, None, None
    for m, t in con_hora:
        if variable is not None and valor_valido(variable, m.get(variable)) is None:
            continue
        dist = abs(t - objetivo)
        if dist <= ventana and (mejor_dist is None or dist < mejor_dist):
            mejor, mejor_t, mejor_dist = m, t, dist
    return mejor, mejor_t


def seleccionar_franjas(
    mediciones: List[Dict[str, Any]],
    aforos_camara: Optional[List[Dict[str, Any]]] = None,
    aforos_manual: Optional[List[Dict[str, Any]]] = None,
    horas=HORAS_FRANJA,
    ventana_horas: float = VENTANA_HORAS,
    fecha_ref: Optional[date] = None,
    perfiles: Optional[Dict[str, Dict[int, float]]] = None,
) -> List[Dict[str, Any]]:
    """Elige, para cada hora del dataset (8, 12, 16), la lectura más cercana.

    Devuelve 3 dicts con: hora, capturada, fecha_hora, ph, turbidez,
    temperatura, banistas, fuente_banistas, origen (por variable) y
    origen_general. Origen de cada valor:
      - "real":         medido por el sensor en esa franja
      - "estimada":     hubo lectura pero ese sensor falló -> se estimó
      - "pronosticada": la franja aún no ocurrió -> se pronosticó
      - "defecto":      sin ningún dato para estimar
    """
    aforos_camara = aforos_camara or []
    aforos_manual = aforos_manual or []
    perfiles = perfiles or {}
    ventana = timedelta(hours=ventana_horas)

    con_hora = [(m, _a_datetime(m.get("fecha_hora"))) for m in mediciones]
    con_hora = [(m, t) for m, t in con_hora if t is not None]

    if fecha_ref is None:
        fecha_ref = con_hora[0][1].date() if con_hora else date.today()

    if mediciones and not con_hora:
        # Compatibilidad: lecturas sin fecha_hora -> se asignan en orden a las franjas.
        mediciones = [
            {**m, "fecha_hora": datetime.combine(fecha_ref, time(hour=horas[i]))}
            for i, m in enumerate(mediciones[: len(horas)])
        ]
        con_hora = [(m, m["fecha_hora"]) for m in mediciones]

    con_hora.sort(key=lambda x: x[1])
    ultima_t = con_hora[-1][1] if con_hora else None

    franjas: List[Dict[str, Any]] = []
    for hora in horas:
        objetivo = datetime.combine(fecha_ref, time(hour=hora))
        elegido, elegido_t = _mas_cercana(con_hora, objetivo, ventana)
        ref = elegido_t or objetivo
        futura = elegido is None and (ultima_t is None or objetivo > ultima_t)

        franja: Dict[str, Any] = {
            "hora": f"{hora:02d}:00",
            "capturada": elegido is not None,
            "fecha_hora": elegido_t.isoformat() if elegido_t else None,
            "origen": {},
        }

        for var in VARIABLES_SENSOR:
            valor, origen = None, None
            if elegido is not None:
                valor = valor_valido(var, elegido.get(var))
                if valor is None:
                    # El sensor falló en esa lectura: ¿hay otra válida en la ventana?
                    otra, _ = _mas_cercana(con_hora, objetivo, ventana, variable=var)
                    if otra is not None:
                        valor = valor_valido(var, otra.get(var))
            if valor is not None:
                origen = "real"
            else:
                est = estimar_valor(mediciones, var, ref, perfiles.get(var))
                if est is not None:
                    valor = est["valor"]
                    origen = "pronosticada" if futura else "estimada"
                else:
                    valor, origen = VALORES_DEFECTO[var], "defecto"
            franja[var] = float(valor)
            franja["origen"][var] = origen

        # Bañistas: cámara/taquilla -> valor de la lectura -> pronóstico -> 0
        # (en franjas futuras se pronostica directamente)
        banistas, fuente = (None, None) if futura else _banistas_en(ref, ventana, aforos_camara, aforos_manual)
        origen_b = "real"
        if banistas is None and elegido is not None:
            propio = elegido.get("banistas", elegido.get("personas"))
            if propio is not None:
                banistas, fuente = _num(propio, 0.0), "lectura"
        if banistas is None:
            est = estimar_valor(mediciones, "banistas", ref, perfiles.get("banistas"), aforos_camara)
            if est is not None:
                banistas, fuente = round(est["valor"]), "pronostico"
                origen_b = "pronosticada" if futura else "estimada"
            else:
                banistas, fuente, origen_b = 0.0, None, "defecto"
        franja["banistas"] = float(banistas)
        franja["fuente_banistas"] = fuente
        franja["origen"]["banistas"] = origen_b

        origenes_sensor = [franja["origen"][v] for v in VARIABLES_SENSOR]
        if futura:
            franja["origen_general"] = "pronosticada"
        elif all(o == "real" for o in origenes_sensor):
            franja["origen_general"] = "real"
        else:
            franja["origen_general"] = "estimada"
        franjas.append(franja)

    return franjas


# ─────────────────────────────────────────────
# INFERENCIA
# ─────────────────────────────────────────────
def predecir_cierre_dia(
    mediciones_parciales: List[Dict[str, Any]],
    resumen_parcial: Dict[str, Any],
    aforos_camara: Optional[List[Dict[str, Any]]] = None,
    aforos_manual: Optional[List[Dict[str, Any]]] = None,
    perfiles: Optional[Dict[str, Dict[int, float]]] = None,
) -> Dict[str, Any]:
    """
    Realiza la inferencia para estimar las dosis de productos químicos necesarias al cierre del día.
    Usa las lecturas de las franjas 08:00, 12:00 y 16:00 (igual que el dataset).
    """
    import torch

    modelo, scaler_X, scaler_y = _cargar_artefactos()

    franjas = seleccionar_franjas(mediciones_parciales, aforos_camara, aforos_manual, perfiles=perfiles)
    # Orden de features idéntico al entrenamiento: [pH, turbidez, temperatura, bañistas]
    seq = [[f["ph"], f["turbidez"], f["temperatura"], f["banistas"]] for f in franjas]

    arr_seq = np.array([seq], dtype=float)  # (1, 3, 4)
    N, steps, feats = arr_seq.shape
    arr_flat = arr_seq.reshape(-1, feats)

    arr_flat_scaled = scaler_X.transform(arr_flat)
    arr_seq_scaled = arr_flat_scaled.reshape(N, steps, feats)

    with torch.no_grad():
        tensor_in = torch.tensor(arr_seq_scaled, dtype=torch.float32)
        pred_scaled = modelo(tensor_in).numpy()

    pred_real = scaler_y.inverse_transform(pred_scaled)[0]

    aluminio_g = float(np.clip(round(pred_real[0]), 0, 1000))
    cobre_g = float(np.clip(round(pred_real[1]), 0, 1000))
    cloro_g = float(np.clip(round(pred_real[2]), 0, 200))

    capturadas = sum(1 for f in franjas if f["capturada"])

    return {
        "aluminio_g": aluminio_g,
        "cobre_g": cobre_g,
        "cloro_g": cloro_g,
        "hora_prediccion": datetime.now().isoformat(),
        "mediciones_usadas": len(mediciones_parciales),
        "franjas": franjas,
        "franjas_capturadas": capturadas,
        "tipo": "final" if capturadas == len(franjas) else "parcial",
    }


def guardar_prediccion_db(id_jornada: int, resultado: Dict[str, Any], conn=None):
    if conn is None:
        return

    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO prediccion (id_jornada, fecha_prediccion, cloro_pred, aluminio_pred, cobre_pred)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                id_jornada,
                datetime.now(),
                resultado.get("cloro_g", 0),
                resultado.get("aluminio_g", 0),
                resultado.get("cobre_g", 0)
            )
        )
        conn.commit()
        cur.close()
    except Exception as exc:
        conn.rollback()
        print(f"⚠️ No se pudo guardar la predicción en BD: {exc}")
