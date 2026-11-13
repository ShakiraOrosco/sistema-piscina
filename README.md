# Sistema de Monitoreo y Dosificación Automática de Químicos

Sistema IoT para el monitoreo de parámetros de una piscina, gestión de dosificación automática y predicción mediante redes neuronales BiLSTM, estructurado bajo una **Arquitectura Cliente-Servidor**.

## Arquitectura del Proyecto (Cliente - Servidor)

```text
sistema-piscina/
├── frontend/                  # CLIENTE (SPA React + Vite + TailwindCSS)
│   ├── src/                   # Componentes, páginas, servicios HTTP y vistas en tiempo real
│   ├── e2e/                   # Pruebas End-to-End con Playwright
│   └── package.json
│
├── backend/                   # SERVIDOR (FastAPI + IA BiLSTM + IoT + Visión Artificial)
│   ├── app/                   # Núcleo de la API REST (FastAPI)
│   │   ├── main.py            # Punto de entrada del servidor
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

- **Cliente (Frontend):** React, Vite, TailwindCSS, Recharts, Lucide Icons.
- **Servidor (Backend):** Python, FastAPI, Uvicorn, PostgreSQL.
- **Inteligencia Artificial (en Backend):** PyTorch (BiLSTM), Scikit-Learn, XGBoost, Ultralytics YOLOv8.
- **IoT y Control Físico (en Backend):** ESP32 / Arduino (C++ / MicroPython), Comunicación HTTP REST y Serial USB.
