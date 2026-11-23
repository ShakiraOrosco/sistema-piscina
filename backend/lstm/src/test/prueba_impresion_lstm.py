import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Asegurar que la raíz del proyecto y `backend` estén en sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LSTM_DIR = os.path.dirname(os.path.dirname(CURRENT_DIR))
BACKEND_DIR = os.path.dirname(LSTM_DIR)
ROOT_DIR = os.path.dirname(BACKEND_DIR)
for p in (ROOT_DIR, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

import joblib
import numpy as np
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from backend.lstm.src.prediction.prediccion_service import predecir_cierre_dia
from backend.lstm.src.preprocesamiento.preprocesador import (
    MODELS_DIR,
    cargar_datos_csv,
    construir_features_y_targets,
    dividir_datos,
    preprocesar_datos_lstm,
)
from backend.lstm.src.training.train_lstm import LSTMRegressor


def imprimir_separador(titulo: str) -> None:
    print("\n" + "=" * 80)
    print(f"  {titulo}")
    print("=" * 80)


def prueba_1_modelo_y_arquitectura() -> tuple:
    imprimir_separador("1. CARGA DE ARTEFACTOS Y ARQUITECTURA DEL MODELO LSTM")

    lstm_path = os.path.join(MODELS_DIR, "lstm_piscina_model.pth")
    scaler_x_path = os.path.join(MODELS_DIR, "scaler_x.joblib")
    scaler_y_path = os.path.join(MODELS_DIR, "scaler_y.joblib")

    modelo = LSTMRegressor(
        input_dim=7, hidden_dim=64, num_layers=2, output_dim=3, bidirectional=True
    )
    modelo.load_state_dict(torch.load(lstm_path, map_location="cpu"))
    modelo.eval()

    scaler_x = joblib.load(scaler_x_path)
    scaler_y = joblib.load(scaler_y_path)

    total_params = sum(p.numel() for p in modelo.parameters())
    print(f"Modelo cargado desde : {lstm_path}")
    print(f"Scaler X cargado     : {scaler_x_path}")
    print(f"Scaler Y cargado     : {scaler_y_path}")
    print(f"Parámetros totales   : {total_params:,}")
    print("\nEstructura de red:")
    print(modelo)

    return modelo, scaler_x, scaler_y


def prueba_2_real_vs_predicho(modelo, scaler_x, scaler_y, n_muestras: int = 5) -> None:
    imprimir_separador("2. PRUEBA EN CONJUNTO DE TEST: DATOS DE ENTRADA + REAL VS. PREDICHO")

    df = cargar_datos_csv()
    X_seq, _, y = construir_features_y_targets(df)
    X_scaled, _, _, _ = preprocesar_datos_lstm(
        X_seq, y, fit_scaler=False, scaler_X=scaler_x, scaler_y=scaler_y
    )
    _, _, _, _, X_te, y_te = dividir_datos(X_scaled, y)
    val_end = int(len(X_seq) * 0.85)
    X_seq_te = X_seq[val_end:]
    df_te = df.iloc[val_end:].reset_index(drop=True)

    with torch.no_grad():
        tensor_te = torch.tensor(X_te, dtype=torch.float32)
        pred_scaled = modelo(tensor_te).numpy()

    pred_real = scaler_y.inverse_transform(pred_scaled)

    rmse = np.sqrt(mean_squared_error(y_te, pred_real))
    mae = mean_absolute_error(y_te, pred_real)
    r2 = r2_score(y_te, pred_real)

    print(f"Shape entrada X_test : {X_te.shape}  (muestras, franjas_horarias, features)")
    print(f"Métricas en Test     : RMSE = {rmse:.2f} g | MAE = {mae:.2f} g | R² = {r2:.4f}")

    franjas_hora = ("08:00", "12:00", "16:00")
    limite = min(n_muestras, len(y_te))
    for i in range(limite):
        fecha_str = f" | Fecha: {df_te.loc[i, 'fecha']}" if "fecha" in df_te.columns else ""
        print(f"\n--- Muestra de Test #{i + 1}{fecha_str} ---")
        print("  Datos de entrada:")
        for idx_h, hora in enumerate(franjas_hora):
            ph, turb, temp, ban = X_seq_te[i, idx_h, :4]
            print(
                f"    - {hora} -> pH={ph:.2f} | Turbidez={turb:.2f} NTU | "
                f"Temp={temp:.1f}°C | Bañistas={ban:.0f}"
            )

        r_al, r_cu, r_cl = y_te[i]
        p_al, p_cu, p_cl = pred_real[i]
        print("  Químicos (Valor Real vs. Valor Predicho):")
        print(
            f"    - Sulfato de Aluminio : Real = {r_al:7.1f} g | Predicho = {p_al:7.1f} g | Diff = {p_al - r_al:+6.1f} g"
        )
        print(
            f"    - Sulfato de Cobre    : Real = {r_cu:7.1f} g | Predicho = {p_cu:7.1f} g | Diff = {p_cu - r_cu:+6.1f} g"
        )
        print(
            f"    - Cloro               : Real = {r_cl:7.1f} g | Predicho = {p_cl:7.1f} g | Diff = {p_cl - r_cl:+6.1f} g"
        )


def prueba_3_escenarios_inferencia() -> None:
    imprimir_separador("3. PRUEBA DE INFERENCIA END-TO-END (predecir_cierre_dia)")

    escenarios = [
        {
            "nombre": "Escenario A: Día normal (3 franjas completas)",
            "mediciones": [
                {"fecha_hora": "2026-10-15T08:00:00", "ph": 7.2, "turbidez": 1.5, "temperatura": 25.5, "banistas": 10},
                {"fecha_hora": "2026-10-15T12:00:00", "ph": 7.3, "turbidez": 2.0, "temperatura": 27.0, "banistas": 35},
                {"fecha_hora": "2026-10-15T16:00:00", "ph": 7.4, "turbidez": 2.4, "temperatura": 26.8, "banistas": 25},
            ],
        },
        {
            "nombre": "Escenario B: Día crítico (alta turbidez, pH alto y alta concurrencia)",
            "mediciones": [
                {"fecha_hora": "2026-10-16T08:00:00", "ph": 7.5, "turbidez": 3.5, "temperatura": 27.0, "banistas": 25},
                {"fecha_hora": "2026-10-16T12:00:00", "ph": 7.7, "turbidez": 5.8, "temperatura": 29.0, "banistas": 85},
                {"fecha_hora": "2026-10-16T16:00:00", "ph": 7.8, "turbidez": 6.2, "temperatura": 28.5, "banistas": 70},
            ],
        },
        {
            "nombre": "Escenario C: Predicción parcial (solo lectura de las 08:00)",
            "mediciones": [
                {"fecha_hora": "2026-10-17T08:00:00", "ph": 7.2, "turbidez": 1.8, "temperatura": 25.0, "banistas": 12},
            ],
        },
    ]

    for esc in escenarios:
        print(f"\n>>> {esc['nombre']}")
        resultado = predecir_cierre_dia(esc["mediciones"], resumen_parcial={})

        print(f"    Tipo: {resultado['tipo']} | Franjas capturadas: {resultado['franjas_capturadas']}/3")
        for f in resultado["franjas"]:
            print(
                f"      - {f['hora']} [{f['origen_general']:<12}] -> "
                f"pH={f['ph']:.2f}, turbidez={f['turbidez']:.2f}, "
                f"temp={f['temperatura']:.1f}°C, bañistas={f['banistas']:.0f}"
            )
        print(
            f"    Dosis predicha -> "
            f"Aluminio: {resultado['aluminio_g']} g | "
            f"Cobre: {resultado['cobre_g']} g | "
            f"Cloro: {resultado['cloro_g']} g"
        )


def main() -> None:
    modelo, scaler_x, scaler_y = prueba_1_modelo_y_arquitectura()
    prueba_2_real_vs_predicho(modelo, scaler_x, scaler_y, n_muestras=8)
    prueba_3_escenarios_inferencia()
    print("\n" + "=" * 80)
    print("  PRUEBA DE IMPRESIÓN FINALIZADA CORRECTAMENTE")
    print("=" * 80)


if __name__ == "__main__":
    main()
