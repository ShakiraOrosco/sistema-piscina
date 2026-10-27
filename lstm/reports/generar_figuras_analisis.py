import os
import sys
import pandas as pd
import matplotlib.pyplot as plt

# Configuración de salida segura para Windows UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Localización dinámica de rutas
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)  # carpeta lstm
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
REPORTS_DIR = SCRIPT_DIR

# Buscar dataset_piscina.csv
posibles_rutas = [
    os.path.join(DATA_DIR, "dataset_piscina.csv"),
    os.path.join(os.path.dirname(PROJECT_ROOT), "lstm", "data", "dataset_piscina.csv"),
    "dataset_piscina.csv"
]

csv_path = None
for r in posibles_rutas:
    if os.path.exists(r):
        csv_path = r
        break

if not csv_path:
    raise FileNotFoundError("No se encontró el archivo 'dataset_piscina.csv'.")

print(f"Cargando dataset desde: {csv_path}")
df = pd.read_csv(csv_path, parse_dates=["fecha"])

# 1. Promedios por jornada
for p in ["pH", "turbidez", "temperatura"]:
    df[p] = df[[f"{p}_1", f"{p}_2", f"{p}_3"]].mean(axis=1)
df["banistas"] = df[["banistas_1", "banistas_2", "banistas_3"]].sum(axis=1)

# 2. Figura 4.1: evolución mensual con bandas de rango aceptable
try:
    mensual = df.set_index("fecha")[["pH", "turbidez", "temperatura"]].resample("ME").mean()
except Exception:
    mensual = df.set_index("fecha")[["pH", "turbidez", "temperatura"]].resample("M").mean()

rangos = {
    "pH": (7.2, 7.6),
    "turbidez": (1, 2),
    "temperatura": (26, 28)
}

unidades = {
    "pH": "pH",
    "turbidez": "NTU",
    "temperatura": "°C"
}

fig, ax = plt.subplots(3, 1, figsize=(10, 9), sharex=True)
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')

colores = {"pH": "#1f77b4", "turbidez": "#ff7f0e", "temperatura": "#d62728"}

for a, p in zip(ax, rangos):
    a.plot(mensual.index, mensual[p], marker="o", markersize=4, color=colores[p], label=f"{p} promedio mensual")
    a.axhspan(rangos[p][0], rangos[p][1], alpha=0.25, color="green", label=f"Rango aceptable ({rangos[p][0]} - {rangos[p][1]} {unidades[p]})")
    a.set_ylabel(f"{p} ({unidades[p]})", fontsize=11, fontweight='bold')
    a.grid(True, linestyle="--", alpha=0.6)
    a.legend(loc="upper right", framealpha=0.9)

ax[0].set_title("Figura 4.1: Evolución histórica de pH, turbidez y temperatura", fontsize=13, fontweight='bold', pad=12)
ax[2].set_xlabel("Fecha (Agrupación Mensual)", fontsize=11, fontweight='bold')

plt.tight_layout()
fig_4_1_path = os.path.join(REPORTS_DIR, "figura_4_1.png")
plt.savefig(fig_4_1_path, dpi=300)
# También guardar en la raíz si se ejecuta
if os.path.exists("package.json"):
    plt.savefig("figura_4_1.png", dpi=300)
plt.close()
print(f"-> Guardada: {fig_4_1_path}")

# 3. Figura 4.2: afluencia vs dosis
fig, ax = plt.subplots(1, 2, figsize=(12, 5))

# Subgráfico Cloro
ax[0].scatter(df["banistas"], df["dosis_cloro_g"], color="#2ca02c", alpha=0.6, s=16, edgecolors='none')
ax[0].set_title("Bañistas vs. Dosis de Cloro", fontsize=11, fontweight='bold')
ax[0].set_xlabel("Bañistas por jornada", fontsize=10, fontweight='bold')
ax[0].set_ylabel("Cloro (g)", fontsize=10, fontweight='bold')
ax[0].grid(True, linestyle="--", alpha=0.6)

# Subgráfico Sulfato de Aluminio
ax[1].scatter(df["banistas"], df["dosis_sulfato_aluminio_g"], color="#1f77b4", alpha=0.6, s=16, edgecolors='none')
ax[1].set_title("Bañistas vs. Dosis de Sulfato de Aluminio", fontsize=11, fontweight='bold')
ax[1].set_xlabel("Bañistas por jornada", fontsize=10, fontweight='bold')
ax[1].set_ylabel("Sulfato de aluminio (g)", fontsize=10, fontweight='bold')
ax[1].grid(True, linestyle="--", alpha=0.6)

fig.suptitle("Figura 4.2: Relación entre afluencia de bañistas y dosis de químicos", fontsize=13, fontweight='bold')
plt.tight_layout()
fig_4_2_path = os.path.join(REPORTS_DIR, "figura_4_2.png")
plt.savefig(fig_4_2_path, dpi=300)
if os.path.exists("package.json"):
    plt.savefig("figura_4_2.png", dpi=300)
plt.close()
print(f"-> Guardada: {fig_4_2_path}")

# 4. Cifras para el texto (análisis estadístico)
print("\n" + "="*50)
print("--- MATRIZ DE CORRELACIÓN ---")
print("="*50)
corr_matrix = df[["banistas", "dosis_cloro_g", "dosis_sulfato_aluminio_g", "temperatura"]].corr().round(2)
print(corr_matrix.to_string())

print("\n" + "="*50)
print("--- VARIACIÓN ENTRE JORNADAS (Jornada 3 - Jornada 1) ---")
print("="*50)
diff_ph = (df["pH_3"] - df["pH_1"]).mean()
diff_turb = (df["turbidez_3"] - df["turbidez_1"]).mean()
diff_temp = (df["temperatura_3"] - df["temperatura_1"]).mean()

print(f"Variación media de pH (Tarde - Mañana): {diff_ph:.2f}")
print(f"Variación media de Turbidez (Tarde - Mañana): {diff_turb:.2f} NTU")
print(f"Variación media de Temperatura (Tarde - Mañana): {diff_temp:.2f} °C")
