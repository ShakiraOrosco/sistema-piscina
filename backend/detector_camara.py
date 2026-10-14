import os
import sys
import time
import json
import threading
import requests

# URL del stream de video del ESP32-CAM
ESP32_CAM_URL = os.getenv("ESP32_CAM_URL", "http://10.0.1.242:8080/video")
API_AFORO_URL = os.getenv("API_AFORO_URL", "http://localhost:8000/api/v1/aforo-camara")
SHOW_WINDOW_ENV = os.getenv("SHOW_CAMERA_WINDOW", "false").lower() in ("true", "1", "yes")
INTERVALO_ENVIO_SEGUNDOS = 10.0

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "camera_roi_config.json")

_camera_thread = None
_stop_event = threading.Event()


def load_roi_config():
    """Carga la configuración de la geocerca (ROI) de piscina desde el archivo JSON."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ [ROI Config] Error al leer {CONFIG_PATH}: {e}")
    
    # Configuración por defecto (relativa 0.0 - 1.0)
    return {
        "enabled": True,
        "polygon_relative": [
            [0.05, 0.25],
            [0.95, 0.25],
            [0.98, 0.95],
            [0.02, 0.95]
        ]
    }


def save_roi_config(roi_config):
    """Guarda la configuración del ROI en formato JSON."""
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(roi_config, f, indent=2)
        print(f"✓ [ROI Config] Geocerca guardada con éxito en: {CONFIG_PATH}")
    except Exception as e:
        print(f"❌ [ROI Config] Error al guardar archivo ROI: {e}")


def get_abs_polygon(rel_polygon, frame_w, frame_h):
    """Convierte puntos relativos [0..1] a píxeles absolutos del frame."""
    import numpy as np
    pts = []
    for pt in rel_polygon:
        x = int(pt[0] * frame_w)
        y = int(pt[1] * frame_h)
        pts.append([x, y])
    return np.array(pts, dtype=np.int32)


def run_camera_detector(show_window: bool = False):
    """
    Procesador de detección YOLOv8 ultrarrápido con delimitación de Geocerca (ROI).
    Cuenta únicamente las personas cuyos pies caen dentro del área delimitada de la piscina.
    """
    try:
        import cv2
        import numpy as np
        from ultralytics import YOLO
    except ImportError as e:
        print(f"⚠️ [Cámara Service] No se pudo cargar cv2/ultralytics/numpy: {e}")
        return

    if SHOW_WINDOW_ENV:
        show_window = True

    print("⚡ [Cámara Service] Cargando modelo rápido YOLOv8...")
    try:
        model = YOLO("yolov8m.pt")
    except Exception as err:
        print(f"❌ [Cámara Service] Error cargando modelo YOLOv8: {err}")
        return

    roi_config = load_roi_config()
    print(f"📐 [Cámara Service] Geocerca activa: {roi_config.get('enabled', True)}")

    print(f"🎥 [Cámara Service] Conectando a stream ESP32-CAM: {ESP32_CAM_URL}")
    cap = cv2.VideoCapture(ESP32_CAM_URL)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    ultimo_envio_time = 0
    ultimo_conteo_enviado = -1

    while not _stop_event.is_set():
        if not cap.isOpened():
            print("⚠️ [Cámara Service] Stream no disponible. Reintentando conexión en 5s...")
            time.sleep(5.0)
            cap.open(ESP32_CAM_URL)
            continue

        ret, frame = cap.read()
        if not ret:
            time.sleep(0.2)
            continue

        try:
            h, w = frame.shape[:2]
            roi_enabled = roi_config.get("enabled", True)
            rel_polygon = roi_config.get("polygon_relative", [])

            abs_poly = None
            if roi_enabled and rel_polygon:
                abs_poly = get_abs_polygon(rel_polygon, w, h)

            # Inferencia optimizada (imgsz=640, solo personas classes=[0])
            results = model(frame, imgsz=640, conf=0.45, classes=[0], verbose=False)
            
            count_piscina = 0
            count_fuera = 0

            # Dibujar polígono del área de la piscina
            if show_window and abs_poly is not None:
                # Dibujar geocerca brillante
                cv2.polylines(frame, [abs_poly], isClosed=True, color=(255, 255, 0), thickness=2)
                # Sombra del polígono semitransparente
                overlay = frame.copy()
                cv2.fillPoly(overlay, [abs_poly], color=(255, 255, 0))
                cv2.addWeighted(overlay, 0.12, frame, 0.88, 0, frame)
                
                # Etiqueta de la geocerca
                label_x = int(abs_poly[0][0])
                label_y = max(25, int(abs_poly[0][1]) - 10)
                cv2.putText(frame, "ZONA PISCINA (ROI)", (label_x, label_y), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

            for r in results:
                for box in r.boxes:
                    confidence = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    # Punto base de la persona (pies / base central)
                    px = (x1 + x2) // 2
                    py = y2

                    # Determinar si el punto de apoyo está dentro de la piscina
                    dentro_piscina = True
                    if abs_poly is not None:
                        dist = cv2.pointPolygonTest(abs_poly, (float(px), float(py)), False)
                        dentro_piscina = (dist >= 0)

                    if dentro_piscina:
                        count_piscina += 1
                        if show_window:
                            # Recuadro verde para personas DENTRO de la piscina
                            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv2.circle(frame, (px, py), 5, (0, 255, 0), -1)
                            cv2.putText(frame, f'En piscina {confidence:.2f}', (x1, y1 - 8),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    else:
                        count_fuera += 1
                        if show_window:
                            # Recuadro gris/rojo para personas FUERA de la piscina
                            cv2.rectangle(frame, (x1, y1), (x2, y2), (100, 100, 255), 1)
                            cv2.circle(frame, (px, py), 4, (100, 100, 255), -1)
                            cv2.putText(frame, 'Fuera de piscina', (x1, y1 - 8),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 255), 1)

            tiempo_actual = time.time()
            if (tiempo_actual - ultimo_envio_time >= INTERVALO_ENVIO_SEGUNDOS) or (count_piscina != ultimo_conteo_enviado and tiempo_actual - ultimo_envio_time >= 1.5):
                try:
                    payload = {
                        "cantidad_personas": count_piscina,
                        "id_dispositivo": "ESP32-CAM-PISCINA"
                    }
                    res = requests.post(API_AFORO_URL, json=payload, timeout=1.5)
                    if res.status_code == 201:
                        print(f"✓ [Cámara -> BD] Bañistas en piscina: {count_piscina} (Fuera: {count_fuera})")
                        ultimo_envio_time = tiempo_actual
                        ultimo_conteo_enviado = count_piscina
                except Exception:
                    pass

            if show_window:
                # Panel de info en pantalla
                cv2.rectangle(frame, (10, 10), (320, 80), (0, 0, 0), -1)
                cv2.putText(frame, f'Bañistas en Piscina: {count_piscina}', (20, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f'Personas Alrededor: {count_fuera}', (20, 68),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

                cv2.imshow("Deteccion y Geocerca ESP32-CAM - Playa Azul", frame)
                if cv2.waitKey(1) == 27:
                    break

        except Exception as ex:
            print(f"⚠️ [Cámara Service] Error en frame: {ex}")
            time.sleep(0.2)

    cap.release()
    if show_window:
        cv2.destroyAllWindows()
    print("🛑 [Cámara Service] Servicio detenido.")


def interactive_roi_selector():
    """Herramienta gráfica para hacer clic y marcar los bordes de la piscina en la cámara."""
    import cv2
    import numpy as np

    print("🎥 Conectando a la cámara para selección gráfica de Geocerca...")
    cap = cv2.VideoCapture(ESP32_CAM_URL)
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        print("❌ No se pudo capturar un frame de la cámara. Usando imagen genérica...")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(frame, "Vista Previa Camara", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

    h, w = frame.shape[:2]
    selected_points = []

    def mouse_callback(event, x, y, flags, param):
        nonlocal selected_points
        if event == cv2.EVENT_LBUTTONDOWN:
            selected_points.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN:
            if selected_points:
                selected_points.pop()

    cv2.namedWindow("Selector de Geocerca (Haz Clic en bordes de Piscina)")
    cv2.setMouseCallback("Selector de Geocerca (Haz Clic en bordes de Piscina)", mouse_callback)

    print("\n--- INSTRUCCIONES SELECTOR ROI ---")
    print("1. Clic Izquierdo: Marcar esquina/borde de la piscina.")
    print("2. Clic Derecho: Deshacer último punto.")
    print("3. Tecla 'S': Guardar polígono y salir.")
    print("4. Tecla 'ESC': Cancelar sin guardar.\n")

    while True:
        display_frame = frame.copy()
        
        if len(selected_points) > 0:
            for pt in selected_points:
                cv2.circle(display_frame, pt, 5, (0, 255, 255), -1)
            
            if len(selected_points) >= 2:
                pts_arr = np.array(selected_points, dtype=np.int32)
                cv2.polylines(display_frame, [pts_arr], isClosed=True, color=(255, 255, 0), thickness=2)

        cv2.putText(display_frame, f"Puntos marcados: {len(selected_points)}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(display_frame, "Presiona 'S' para guardar | ESC para cancelar", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        cv2.imshow("Selector de Geocerca (Haz Clic en bordes de Piscina)", display_frame)
        key = cv2.waitKey(20) & 0xFF

        if key == ord('s') or key == ord('S'):
            if len(selected_points) >= 3:
                rel_poly = [[round(pt[0] / w, 4), round(pt[1] / h, 4)] for pt in selected_points]
                config = {
                    "enabled": True,
                    "polygon_relative": rel_poly
                }
                save_roi_config(config)
                print("✅ Geocerca actualizada correctamente.")
                break
            else:
                print("⚠️ Marca al menos 3 puntos para definir la piscina.")
        elif key == 27:
            print("❌ Cancelado sin guardar.")
            break

    cv2.destroyAllWindows()


def start_camera_service_background(show_window: bool = False):
    """Inicia la detección de cámara automáticamente en segundo plano."""
    global _camera_thread
    if _camera_thread is not None and _camera_thread.is_alive():
        return
    _stop_event.clear()
    _camera_thread = threading.Thread(target=run_camera_detector, kwargs={"show_window": show_window}, daemon=True)
    _camera_thread.start()
    print(f"🚀 [Cámara Service] Servicio automático iniciado en segundo plano (Ventana visible: {show_window or SHOW_WINDOW_ENV}).")


def stop_camera_service_background():
    _stop_event.set()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--select-roi":
        interactive_roi_selector()
    else:
        run_camera_detector(show_window=True)
