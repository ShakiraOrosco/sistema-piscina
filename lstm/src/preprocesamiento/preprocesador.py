import os
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import MinMaxScaler, StandardScaler

# Rutas predeterminadas
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATASET_PATH = os.path.join(BASE_DIR, "data", "dataset_piscina.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

def cargar_datos_csv(filepath: str = DATASET_PATH) -> pd.DataFrame:
    """Carga y limpia el dataset desde el archivo CSV."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"No se encontró el archivo de datos en: {filepath}")
    
    df = pd.read_csv(filepath)
    # Asegurar tipos numéricos en las columnas clave
    num_cols = [c for c in df.columns if c not in ["id", "fecha"]]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    
    return df

def extraer_features_paso(ph, turb, temp, banistas, ph_inicial):
    """
    Construye el vector de características de 7 dimensiones:
    1. pH
    2. Turbidez
    3. Temperatura
    4. Bañistas
    5. Delta pH (variación respecto a la mañana)
    6. Desviación de neutralidad (|pH - 7.4|)
    7. Carga biológica y térmica (Bañistas * Temp / 1000)
    """
    delta_ph = ph - ph_inicial
    dev_neutro = abs(ph - 7.4)
    carga_bio = (banistas * temp) / 1000.0
    return [ph, turb, temp, banistas, delta_ph, dev_neutro, carga_bio]

def construir_features_y_targets(df: pd.DataFrame):
    """
    Construye las matrices de características X y objetivos y a partir del DataFrame.
    Retorna:
      - X_seq: array 3D de forma (N_dias, 3_pasos, 7_features)
      - X_tabular: array 2D para modelos tabulares
      - y: array 2D (N_dias, 3_targets) [dosis_sulfato_aluminio_g, dosis_sulfato_cobre_g, dosis_cloro_g]
    """
    N = len(df)
    X_seq = np.zeros((N, 3, 7))
    X_tabular = []
    
    for i in range(N):
        row = df.iloc[i]
        turb1 = row["turbidez_1"] if "turbidez_1" in row else row["turbidez_visual_1"]
        turb2 = row["turbidez_2"] if "turbidez_2" in row else row["turbidez_visual_2"]
        turb3 = row["turbidez_3"] if "turbidez_3" in row else row["turbidez_visual_3"]

        ph1, temp1, ban1 = row["pH_1"], row["temperatura_1"], row["banistas_1"]
        ph2, temp2, ban2 = row["pH_2"], row["temperatura_2"], row["banistas_2"]
        ph3, temp3, ban3 = row["pH_3"], row["temperatura_3"], row["banistas_3"]

        # Momento 1, 2, 3 con 7 características
        m1 = extraer_features_paso(ph1, turb1, temp1, ban1, ph1)
        m2 = extraer_features_paso(ph2, turb2, temp2, ban2, ph1)
        m3 = extraer_features_paso(ph3, turb3, temp3, ban3, ph1)
        
        X_seq[i, 0, :] = m1
        X_seq[i, 1, :] = m2
        X_seq[i, 2, :] = m3
        
        # Estadísticas agregadas
        phs = [ph1, ph2, ph3]
        turbs = [turb1, turb2, turb3]
        temps = [temp1, temp2, temp3]
        banistas = [ban1, ban2, ban3]
        
        prom_ph = sum(phs) / 3.0
        max_ph = max(phs)
        min_ph = min(phs)
        prom_turb = sum(turbs) / 3.0
        max_turb = max(turbs)
        prom_temp = sum(temps) / 3.0
        total_banistas = sum(banistas)
        max_banistas = max(banistas)
        delta_ph_dia = ph3 - ph1
        dev_neutro_prom = sum(abs(p - 7.4) for p in phs) / 3.0
        carga_bio_total = sum((b * t) / 1000.0 for b, t in zip(banistas, temps))
        
        # Vector aplanado para XGBoost (21 mediciones/features + 11 estadísticas)
        vec_tab = m1 + m2 + m3 + [
            prom_ph, max_ph, min_ph, prom_turb, max_turb, prom_temp,
            total_banistas, max_banistas, delta_ph_dia, dev_neutro_prom, carga_bio_total
        ]
        X_tabular.append(vec_tab)
        
    X_tabular = np.array(X_tabular)
    
    # Objetivos en el orden: [aluminio_g, cobre_g, cloro_g]
    y = df[["dosis_sulfato_aluminio_g", "dosis_sulfato_cobre_g", "dosis_cloro_g"]].values
    
    return X_seq, X_tabular, y

def preprocesar_datos_lstm(X_seq, y, fit_scaler=True, scaler_X=None, scaler_y=None):
    """Normaliza los datos 3D para la red LSTM."""
    N, steps, feats = X_seq.shape
    X_flat = X_seq.reshape(-1, feats)
    
    if fit_scaler:
        scaler_X = MinMaxScaler()
        scaler_y = MinMaxScaler()
        X_flat_scaled = scaler_X.fit_transform(X_flat)
        y_scaled = scaler_y.fit_transform(y)
    else:
        X_flat_scaled = scaler_X.transform(X_flat)
        y_scaled = scaler_y.transform(y)
        
    X_scaled = X_flat_scaled.reshape(N, steps, feats)
    return X_scaled, y_scaled, scaler_X, scaler_y

def preprocesar_datos_xgboost(X_tab, y, fit_scaler=True, scaler_X=None):
    """Estandariza los datos 2D para XGBoost."""
    if fit_scaler:
        scaler_X = StandardScaler()
        X_scaled = scaler_X.fit_transform(X_tab)
    else:
        X_scaled = scaler_X.transform(X_tab)
    return X_scaled, y, scaler_X

def dividir_datos(X, y, train_ratio=0.70, val_ratio=0.15):
    """Divide respetando la secuencia temporal (70% train, 15% val, 15% test)."""
    N = len(X)
    train_end = int(N * train_ratio)
    val_end = int(N * (train_ratio + val_ratio))
    
    X_train, y_train = X[:train_end], y[:train_end]
    X_val, y_val = X[train_end:val_end], y[train_end:val_end]
    X_test, y_test = X[val_end:], y[val_end:]
    
    return X_train, y_train, X_val, y_val, X_test, y_test
