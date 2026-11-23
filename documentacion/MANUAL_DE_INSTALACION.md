# MANUAL DE INSTALACIÓN Y GUÍA DE ENTREGA DEL PROYECTO DE GRADO

---

**UNIVERSIDAD / INSTITUCIÓN ACADÉMICA**  
**CARRERA DE INGENIERÍA DE SISTEMAS / INFORMÁTICA**  
**PROYECTO DE GRADO**

# SISTEMA DE MONITOREO Y DOSIFICACIÓN AUTOMÁTICA DE QUÍMICOS PARA PISCINAS MEDIANTE REDES NEURONALES BiLSTM E IoT

**Postulante:** Shakira Orosco Gutierrez  
**Fecha de Entrega:** 02 de Diciembre de 2026  
**Versión del Sistema:** 1.0.0 (Producción / Release)  
**Ambiente:** Cliente-Servidor (FastAPI + React + Supabase Cloud + PyTorch BiLSTM + ESP32)

---

## 1. INTRODUCCIÓN

Este manual proporciona instrucciones detalladas para la instalación, configuración y puesta en marcha del **Sistema de Monitoreo y Dosificación Automática de Químicos para Piscinas**.

El software está construido bajo una **Arquitectura Cliente-Servidor** desacoplada:
* **Servidor (Backend & IA):** Desarrollado en Python con el framework **FastAPI**, integra un motor de inferencia de redes neuronales recurrentes **BiLSTM (Bidirectional Long Short-Term Memory)** sobre **PyTorch**, algoritmos complementarios con **XGBoost/Scikit-Learn**, módulos de visión artificial con **YOLOv8** y conectividad IoT para actuadores y telemetría.
* **Cliente (Frontend):** Single Page Application (SPA) desarrollada en **React 19**, construida con **Vite**, estilizada con **TailwindCSS** y desplegada mediante un servidor proxy inverso **Nginx**.
* **Base de Datos y Servicios en la Nube:** Alojada en la nube mediante **PostgreSQL en Supabase Cloud**, bajo el esquema relacional `piscina_lstm3`.

Siga los pasos a continuación según su entorno para completar la instalación de forma exitosa.

---

## 2. REQUISITOS PREVIOS

### 2.1 Requisitos del Sistema (Hardware Mínimo y Recomendado)

| Componente | Requisito Mínimo | Requisito Recomendado |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows 10/11 (64-bit), Ubuntu Linux 20.04/22.04 LTS, o macOS Catalina+ | Windows 11 Pro (64-bit) o Ubuntu 22.04 LTS Server/Desktop |
| **Procesador (CPU)** | Intel Core i3 / AMD Ryzen 3 (2.0 GHz, 2 núcleos) | Intel Core i5/i7 o AMD Ryzen 5/7 (4+ núcleos, 2.5 GHz+) |
| **Memoria RAM** | 4 GB | 8 GB o 16 GB (para entrenamiento IA y Docker) |
| **Espacio en Disco** | 5 GB libres de almacenamiento | 15 GB libres (SSD recomendado para Docker y modelos) |
| **Red / Conectividad** | Conexión a Internet (acceso a Supabase Cloud y descargas) | Red de área local (LAN / Wi-Fi) para acceso multidispositivo |
| **Hardware Opcional** | Puertos USB (para conectar ESP32/Arduino de dosificación) | Cámara USB / RTSP / ESP32-CAM para visión artificial |

---

### 2.2 Dependencias Necesarias (Software Base)

Para ejecutar el proyecto, se puede optar por el **Método 1 (Contenedores con Docker - Recomendado)** o el **Método 2 (Instalación Nativa por Componentes)**:

#### Para el Método 1 (Docker - Todo en uno):
* **Docker Desktop** (en Windows/macOS con motor WSL2 habilitado) o **Docker Engine + Docker Compose v2** (en Linux).
* **Git** (para clonar y versionar el repositorio).

#### Para el Método 2 (Instalación Nativa en el Sistema):
* **Python:** Versión **3.10 o 3.11** (64-bit) con `pip` y `venv`. *(Nota: Python 3.12+ puede presentar problemas con librerías compiladas de PyTorch/Torchvision si no están precompiladas).*
* **Node.js:** Versión **20.x LTS o 22.x LTS** (incluye `npm` v10+).
* **Base de Datos:** Acceso a instancia **PostgreSQL 15+** (Local o en **Supabase Cloud**).
* **Gestor de paquetes:** `pip` actualizado (`python -m pip install --upgrade pip`).

---

## 3. INSTALACIÓN

### MÉTODO A: DESPLIEGUE RÁPIDO CON DOCKER (RECOMENDADO MULTIPLATAFORMA)

Este método levanta el Frontend (Nginx), el Backend (FastAPI + PyTorch) y la orquestación de red automáticamente en 1 solo paso:

1. **Clonar o descomprimir el proyecto:**
   ```bash
   cd sistema-piscina
   ```

2. **Verificar el archivo de variables de entorno `.env`:**
   Asegúrese de que el archivo `.env` exista en la raíz del proyecto con las credenciales de la base de datos (ver Sección 4 de este manual).

3. **Compilar y levantar los contenedores:**
   ```bash
   docker compose up -d --build
   ```

4. **Verificar el estado de los servicios:**
   ```bash
   docker compose ps
   ```
   *Debe observar `piscina-backend` escuchando en el puerto `8000` y `piscina-frontend` en el puerto `3000`.*

---

### MÉTODO B: INSTALACIÓN PASO A PASO EN WINDOWS

#### Paso 1: Clonar o extraer el proyecto
Abra una terminal de **PowerShell** o **CMD** como Administrador y sitúese en la carpeta del proyecto:
```powershell
cd C:\ruta\del\proyecto\sistema-piscina
```

#### Paso 2: Configurar el Entorno del Backend (FastAPI + IA BiLSTM)
1. Ingrese a la carpeta `backend`:
   ```powershell
   cd backend
   ```
2. Cree un entorno virtual de Python:
   ```powershell
   python -m venv venv
   ```
3. Active el entorno virtual:
   ```powershell
   .\venv\Scripts\activate
   ```
   *(Si PowerShell bloquea la ejecución de scripts, ejecute previamente: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*.
4. Actualice el gestor de paquetes `pip`:
   ```powershell
   python -m pip install --upgrade pip
   ```
5. Instale todas las dependencias del servidor y de la red neuronal:
   ```powershell
   pip install -r requirements.txt
   ```
6. Regrese a la raíz del proyecto para que las variables de entorno se detecten correctamente:
   ```powershell
   cd ..
   ```
7. Inicie el servidor backend en modo desarrollo:
   ```powershell
   python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *El servidor quedará activo en `http://localhost:8000` y la documentación interactiva en `http://localhost:8000/docs`.*

#### Paso 3: Configurar el Entorno del Frontend (React + Vite)
Abra una **segunda ventana de terminal**:
1. Navegue a la carpeta del frontend:
   ```powershell
   cd C:\ruta\del\proyecto\sistema-piscina\frontend
   ```
2. Instale los módulos de Node.js:
   ```powershell
   npm install
   ```
3. Inicie el servidor de desarrollo Vite:
   ```powershell
   npm run dev -- --host 0.0.0.0
   ```
   *La aplicación web estará disponible en `http://localhost:5173` o `http://localhost:3000`.*

---

### MÉTODO C: INSTALACIÓN PASO A PASO EN LINUX (UBUNTU / DEBIAN)

#### Paso 1: Actualizar el sistema e instalar dependencias base
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3 python3-pip python3-venv git curl build-essential libpq-dev
```

#### Paso 2: Instalar Node.js LTS (Versión 20.x o 22.x)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Paso 3: Configurar el Backend
```bash
cd sistema-piscina/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd ..
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

#### Paso 4: Configurar el Frontend
En otra consola:
```bash
cd sistema-piscina/frontend
npm install
npm run build     # Para generar la carpeta /dist optimizada para producción
npm run preview -- --host 0.0.0.0 --port 3000
```

---

### MÉTODO D: ACCESO Y OPERACIÓN DESDE DISPOSITIVOS MÓVILES (ANDROID / iOS)

El sistema ha sido diseñado como una **Aplicación Web Responsiva (Mobile First & PWA-ready)**. No requiere instalación forzada de una APK pesada en la Play Store, permitiendo a los operadores de piscina, administradores y personal técnico gestionar el sistema desde cualquier smartphone o tablet conectado a la red local.

#### Pasos para acceder desde un celular Android o iOS:
1. **Identificar la dirección IP del servidor host:**
   * En **Windows**: abra CMD y ejecute `ipconfig`. Localice la **Dirección IPv4** (ejemplo: `192.168.1.50`).
   * En **Linux**: ejecute `hostname -I` o `ip addr show`.
2. **Conectar el celular a la misma red Wi-Fi** donde está corriendo el servidor.
3. **Abrir el navegador móvil (Google Chrome, Safari, Firefox):**
   * Ingrese a la URL:  
     `http://<IP-DEL-SERVIDOR>:3000` (con Docker)  
     o `http://<IP-DEL-SERVIDOR>:5173` (con Vite dev).  
     *Ejemplo real: `http://192.168.1.50:3000`*
4. **Instalar como Acceso Directo (PWA / Modo App):**
   * En **Google Chrome (Android)**: Toque el menú de 3 puntos `⋮` > Seleccione **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
   * En **Safari (iOS / iPhone)**: Toque el botón de compartir `Compartir` > Seleccione **"Agregar al inicio"**.
   * Esto creará un icono directo en el escritorio del móvil con experiencia a pantalla completa como una app nativa.

---

## 4. CONFIGURACIÓN ADICIONAL Y SERVICIOS EN LA NUBE

### 4.1 Configuración de la Base de Datos (Supabase Cloud / PostgreSQL)

El sistema utiliza **Supabase Cloud**, un servicio administrado de PostgreSQL de alta disponibilidad y latencia reducida.

#### Estructura del archivo `.env` en la raíz del proyecto:
Cree o verifique el archivo `.env` en `sistema-piscina/.env`:

```env
# ==========================================
# BASE DE DATOS SUPABASE / POSTGRESQL (CLOUD)
# ==========================================
SUPABASE_DB_HOST=aws-0-us-east-2.pooler.supabase.com
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.magihsdcxcjmfdjechvc
SUPABASE_DB_PASSWORD=LSTM_piscinaIOT

# ==========================================
# SEGURIDAD, TOKENS Y AUTENTICACIÓN JWT
# ==========================================
JWT_SECRET=super-clave-secreta-tesis-piscina-2026-segura
JWT_EXPIRES_MINUTES=60

# ==========================================
# POLÍTICA CORS (PERMITIR ACCESO MULTIDISPOSITIVO)
# ==========================================
CORS_ORIGINS=*

# ==========================================
# SERVICIO DE NOTIFICACIONES POR CORREO (SMTP)
# ==========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=shakiraog2005@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SMTP_FROM=shakiraog2005@gmail.com
SMTP_USE_TLS=true

# ==========================================
# VISIÓN ARTIFICIAL & CÁMARA (YOLOv8)
# ==========================================
AUTO_START_CAMERA=false
ESP32_CAM_URL=http://192.168.1.242:8080/video
```

#### Esquema de Base de Datos `piscina_lstm3`:
El software utiliza un esquema dedicado denominado `piscina_lstm3`.  
Las tablas principales son:
* `usuario`: Credenciales de acceso, contraseñas hasheadas en `bcrypt`, roles (ADM, OPERADOR), estado 2FA.
* `lectura_sensor`: Historial de lecturas de pH, turbidez, temperatura del agua y aforo de personas.
* `prediccion_ia`: Almacenamiento de proyecciones a 24/48 horas generadas por la red BiLSTM.
* `dosificacion_quimica`: Registro de químicos sugeridos y aplicados (Cloro granulado, pH+, pH-).
* `inventario_quimicos`: Control de stock, lotes, fechas de vencimiento y consumos.
* `caja`: Ingresos, egresos, caja chica y arqueos de la administración de la piscina.
* `auditoria`: Trazabilidad completa y logs de eventos de seguridad.

> **Importación de Respaldo:** En la carpeta `Backups_BD/` de la entrega se encuentra el script completo `backup_piscina_lstm3.sql`. Para restaurar en una base de datos PostgreSQL en blanco, ejecute:
> ```bash
> psql -h <HOST> -U postgres -d postgres -f Backups_BD/backup_piscina_lstm3.sql
> ```

---

### 4.2 Credenciales Iniciales de Acceso al Sistema

Una vez levantado el sistema, ingrese a la interfaz web con el usuario administrador inicial preconfigurado:
* **URL:** `http://localhost:3000` (o `http://<IP-LOCAL>:3000`)
* **Correo Electrónico:** `shakiraog2005@gmail.com`
* **Contraseña:** `admin1234`
* **Rol:** Administrador del Sistema (`ADM`)

---

### 4.3 Módulo de Inteligencia Artificial (Red Neuronal BiLSTM)

El sistema cuenta con un modelo previamente entrenado y validado ubicado en `backend/lstm/models/`:
* `lstm_piscina_model.pth`: Pesos de la red neuronal bidireccional (PyTorch).
* `xgboost_piscina_model.joblib`: Modelo de ensamble de árboles de decisión para comparación y ajuste.
* `scaler_x.joblib` y `scaler_y.joblib`: Normalizadores estadísticos MinMax para variables de entrada y salida.

**Ejecución del Inferencia de IA:**  
El backend carga automáticamente los modelos en memoria durante el inicio (`prediccion_service.py`), permitiendo que el dashboard del Frontend muestre pronósticos en tiempo real y sugerencias automáticas de dosificación química basadas en la carga de bañistas proyectada.

---

### 4.4 Módulo IoT y Simulador de Telemetría

Para pruebas de defensa o demostración sin necesidad de sumergir sensores físicos en agua:
1. Asegúrese de que el backend esté ejecutándose en el puerto 8000.
2. Abra una consola y ejecute el simulador de hardware IoT:
   ```bash
   python backend/iot/simulador_api.py --escenario normal --pausa 3
   ```
   *Escenarios disponibles:* `normal`, `cargado`, `critico`, `aleatorio`.  
   El simulador enviará lecturas telemétricas simuladas (pH, turbidez, temperatura, bañistas) y el dashboard de React se actualizará en tiempo real.

---

## 5. SOLUCIÓN DE PROBLEMAS COMUNES (TROUBLESHOOTING)

| Problema / Error | Causa Probable | Solución |
| :--- | :--- | :--- |
| **Error: `connection to server at pooler.supabase.com failed`** | Bloqueo en el puerto 5432 o firewall corporativo. | En `.env`, cambiar temporalmente el puerto `SUPABASE_DB_PORT=6543` (modo Session Pooler de Supabase) o verificar conexión a internet. |
| **Error: `Address already in use` (Puerto 8000 o 3000 ocupado)** | Existe otra instancia de Python, Node o Docker corriendo en el mismo puerto. | En Windows: `netstat -ano \| findstr :8000` y finalizar la tarea con `taskkill /F /PID <PID>`. En Linux: `fuser -k 8000/tcp`. |
| **CORS Policy Error en el Navegador** | El frontend intenta llamar a una IP distinta a la autorizada. | En `.env`, verificar que `CORS_ORIGINS=*` esté configurado y reiniciar el backend. |
| **Error de PyTorch / C++ Build Tools al hacer `pip install`** | Versión de Python incompatible (ej. Python 3.12+ donde no hay wheels binarias de PyTorch). | Instalar Python 3.10 o 3.11 de 64 bits y reinstalar las dependencias en un nuevo entorno virtual. |
| **Error: `User was blocked due to multiple failed login attempts`** | Se ingresó una contraseña incorrecta más de 3 veces. | El sistema cuenta con protección contra fuerza bruta. Espere 5 minutos para el desbloqueo automático o reinicie el servicio backend en modo local. |

---

# GUÍA DE ENTREGA EN DIGITAL DEL PROYECTO DE GRADO

En cumplimiento de las instrucciones de la asignatura y reglamento de titulación, la entrega física del medio de almacenamiento se realizará bajo los siguientes lineamientos:

### 1. REQUISITOS DEL MEDIO DE ALMACENAMIENTO FÍSICO
* **Soporte Físico:** Unidad Flash USB (Pendrive) de 8 GB o 16 GB, o en su defecto estuche con DVD-R / DVD-RW legible.
* **Estado:** Dispositivo completamente formateado, verificado con antivirus actualizado y libre de cualquier archivo ajeno al proyecto de grado.
* **Nota Importante:** El medio de almacenamiento entregado **no será devuelto**, quedando en custodia para el archivo académico y evaluación del tribunal.

---

### 2. FORMATO DE ROTULADO DEL DISPOSITIVO FÍSICO
El dispositivo físico (estuche o etiqueta del pendrive/DVD) debe estar rotulado con letra clara y legible de la siguiente forma:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PROYECTO DE GRADO - ENTREGA DIGITAL FINAL                              │
│                                                                        │
│ PROYECTO: Sistema de Monitoreo y Dosificación Automática de Químicos  │
│           para Piscinas mediante Redes Neuronales BiLSTM e IoT         │
│ ESTUDIANTE: Shakira Orosco Gutierrez                                   │
│ CARRERA:    Ingeniería de Sistemas / Informática                       │
│ FECHA:      02 de Diciembre de 2026                                    │
│ CONTACTO:   shakiraog2005@gmail.com                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 3. ESTRUCTURA DE CARPETAS EN LA UNIDAD DIGITAL

Se debe crear una carpeta raíz con el nombre del proyecto `SISTEMA_PISCINA_IOT_LSTM/` y dentro de ella la siguiente estructura rigurosamente organizada:

```text
SISTEMA_PISCINA_IOT_LSTM/
│
├── 1_Codigo_Fuente/
│   ├── Backend/
│   │   ├── app/                      # Controladores, servicios, modelos y rutas REST
│   │   ├── lstm/                     # Código de entrenamiento y arquitectura de la red BiLSTM
│   │   ├── iot/                      # Scripts de comunicación con hardware ESP32 y simulador
│   │   ├── Dockerfile                # Configuración de contenedor Python 3.11
│   │   └── requirements.txt          # Dependencias y librerías del backend
│   ├── Frontend/
│   │   ├── src/                      # Código fuente React (Componentes, Dashboard, Vistas)
│   │   ├── public/                   # Recursos estáticos, favicon y logos
│   │   ├── Dockerfile                # Multi-stage build Nginx Alpine
│   │   ├── nginx.conf                # Configuración de proxy y rutas SPA
│   │   └── package.json              # Dependencias y scripts de Node.js
│   ├── IoT_Firmware/
│   │   ├── firmware_dosificador/     # Código Arduino C++ (.ino) para control de bombas
│   │   └── esp32/                    # Scripts MicroPython para telemetría de sensores
│   └── docker-compose.yml            # Orquestador del sistema completo
│
├── 2_Backups_BD/
│   ├── backup_piscina_lstm3.sql      # Volcado completo de la estructura y datos de Supabase
│   ├── esquema_tablas.sql            # Definición de DDL, llaves foráneas y tipos
│   └── datos_iniciales_seed.sql      # Datos semilla: usuarios administradores, roles y químicos
│
├── 3_Datasets/
│   ├── dataset_piscina_historico.csv # Mediciones históricas reales de variables fisicoquímicas
│   ├── dataset_mediciones_horas.csv  # Datos agrupados por intervalos de 1 hora
│   ├── dataset_dosificacion_diaria.csv# Registros de aplicación de cloro y correctores de pH
│   └── descripcion_variables.txt     # Diccionario de datos y rangos de las variables
│
├── 4_Ejecutables_Demo/
│   ├── INICIAR_SISTEMA_WINDOWS.bat   # Script de arranque rápido con un solo clic
│   ├── INICIAR_SISTEMA_LINUX.sh      # Script de arranque para entornos bash
│   ├── simulador_telemetria.bat      # Lanzador interactivo del simulador de sensores
│   └── Modelos_Entrenados/           # Pesos de la IA (.pth y .joblib)
│       ├── lstm_piscina_model.pth
│       ├── xgboost_piscina_model.joblib
│       ├── scaler_x.joblib
│       └── scaler_y.joblib
│
└── 5_Manuales_Documentacion/
    ├── Manual_de_Instalacion.pdf     # El presente manual en formato PDF listo para impresión
    ├── Manual_de_Usuario.pdf         # Guía de uso de pantallas para el operador y administrador
    ├── Pruebas_Iteracion_1.xlsx      # Matriz de casos de prueba del ciclo 1
    ├── Pruebas_Iteracion_2.xlsx      # Matriz de casos de prueba del ciclo 2
    ├── Pruebas_Iteracion_3.xlsx      # Matriz de casos de prueba del ciclo 3
    ├── Pruebas_Iteracion_4.xlsx      # Matriz de casos de prueba del ciclo 4
    └── Pruebas_Iteracion_5.xlsx      # Matriz de casos de prueba del ciclo 5
```

---

### 4. CHECKLIST PREVIO A LA ENTREGA
Antes de empacar y presentar el medio físico en el aula asignada el **02 de diciembre de 2026 a las 18:30**, verifique:
- [x] El pendrive o DVD es legible en cualquier equipo con Windows y Linux.
- [x] No contiene archivos de bloqueo `.lock`, claves bancarias personales ni carpetas pesadas innecesarias como `node_modules/` o `.git/` (las dependencias se descargan según el manual con `npm install` y `pip install`).
- [x] El archivo `.env.example` contiene las referencias completas para el evaluador.
- [x] Los modelos entrenados `.pth` y `.joblib` están incluidos y no corruptos.
- [x] El rótulo exterior coincide exactamente con el nombre de tesis y datos del estudiante.
