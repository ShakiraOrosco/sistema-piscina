# Sistema de Monitoreo y Dosificación Automática de Químicos

Sistema IoT para el monitoreo de parámetros de una piscina, gestión de dosificación automática y predicción mediante redes neuronales BiLSTM, estructurado bajo una **Arquitectura Cliente-Servidor**.

---

## 🐳 Despliegue con Docker (Acceso desde cualquier dispositivo)

El proyecto está completamente dockerizado con **Docker Compose**, lo que permite iniciarlo con un solo comando en cualquier sistema operativo (Windows, Linux, macOS o un servidor VPS/Raspberry Pi) y acceder a la interfaz y API desde cualquier dispositivo (computadoras, tablets o smartphones conectados a la red local o internet).

### 1. Requisitos Previos
- Tener instalado [Docker Desktop](https://www.docker.com/products/docker-desktop/) (en Windows/macOS) o `docker` + `docker compose` (en Linux).

### 2. Iniciar el sistema en segundo plano

```bash
docker compose up -d --build
```

Esto levantará automáticamente:
- **`piscina-backend`** (FastAPI en Python 3.11 con IA/LSTM en el puerto `8000`).
- **`piscina-frontend`** (React compilado servido con Nginx de alto rendimiento en el puerto `3000`).
- Configuración de proxy inverso en Nginx que enruta `/api/` hacia el backend sin problemas de CORS.

### 3. Acceder desde cualquier dispositivo

| Dispositivo | Dirección URL |
|---|---|
| **Misma máquina (Host)** | `http://localhost:3000` |
| **Cualquier dispositivo en la red WiFi / LAN** (celular, tablet, laptop) | `http://<IP-DEL-SERVIDOR>:3000` |
| **API REST & Documentación Swagger** | `http://<IP-DEL-SERVIDOR>:8000/docs` o `http://<IP-DEL-SERVIDOR>:3000/docs` |

> 💡 **Cómo saber la IP del servidor en la red local:**
> - En **Windows**: abre una terminal y ejecuta `ipconfig` (busca la *Dirección IPv4*, por ejemplo `192.168.1.45`).
> - En **Linux / macOS**: ejecuta `hostname -I` o `ifconfig`.
>
> Luego, desde cualquier celular o equipo conectado al mismo Wi-Fi, abre el navegador y escribe:  
> 👉 `http://192.168.1.45:3000`

### 4. Comandos útiles de Docker

- **Ver estado de los contenedores:**
  ```bash
  docker compose ps
  ```
- **Ver logs en tiempo real:**
  ```bash
  docker compose logs -f
  ```
- **Detener los servicios:**
  ```bash
  docker compose down
  ```

---

## Arquitectura del Proyecto (Cliente - Servidor)

```text
sistema-piscina/
├── docker-compose.yml         # Orquestación de contenedores (Frontend Nginx + Backend FastAPI)
├── .env                       # Credenciales de base de datos y entorno
├── frontend/                  # CLIENTE (SPA React + Vite + TailwindCSS)
│   ├── Dockerfile             # Multi-stage build (Node -> Nginx Alpine)
│   ├── nginx.conf             # Proxy inverso y soporte SPA
│   ├── src/                   # Componentes, páginas, servicios HTTP y vistas en tiempo real
│   ├── e2e/                   # Pruebas End-to-End con Playwright
│   └── package.json
│
├── backend/                   # SERVIDOR (FastAPI + IA BiLSTM + IoT + Visión Artificial)
│   ├── Dockerfile             # Entorno Python 3.11 con PyTorch CPU optimizado
│   ├── app/                   # Núcleo de la API REST (FastAPI)
│   │   ├── main.py            # Punto de entrada del servidor y configuración CORS
│   │   ├── config.py          # Configuración y variables de entorno
│   │   ├── db.py              # Conexión a PostgreSQL (Supabase)
│   │   ├── routers/           # Endpoints REST (monitoreo, dosificación, inventario, auth, caja, reportes, auditoría)
│   │   └── services/          # Lógica de negocio, control de actuadores e integración LSTM
│   ├── lstm/                  # Módulo de Inteligencia Artificial (BiLSTM & Pronóstico)
│   │   ├── data/              # Datasets históricos y transformación por horas
│   │   ├── models/            # Pesos entrenados (.pth) y escaladores (.joblib)
│   │   ├── reports/           # Gráficas de aprendizaje y evaluación comparativa
│   │   └── src/               # Preprocesamiento, entrenamiento e inferencia (prediccion_service.py)
│   ├── iot/                   # Módulo de Hardware IoT y Telemetría
│   │   ├── esp32/             # Firmware ESP32 (MicroPython y Arduino C++ .ino para bomba/válvula/flujo)
│   │   └── simulador_api.py   # Simulador de telemetría IoT hacia el servidor
│   ├── detector_camara.py     # Servicio de Visión Artificial (YOLOv8) para conteo de bañistas en ROI
│   ├── sql/                   # Scripts de base de datos y migraciones
│   └── requirements.txt       # Dependencias unificadas del servidor
│
└── tests/                     # Suite de pruebas unitarias y de integración (Pytest)
```

## Tecnologías Principales

- **Cliente (Frontend):** React, Vite, TailwindCSS, Recharts, Lucide Icons, Nginx.
- **Servidor (Backend):** Python, FastAPI, Uvicorn, PostgreSQL (Supabase).
- **Inteligencia Artificial (en Backend):** PyTorch (BiLSTM), Scikit-Learn, XGBoost, Ultralytics YOLOv8.
- **IoT y Control Físico (en Backend):** ESP32 / Arduino (C++ / MicroPython), Comunicación HTTP REST y Serial USB.
- **Contenedores y Despliegue:** Docker, Docker Compose, Nginx Reverse Proxy.
