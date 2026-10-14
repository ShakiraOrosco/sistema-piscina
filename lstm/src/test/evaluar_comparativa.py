import os
import joblib
import numpy as np
import pandas as pd
import torch
import matplotlib.pyplot as plt
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

from lstm.src.preprocesamiento.preprocesador import (
    cargar_datos_csv,
    construir_features_y_targets,
    preprocesar_datos_lstm,
    preprocesar_datos_xgboost,
    dividir_datos,
    MODELS_DIR,
)
from lstm.src.training.train_lstm import LSTMRegressor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

def calcular_metricas(y_true, y_pred):
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    return rmse, mae, r2

def evaluar_y_comparar():
    print("=== INICIANDO EVALUACIÓN Y COMPARATIVA DE MODELOS ===")
    df = cargar_datos_csv()
    X_seq, X_tab, y = construir_features_y_targets(df)
    
    # 1. Cargar artefactos LSTM
    lstm_path = os.path.join(MODELS_DIR, "lstm_piscina_model.pth")
    scaler_x_path = os.path.join(MODELS_DIR, "scaler_x.joblib")
    scaler_y_path = os.path.join(MODELS_DIR, "scaler_y.joblib")
    
    if not os.path.exists(lstm_path):
        raise FileNotFoundError("Primero debes entrenar el modelo LSTM.")
        
    modelo_lstm = LSTMRegressor(input_dim=4, hidden_dim=64, num_layers=2, output_dim=3)
    modelo_lstm.load_state_dict(torch.load(lstm_path))
    modelo_lstm.eval()
    
    scaler_X_lstm = joblib.load(scaler_x_path)
    scaler_y_lstm = joblib.load(scaler_y_path)
    
    # 2. Cargar artefactos XGBoost
    xgb_path = os.path.join(MODELS_DIR, "xgboost_piscina_model.joblib")
    scaler_x_xgb_path = os.path.join(MODELS_DIR, "scaler_xgb_x.joblib")
    
    if not os.path.exists(xgb_path):
        raise FileNotFoundError("Primero debes entrenar el modelo XGBoost.")
        
    modelo_xgb = joblib.load(xgb_path)
    scaler_X_xgb = joblib.load(scaler_x_xgb_path)
    
    # --- EVALUACIÓN LSTM ---
    X_lstm_scaled, _, _, _ = preprocesar_datos_lstm(
        X_seq, y, fit_scaler=False, scaler_X=scaler_X_lstm, scaler_y=scaler_y_lstm
    )
    X_tr_l, y_tr_l, _, _, X_te_l, y_te_l = dividir_datos(X_lstm_scaled, y)
    
    with torch.no_grad():
        X_tr_t = torch.tensor(X_tr_l, dtype=torch.float32)
        X_te_t = torch.tensor(X_te_l, dtype=torch.float32)
        
        pred_tr_l_scaled = modelo_lstm(X_tr_t).numpy()
        pred_te_l_scaled = modelo_lstm(X_te_t).numpy()
        
    pred_tr_l = scaler_y_lstm.inverse_transform(pred_tr_l_scaled)
    pred_te_l = scaler_y_lstm.inverse_transform(pred_te_l_scaled)
    
    rmse_tr_l, mae_tr_l, r2_tr_l = calcular_metricas(y_tr_l, pred_tr_l)
    rmse_te_l, mae_te_l, r2_te_l = calcular_metricas(y_te_l, pred_te_l)
    
    # --- EVALUACIÓN XGBOOST ---
    X_xgb_scaled, y_real, _ = preprocesar_datos_xgboost(
        X_tab, y, fit_scaler=False, scaler_X=scaler_X_xgb
    )
    X_tr_x, y_tr_x, _, _, X_te_x, y_te_x = dividir_datos(X_xgb_scaled, y_real)
    
    pred_tr_x = modelo_xgb.predict(X_tr_x)
    pred_te_x = modelo_xgb.predict(X_te_x)
    
    rmse_tr_x, mae_tr_x, r2_tr_x = calcular_metricas(y_tr_x, pred_tr_x)
    rmse_te_x, mae_te_x, r2_te_x = calcular_metricas(y_te_x, pred_te_x)
    
    # --- REPORTE EN CONSOLA ---
    print("\n" + "="*80)
    print("      TABLA COMPARATIVA DE DESEMPEÑO Y ANÁLISIS DE OVERFITTING")
    print("="*80)
    print(f"{'Métrica / Modelo':<22} | {'LSTM (Train)':<12} | {'LSTM (Test)':<12} | {'XGBoost (Train)':<14} | {'XGBoost (Test)':<14}")
    print("-" * 80)
    print(f"{'RMSE (Error Gramos)':<22} | {rmse_tr_l:<12.2f} | {rmse_te_l:<12.2f} | {rmse_tr_x:<14.2f} | {rmse_te_x:<14.2f}")
    print(f"{'MAE (Error Medio Abs)':<22} | {mae_tr_l:<12.2f} | {mae_te_l:<12.2f} | {mae_tr_x:<14.2f} | {mae_te_x:<14.2f}")
    print(f"{'R² Score (Precisión)':<22} | {r2_tr_l:<12.3f} | {r2_te_l:<12.3f} | {r2_tr_x:<14.3f} | {r2_te_x:<14.3f}")
    print("="*80)
    
    gap_lstm = abs(r2_tr_l - r2_te_l)
    gap_xgb = abs(r2_tr_x - r2_te_x)
    print(f"\n--> Brecha de R² (Train vs Test) LSTM   : {gap_lstm:.3f} ({'Excelente generalización' if gap_lstm < 0.15 else 'Posible sobreajuste'})")
    print(f"--> Brecha de R² (Train vs Test) XGBoost: {gap_xgb:.3f} ({'Excelente generalización' if gap_xgb < 0.15 else 'Posible sobreajuste'})")
    
    # --- GRÁFICO COMPARATIVO ---
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    modelos = ['LSTM Train', 'LSTM Test', 'XGBoost Train', 'XGBoost Test']
    rmses = [rmse_tr_l, rmse_te_l, rmse_tr_x, rmse_te_x]
    colores = ['#2b5c8f', '#4182c3', '#2e7d32', '#4caf50']
    
    axes[0].bar(modelos, rmses, color=colores)
    axes[0].set_title('Comparativa de RMSE (Menor es mejor)')
    axes[0].set_ylabel('Error en gramos')
    axes[0].grid(axis='y', linestyle='--', alpha=0.7)
    
    r2s = [r2_tr_l, r2_te_l, r2_tr_x, r2_te_x]
    axes[1].bar(modelos, r2s, color=colores)
    axes[1].set_title('Comparativa R² Score (Cercano a 1.0 es mejor)')
    axes[1].set_ylabel('Coeficiente de Determinación R²')
    axes[1].set_ylim(0, 1.05)
    axes[1].grid(axis='y', linestyle='--', alpha=0.7)
    
    plt.tight_layout()
    chart_path = os.path.join(REPORTS_DIR, "comparativa_modelos.png")
    plt.savefig(chart_path)
    plt.close()
    print(f"--> Gráfico de evaluación guardado en: {chart_path}")

if __name__ == "__main__":
    evaluar_y_comparar()
