import os
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.multioutput import MultiOutputRegressor

from lstm.src.preprocesamiento.preprocesador import (
    cargar_datos_csv,
    construir_features_y_targets,
    preprocesar_datos_xgboost,
    dividir_datos,
    MODELS_DIR,
)

def entrenar_modelo_xgboost():
    print("=== INICIANDO ENTRENAMIENTO XGBOOST ===")
    df = cargar_datos_csv()
    _, X_tab, y = construir_features_y_targets(df)
    
    # Preprocesar datos para XGBoost
    X_scaled, y_real, scaler_X = preprocesar_datos_xgboost(X_tab, y, fit_scaler=True)
    
    # Dividir
    X_train, y_train, X_val, y_val, X_test, y_test = dividir_datos(X_scaled, y_real)
    
    # Modelo XGBoost Regressor acotado anti-overfitting
    xgb_base = xgb.XGBRegressor(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42
    )
    
    modelo_multi = MultiOutputRegressor(xgb_base)
    modelo_multi.fit(X_train, y_train)
    
    # Guardar modelo y escalador
    joblib.dump(modelo_multi, os.path.join(MODELS_DIR, "xgboost_piscina_model.joblib"))
    joblib.dump(scaler_X, os.path.join(MODELS_DIR, "scaler_xgb_x.joblib"))
    print("--> Modelo XGBoost guardado en:", MODELS_DIR)
    
    return modelo_multi, scaler_X

if __name__ == "__main__":
    entrenar_modelo_xgboost()
