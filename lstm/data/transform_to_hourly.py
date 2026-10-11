import pandas as pd
import argparse
import os

def transform_to_hourly(input_file, output_mediciones, output_dosis):
    print(f"Leyendo dataset original: {input_file}")
    df = pd.read_csv(input_file)
    
    # Listas para almacenar las nuevas filas
    mediciones_rows = []
    dosis_rows = []
    
    # Horas correspondientes a cada medición (1, 2, 3)
    horas_medicion = {
        '1': '08:00:00',
        '2': '12:00:00',
        '3': '16:00:00'
    }
    
    for _, row in df.iterrows():
        fecha_base = row['fecha']
        id_jornada = row['id']
        
        # 1. Crear fila para el archivo de Dosificación (1 por día)
        dosis_rows.append({
            'id_jornada': id_jornada,
            'fecha': fecha_base,
            'dosis_cloro_g': row['dosis_cloro_g'],
            'dosis_sulfato_aluminio_g': row['dosis_sulfato_aluminio_g'],
            'dosis_sulfato_cobre_g': row['dosis_sulfato_cobre_g']
        })
        
        # 2. Crear filas para el archivo de Mediciones (3 por día)
        for num_medicion, hora in horas_medicion.items():
            mediciones_rows.append({
                'id_jornada': id_jornada,
                'fecha_hora': f"{fecha_base} {hora}",
                'ph': row[f'pH_{num_medicion}'],
                'temperatura': row[f'temperatura_{num_medicion}'],
                'turbidez': row[f'turbidez_{num_medicion}'],
                'banistas': row[f'banistas_{num_medicion}']
            })
            
    # Crear nuevos DataFrames
    df_mediciones = pd.DataFrame(mediciones_rows)
    df_dosis = pd.DataFrame(dosis_rows)
    
    # Guardar en CSV
    df_mediciones.to_csv(output_mediciones, index=False)
    df_dosis.to_csv(output_dosis, index=False)
    
    print(f"✅ Archivo de Mediciones guardado: {output_mediciones} ({len(df_mediciones)} filas)")
    print(f"✅ Archivo de Dosificación guardado: {output_dosis} ({len(df_dosis)} filas)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transforma el dataset diario a dos datasets relacionales.")
    parser.add_argument("--input", default="dataset_piscina.csv", help="Archivo CSV de entrada")
    parser.add_argument("--out-mediciones", default="dataset_mediciones_horas.csv", help="Archivo CSV salida de mediciones")
    parser.add_argument("--out-dosis", default="dataset_dosificacion_diaria.csv", help="Archivo CSV salida de dosis")
    
    args = parser.parse_args()
    
    input_path = os.path.join(os.path.dirname(__file__), args.input)
    out_med_path = os.path.join(os.path.dirname(__file__), args.out_mediciones)
    out_dos_path = os.path.join(os.path.dirname(__file__), args.out_dosis)
    
    if not os.path.exists(input_path):
        print(f"Error: No se encontró el archivo {input_path}")
    else:
        transform_to_hourly(input_path, out_med_path, out_dos_path)
