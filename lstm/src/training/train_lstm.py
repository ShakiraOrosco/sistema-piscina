import os
import joblib
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import matplotlib.pyplot as plt

from lstm.src.preprocesamiento.preprocesador import (
    cargar_datos_csv,
    construir_features_y_targets,
    preprocesar_datos_lstm,
    dividir_datos,
    MODELS_DIR,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

class LSTMRegressor(nn.Module):
    """
    Red Neuronal Recurrente BiLSTM con regularización Dropout y conexiones bidireccionales.
    Entrada: (Batch, Seq_len=3, Features=7) [pH, turb, temp, bañistas, delta_pH, dev_neutro, carga_bio]
    Salida: (Batch, Targets=3) -> [aluminio_g, cobre_g, cloro_g]
    """
    def __init__(self, input_dim=7, hidden_dim=64, num_layers=2, output_dim=3, dropout=0.2, bidirectional=True):
        super(LSTMRegressor, self).__init__()
        self.bidirectional = bidirectional
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=bidirectional
        )
        fc_in = hidden_dim * 2 if bidirectional else hidden_dim
        self.fc1 = nn.Linear(fc_in, 32)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(32, output_dim)

    def forward(self, x):
        out, (h_n, c_n) = self.lstm(x)
        last_out = out[:, -1, :]
        h1 = self.dropout(self.relu(self.fc1(last_out)))
        output = self.fc2(h1)
        return output

# Alias para compatibilidad
BiLSTMRegressor = LSTMRegressor

def entrenar_modelo_lstm():
    print("=== INICIANDO ENTRENAMIENTO BI-LSTM OPTIMIZADO (PyTorch) ===")
    df = cargar_datos_csv()
    X_seq, _, y = construir_features_y_targets(df)
    
    # Preprocesar datos (MinMaxScaler)
    X_scaled, y_scaled, scaler_X, scaler_y = preprocesar_datos_lstm(X_seq, y, fit_scaler=True)
    
    # Dividir temporalmente (70% train, 15% val, 15% test)
    X_tr, y_tr, X_val, y_val, X_te, y_te = dividir_datos(X_scaled, y_scaled)
    
    # Convertir a tensores de PyTorch
    X_tr_t = torch.tensor(X_tr, dtype=torch.float32)
    y_tr_t = torch.tensor(y_tr, dtype=torch.float32)
    X_val_t = torch.tensor(X_val, dtype=torch.float32)
    y_val_t = torch.tensor(y_val, dtype=torch.float32)
    
    train_dataset = TensorDataset(X_tr_t, y_tr_t)
    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    
    # Modelo BiLSTM con 7 características
    model = LSTMRegressor(input_dim=7, hidden_dim=64, num_layers=2, output_dim=3, dropout=0.2, bidirectional=True)
    
    # Función de pérdida SmoothL1 (Huber Loss) para maximizar la precisión porcentual lineal
    criterion = nn.SmoothL1Loss(beta=0.05)
    optimizer = optim.Adam(model.parameters(), lr=0.002, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5)
    
    best_val_loss = float('inf')
    epochs = 100
    patience = 20
    patience_counter = 0
    
    train_losses = []
    val_losses = []
    train_losses_chem = [[] for _ in range(3)]
    val_losses_chem = [[] for _ in range(3)]
    
    model_save_path = os.path.join(MODELS_DIR, "lstm_piscina_model.pth")
    
    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        running_chem = [0.0, 0.0, 0.0]

        for batch_x, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()

            batch_count = batch_x.size(0)
            running_loss += loss.item() * batch_count
            for c in range(3):
                chem_loss = criterion(outputs[:, c], batch_y[:, c]).item()
                running_chem[c] += chem_loss * batch_count
            
        epoch_train_loss = running_loss / len(X_tr_t)
        train_losses.append(epoch_train_loss)
        for c in range(3):
            train_losses_chem[c].append(running_chem[c] / len(X_tr_t))
        
        # Evaluación en validación
        model.eval()
        with torch.no_grad():
            val_outputs = model(X_val_t)
            epoch_val_loss = criterion(val_outputs, y_val_t).item()
            for c in range(3):
                c_val = criterion(val_outputs[:, c], y_val_t[:, c]).item()
                val_losses_chem[c].append(c_val)
            
        val_losses.append(epoch_val_loss)
        scheduler.step(epoch_val_loss)
        
        if epoch % 10 == 0 or epoch == 1:
            print(f"Época [{epoch:03d}/{epochs:03d}] - Train Loss: {epoch_train_loss:.5f} | Val Loss: {epoch_val_loss:.5f}")
            
        # Early Stopping guardando los mejores pesos
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            patience_counter = 0
            torch.save(model.state_dict(), model_save_path)
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"--> Parada temprana (Early Stopping) activada en la época {epoch}")
                break
                
    # Guardar escaladores
    joblib.dump(scaler_X, os.path.join(MODELS_DIR, "scaler_x.joblib"))
    joblib.dump(scaler_y, os.path.join(MODELS_DIR, "scaler_y.joblib"))
    print("--> Modelo LSTM y escaladores guardados exitosamente en:", MODELS_DIR)
    
    # 1. Gráfica de curva de aprendizaje general
    plt.figure(figsize=(8, 4))
    plt.plot(train_losses, label='Pérdida Entrenamiento (Smooth L1 Loss)')
    plt.plot(val_losses, label='Pérdida Validación (Smooth L1 Loss)')
    plt.title('Curva de Aprendizaje - Modelo BiLSTM Optimizado (Anti-Overfitting)')
    plt.xlabel('Época')
    plt.ylabel('Pérdida (Smooth L1)')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(REPORTS_DIR, "curva_aprendizaje_lstm.png"))
    plt.close()

    # 2. Gráfica de curvas de aprendizaje individual por químico
    fig, axes = plt.subplots(3, 1, figsize=(9, 8), sharex=True)
    fig.suptitle('Curvas de Aprendizaje por Químico - Modelo BiLSTM', fontsize=11, y=0.98)
    nombres_chem = ['Sulfato de Aluminio', 'Sulfato de Cobre', 'Cloro']
    colores_chem = ['#1f77b4', '#2ca02c', '#d62728']
    for i in range(3):
        axes[i].plot(train_losses_chem[i], label='Train Loss', color=colores_chem[i], linewidth=1.5)
        axes[i].plot(val_losses_chem[i], label='Val Loss', color='#e65100', linestyle='--', linewidth=1.5)
        axes[i].set_ylabel(f'Loss ({nombres_chem[i]})', fontsize=9)
        axes[i].legend(loc='upper right', fontsize=8)
        axes[i].grid(True, linestyle=':', alpha=0.6)
        axes[i].tick_params(labelsize=8.5)
    axes[-1].set_xlabel('Época', fontsize=9)
    plt.tight_layout()
    plt.subplots_adjust(top=0.93, hspace=0.18)
    curva_chem_path = os.path.join(REPORTS_DIR, "curva_aprendizaje_por_quimico.png")
    plt.savefig(curva_chem_path, dpi=300)
    plt.close()
    print(f"--> Curva de aprendizaje por químico guardada en: {curva_chem_path}")

    # 3. Gráfica de predicción vs real de los químicos (60 jornadas)
    model.load_state_dict(torch.load(model_save_path))
    model.eval()
    with torch.no_grad():
        X_te_t = torch.tensor(X_te, dtype=torch.float32)
        pred_te_scaled = model(X_te_t).numpy()
    pred_te = scaler_y.inverse_transform(pred_te_scaled)
    y_te_orig = scaler_y.inverse_transform(y_te)
    graficar_prediccion_dosis_quimicos(y_te_orig, pred_te, n_jornadas=60)
    
    return model, scaler_X, scaler_y


def graficar_prediccion_dosis_quimicos(y_true, y_pred, n_jornadas=60, filename="prediccion_vs_real_quimicos.png"):
    """
    Genera el gráfico comparativo de dosis real vs. predicha para cada químico:
      - aluminio_g (g)
      - cobre_g (g)
      - cloro_g (g)
    en una serie temporal de N jornadas.
    """
    n_puntos = min(n_jornadas, len(y_true))
    x = np.arange(n_puntos)

    quimicos_info = [
        {"nombre": "aluminio_g (g)", "idx": 0, "legend_loc": "lower right"},
        {"nombre": "cobre_g (g)", "idx": 1, "legend_loc": "upper left"},
        {"nombre": "cloro_g (g)", "idx": 2, "legend_loc": "upper right"},
    ]

    fig, axes = plt.subplots(3, 1, figsize=(11, 7.5), sharex=True)
    fig.suptitle("Predicción de dosis al cierre vs. dosis real aplicada (BiLSTM)", fontsize=11, y=0.98)

    for i, q in enumerate(quimicos_info):
        ax = axes[i]
        real_vals = y_true[:n_puntos, q["idx"]]
        pred_vals = y_pred[:n_puntos, q["idx"]]

        ax.plot(x, real_vals, color="#1f77b4", label="real", linewidth=1.4)
        ax.plot(x, pred_vals, color="#ff7f0e", linestyle="--", label="predicción", linewidth=1.4)
        ax.set_ylabel(q["nombre"], fontsize=9)
        ax.legend(loc=q["legend_loc"], fontsize=8, framealpha=0.9)
        ax.tick_params(labelsize=8.5)

    axes[-1].set_xlabel("Jornada", fontsize=9)
    plt.tight_layout()
    plt.subplots_adjust(top=0.94, hspace=0.15)
    
    out_path = os.path.join(REPORTS_DIR, filename)
    plt.savefig(out_path, dpi=300)
    plt.close()
    print(f"--> Gráfico de dosis real vs predicción guardado en: {out_path}")


if __name__ == "__main__":
    entrenar_modelo_lstm()
