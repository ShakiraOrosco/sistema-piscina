import os
import sys
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")

sys.path.append(BACKEND_DIR)
from app.db import get_connection

csv_path = os.path.join(DATA_DIR, "dataset_mediciones_horas.csv")
if not os.path.exists(csv_path):
    csv_path = os.path.join("lstm", "data", "dataset_mediciones_horas.csv")

print(f"Cargando pretest desde: {csv_path}")
df_pre = pd.read_csv(csv_path)

print("Cargando postest desde base de datos Supabase...")
conn = get_connection()
df_post = pd.read_sql("""
    SELECT * FROM medicion 
    WHERE fecha_hora >= '2026-10-01' AND fecha_hora <= '2026-10-31 23:59:59'
    ORDER BY fecha_hora ASC
""", conn)
conn.close()

n_post = len(df_post)
print(f"Pretest: {len(df_pre)} registros | Postest (Octubre 2026): {n_post} registros")

# Estilo visual
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6), gridspec_kw={'width_ratios': [1, 1.7]})

# 1. Boxplot (Diagrama de Cajas)
data_to_plot = [df_pre['ph'], df_post['ph']]
box = ax1.boxplot(
    data_to_plot,
    patch_artist=True,
    tick_labels=[f'Pretest\n(Control Manual\nN={len(df_pre):,})', f'Postest\n(Sistema IoT\nN={n_post})'],
    medianprops=dict(color='black', linewidth=2),
    widths=0.45
)
colors = ['#ff9999', '#66b3ff']
for patch, color in zip(box['boxes'], colors):
    patch.set_facecolor(color)
    patch.set_alpha(0.75)

ax1.axhspan(7.2, 7.6, color='green', alpha=0.22, label='Rango Aceptable (7.2 - 7.6)')
ax1.set_ylabel('Nivel de pH', fontsize=11, fontweight='bold')
ax1.set_title('(a) Dispersión y Variabilidad del pH', fontsize=12, fontweight='bold')
ax1.set_ylim(5.5, 9.5)
ax1.legend(loc='upper right', framealpha=0.9)
ax1.grid(True, linestyle='--', alpha=0.6)

# 2. Serie Temporal / Líneas comparativas
n_samples = min(n_post, len(df_pre['ph']))
y_pre_sample = df_pre['ph'].iloc[-n_samples:].reset_index(drop=True)
y_post_sample = df_post['ph'].reset_index(drop=True)
x = np.arange(1, n_samples + 1)

ax2.plot(x, y_pre_sample, marker='o', markersize=2.5, linestyle='--', color='#d9534f', alpha=0.65, label=f'Pretest: Control Manual ({n_samples} lecturas)')
ax2.plot(x, y_post_sample, marker='s', markersize=2.5, linestyle='-', color='#0275d8', linewidth=1.6, alpha=0.85, label=f'Postest: Sistema IoT ({n_samples} lecturas)')
ax2.axhspan(7.2, 7.6, color='green', alpha=0.22, label='Banda Óptima (7.2 - 7.6)')
ax2.axhline(7.4, color='#28a745', linestyle=':', linewidth=1.5, label='pH Ideal (7.4)')

ax2.set_xlabel('Secuencia de Lecturas de Monitoreo (Octubre 2026)', fontsize=11, fontweight='bold')
ax2.set_ylabel('Nivel de pH', fontsize=11, fontweight='bold')
ax2.set_title('(b) Comportamiento Continuo y Estabilidad del pH', fontsize=12, fontweight='bold')
ax2.set_ylim(5.5, 9.5)
ax2.legend(loc='lower right', framealpha=0.9, fontsize=9.5)
ax2.grid(True, linestyle='--', alpha=0.6)

fig.suptitle('Figura 4.4: Comparación del pH antes y después de la implementación', fontsize=14, fontweight='bold', y=0.98)
plt.tight_layout()

# Guardar en rutas del proyecto
output_paths = [
    os.path.join(SCRIPT_DIR, "figura_4_4.png"),
    os.path.join(PROJECT_ROOT, "figura_4_4.png"),
]
for p in output_paths:
    os.makedirs(os.path.dirname(p), exist_ok=True)
    plt.savefig(p, dpi=300, bbox_inches='tight')
    print('Guardado exitoso en:', p)
plt.close()
