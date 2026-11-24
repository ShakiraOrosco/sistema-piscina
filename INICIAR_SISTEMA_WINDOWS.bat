@echo off
TITLE Iniciando Sistema de Monitoreo de Piscina IoT + BiLSTM
echo =========================================================================
echo   SISTEMA DE MONITOREO Y DOSIFICACION AUTOMATICA DE QUIMICOS PARA PISCINAS
echo   Proyecto de Grado - Entrega Digital
echo =========================================================================
echo.

WHERE docker >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    echo [INFO] Docker detectado. Desplegando servicios con Docker Compose...
    docker compose up -d --build
    echo.
    echo =========================================================================
    echo [OK] El sistema esta corriendo con exito:
    echo      - Frontend (React):   http://localhost:3000
    echo      - Backend  (FastAPI): http://localhost:8000/docs
    echo =========================================================================
    pause
    exit /b 0
)

echo [AVISO] Docker no esta instalado o no se encuentra en el PATH.
echo Ejecutando inicio manual nativo en consolas separadas...
echo.

echo Iniciando Backend FastAPI...
start "Backend FastAPI" cmd /k "cd backend && (if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat) else if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat)) && cd .. && python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo Iniciando Frontend React...
start "Frontend React" cmd /k "cd frontend && npm run dev -- --host 0.0.0.0 --port 3000"

echo.
echo =========================================================================
echo [OK] Servicios iniciados. Abra su navegador en: http://localhost:3000
echo =========================================================================
pause
