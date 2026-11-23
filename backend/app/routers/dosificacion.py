"""Router de API para el control de dosificación física y cálculo de químicos.

Endpoints para:
- Iniciar dosificación parcial o final (activando bomba Pin 26 y válvula Pin 25).
- Detener de emergencia la dosificación.
- Consultar estado y telemetría en tiempo real del sensor de flujo (Pin 27).
- Calcular litros según la regla:
    * Cloro: 100g = 10L (0.10 L/g)
    * Demás químicos: 1000g = 50L (0.050 L/g)
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.dosificacion_service import dosificacion_manager


router = APIRouter(prefix="/api/dosificacion", tags=["Dosificación"])


class IniciarDosificacionPayload(BaseModel):
    quimico: str = Field(..., description="Nombre del químico (ej. 'Cloro', 'Sulfato de Aluminio', 'Sulfato de Cobre')")
    cantidad_g: float = Field(..., gt=0, description="Cantidad a dosificar en gramos")
    tipo: str = Field("parcial", description="Tipo de dosificación: 'parcial' o 'final'")
    id_usuario: Optional[int] = Field(None, description="ID del usuario operador")
    descontar_inventario: bool = Field(True, description="Si debe descontar automáticamente del inventario")


class DetenerDosificacionPayload(BaseModel):
    motivo: Optional[str] = Field("Detención manual por el operador", description="Motivo de la detención")


class ConfigurarDispositivoPayload(BaseModel):
    esp32_url: Optional[str] = Field(None, description="URL del ESP32 por WiFi (ej. http://192.168.1.120)")
    serial_port: Optional[str] = Field(None, description="Puerto COM Serial (ej. COM3 o /dev/ttyUSB0)")


@router.get("/estado")
async def obtener_estado_dosificacion():
    """Retorna el estado en tiempo real de la dosificación (bomba, electroválvula, pulsos y litros)."""
    return dosificacion_manager.obtener_estado()


@router.get("/calcular")
async def calcular_litros(
    quimico: str = Query(..., description="Nombre del químico"),
    cantidad_g: float = Query(..., gt=0, description="Gramos a dosificar")
):
    """Calcula el volumen en litros de solución requerido según las reglas de dosificación."""
    return dosificacion_manager.calcular_volumen(quimico, cantidad_g)


@router.post("/iniciar", status_code=200)
def iniciar_dosificacion(payload: IniciarDosificacionPayload):
    """Inicia la activación física de la bomba (Pin 26) y electroválvula (Pin 25).
    
    Aplica el cálculo automático:
    - Cloro: cada 100g -> 10 Litros
    - Demás: cada 1000g -> 50 Litros
    """
    res = dosificacion_manager.iniciar(
        quimico=payload.quimico,
        cantidad_g=payload.cantidad_g,
        tipo=payload.tipo,
        id_usuario=payload.id_usuario,
        descontar_inventario=payload.descontar_inventario
    )
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "Error al iniciar dosificación"))
    return res


@router.post("/detener")
def detener_dosificacion(payload: Optional[DetenerDosificacionPayload] = None):
    """Detiene inmediatamente la bomba y electroválvula de dosificación (Parada de emergencia)."""
    motivo = payload.motivo if payload else "Detención manual por el operador"
    return dosificacion_manager.detener(motivo=motivo)


@router.post("/configurar")
def configurar_dispositivo(payload: ConfigurarDispositivoPayload):
    """Configura la dirección de enlace al hardware (ESP32 WiFi o Puerto Serial COM)."""
    if payload.esp32_url is not None:
        dosificacion_manager.esp32_url = payload.esp32_url.strip()
    if payload.serial_port is not None:
        dosificacion_manager.serial_port = payload.serial_port.strip()
    return {
        "ok": True,
        "esp32_url": dosificacion_manager.esp32_url,
        "serial_port": dosificacion_manager.serial_port,
        "mensaje": "Configuración de hardware actualizada"
    }


class ReportarFallaDosificacionPayload(BaseModel):
    dispositivo: str = Field("Bomba / Electroválvula ESP32", description="Nombre del dispositivo de dosificación que falló")
    detalle: str = Field(..., description="Descripción de la falla detectada")


@router.post("/reportar-falla")
def reportar_falla_dosificacion(payload: ReportarFallaDosificacionPayload):
    """Registra una falla de hardware en el módulo de dosificación y envía alerta por Correo y WhatsApp."""
    from ..services.notificacion_service import notificar_falla_dispositivo

    with dosificacion_manager._lock:
        dosificacion_manager.estado["error_hardware"] = payload.detalle
        if not dosificacion_manager.estado["activa"]:
            dosificacion_manager.estado["modo"] = "error"
            dosificacion_manager.estado["mensaje"] = f"Falla detectada en {payload.dispositivo}: {payload.detalle}"

    notificacion = notificar_falla_dispositivo(
        clave_falla=f"dosificacion_falla_{payload.dispositivo.lower().replace(' ', '_')}",
        titulo=f"Falla en dispositivo de dosificación: {payload.dispositivo}",
        modulo="Dosificación",
        dispositivo=payload.dispositivo,
        detalle=payload.detalle,
        forzar=True,
    )
    return {
        "ok": True,
        "mensaje": "Alerta de falla de dosificación registrada y enviada por Correo y WhatsApp",
        "notificacion": notificacion,
        "estado": dosificacion_manager.obtener_estado(),
    }
