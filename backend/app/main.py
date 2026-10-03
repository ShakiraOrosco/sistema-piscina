import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Agregar la carpeta backend al sys.path si no está
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)


from .routers.auth import router as auth_router
from .routers.monitoring import router
from .routers.caja import router as caja_router
from .routers.inventario import router as inventario_router
from .routers.auditoria import router as auditoria_router

try:
    from detector_camara import start_camera_service_background, stop_camera_service_background
except ImportError:
    from backend.detector_camara import start_camera_service_background, stop_camera_service_background



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar detección de cámara automáticamente al arrancar el servidor
    try:
        start_camera_service_background()
    except Exception as e:
        print(f"⚠️ No se pudo iniciar el servicio automático de cámara: {e}")
    yield
    # Detener hilo de cámara al apagar el servidor
    try:
        stop_camera_service_background()
    except Exception:
        pass


app = FastAPI(
    title="Sistema de Monitoreo y Dosificación de Piscina",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router)
app.include_router(caja_router)
app.include_router(inventario_router)
app.include_router(auditoria_router)
