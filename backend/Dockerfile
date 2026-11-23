# Imagen base ligera de Python
FROM python:3.11-slim

# Evitar generación de archivos .pyc y habilitar salida en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Instalar dependencias del sistema mínimas necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivo de requerimientos
COPY backend/requirements.txt /app/requirements.txt

# Instalar dependencias: primero PyTorch CPU (optimizado para tamaño y velocidad), luego el resto
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend y módulos de IA/LSTM
COPY backend /app/backend
COPY lstm /app/lstm

# Establecer directorio de trabajo en /app/backend para que uvicorn ejecute app.main:app
WORKDIR /app/backend

# Puerto en el que corre FastAPI
EXPOSE 8000

# Healthcheck interno del contenedor
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8000/health || exit 1

# Comando de inicio del servidor Uvicorn escuchando en todas las interfaces de red (0.0.0.0)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
