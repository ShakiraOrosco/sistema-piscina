from fastapi import FastAPI

from .routers.monitoring import router

app = FastAPI(
    title="Sistema de Monitoreo y Dosificación de Piscina",
    version="1.0.0",
)

app.include_router(router)
