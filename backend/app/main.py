from fastapi import FastAPI

app = FastAPI(
    title="Sistema de Monitoreo y Dosificación de Piscina",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "mensaje": "Sistema de piscina funcionando"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }