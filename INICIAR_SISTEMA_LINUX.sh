#!/usr/bin/env bash
echo "========================================================================="
echo "  SISTEMA DE MONITOREO Y DOSIFICACION AUTOMATICA DE QUIMICOS PARA PISCINAS"
echo "  Proyecto de Grado - Entrega Digital"
echo "========================================================================="
echo ""

if command -v docker &> /dev/null && command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo "[INFO] Docker detectado. Desplegando servicios con Docker Compose..."
    docker compose up -d --build
    echo ""
    echo "========================================================================="
    echo "[OK] El sistema esta corriendo con exito:"
    echo "     - Frontend (React):   http://localhost:3000"
    echo "     - Backend  (FastAPI): http://localhost:8000/docs"
    echo "========================================================================="
    exit 0
fi

echo "[AVISO] Docker no detectado. Iniciando en modo nativo..."
echo "Asegurese de haber ejecutado previamente 'pip install -r backend/requirements.txt' y 'npm install' en frontend."

(cd backend && source venv/bin/activate 2>/dev/null; cd .. && python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

(cd frontend && npm run preview -- --host 0.0.0.0 --port 3000) &
FRONTEND_PID=$!

echo "Servicios iniciados (Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID)."
echo "Presione CTRL+C para detener ambos servicios."

trap "kill $BACKEND_PID $FRONTEND_PID" SIGINT SIGTERM
wait
