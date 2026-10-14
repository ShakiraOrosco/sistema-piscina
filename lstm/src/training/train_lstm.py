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
    Red Neuronal Recurrente LSTM con Regularización Dropout para prevenir sobreajuste.
    Entrada: (Batch, Seq_len=3, Features=4)
    Salida: (Batch, Targets=3) -> [aluminio_g, cobre_g, cloro_g]
    """
    def __init__(self, input_dim=4, hidden_dim=64, num_layers=2, output_dim=3, dropout=0.2):
        super(LSTMRegressor, self).__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0
        )
        self.fc1 = nn.Linear(hidden_dim, 32)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.fc2 = nn.Linear(32, output_dim)

    def forward(self, x):
        # x shape: (batch, 3, 4)
        out, (h_n, c_n) = self.lstm(x)
        # Usar la última salida temporal
        last_out = out[:, -1, :]
        h1 = self.dropout(self.relu(self.fc1(last_out)))
        output = self.fc2(h1)
        return output

def entrenar_modelo_lstm():
    print("=== INICIANDO ENTRENAMIENTO LSTM (PyTorch) ===")
    df = cargar_datos_csv()
    X_seq, _, y = construir_features_y_targets(df)
    
    # Preprocesar datos
    X_scaled, y_scaled, scaler_X, scaler_y = preprocesar_datos_lstm(X_seq, y, fit_scaler=True)
    
    # Dividir temporalmente
    X_tr, y_tr, X_val, y_val, X_te, y_te = dividir_datos(X_scaled, y_scaled)
    
    # Convertir a tensores de PyTorch
    X_tr_t = torch.tensor(X_tr, dtype=torch.float32)
    y_tr_t = torch.tensor(y_tr, dtype=torch.float32)
    X_val_t = torch.tensor(X_val, dtype=torch.float32)
    y_val_t = torch.tensor(y_val, dtype=torch.float32)
    
    train_dataset = TensorDataset(X_tr_t, y_tr_t)
    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    
    # Instanciar Modelo, Criterio y Optimizador
    model = LSTMRegressor(input_dim=4, hidden_dim=64, num_layers=2, output_dim=3, dropout=0.2)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    best_val_loss = float('inf')
    epochs = 100
    patience = 15
    patience_counter = 0
    
    train_losses = []
    val_losses = []
    
    model_save_path = os.path.join(MODELS_DIR, "lstm_piscina_model.pth")
    
    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        for batch_x, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * batch_x.size(0)
            
        epoch_train_loss = running_loss / len(X_tr_t)
        
        # Evaluación en validación
        model.eval()
        with torch.no_grad():
            val_outputs = model(X_val_t)
            epoch_val_loss = criterion(val_outputs, y_val_t).item()
            
        train_losses.append(epoch_train_loss)
        val_losses.append(epoch_val_loss)
        
        if epoch % 10 == 0 or epoch == 1:
            print(f"Época [{epoch:03d}/{epochs:03d}] - Train Loss: {epoch_train_loss:.5f} | Val Loss: {epoch_val_loss:.5f}")
            
        # Early Stopping
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
    
    # Gráfica de curva de aprendizaje
    plt.figure(figsize=(8, 4))
    plt.plot(train_losses, label='Pérdida Entrenamiento (Train MSE)')
    plt.plot(val_losses, label='Pérdida Validación (Val MSE)')
    plt.title('Curva de Aprendizaje - Modelo LSTM (Anti-Overfitting)')
    plt.xlabel('Época')
    plt.ylabel('Pérdida (MSE)')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(REPORTS_DIR, "curva_aprendizaje_lstm.png"))
    plt.close()
    
    return model, scaler_X, scaler_y

if __name__ == "__main__":
    entrenar_modelo_lstm()
