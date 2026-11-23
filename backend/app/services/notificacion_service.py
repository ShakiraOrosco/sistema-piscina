"""Servicio de notificaciones de alertas de falla de dispositivos (Monitoreo y Dosificación).

Envía alertas por:
1. Correo Electrónico (SMTP) a los usuarios Administradores activos en la BD y a `ALERT_EMAIL_TO`.
2. WhatsApp (CallMeBot API) a los números configurados en el perfil de usuario o en `.env` (`WHATSAPP_PHONE` + `WHATSAPP_APIKEY`).

Cuenta con control de enfriamiento (cooldown) por clave de falla para no saturar los canales
con alertas repetidas durante el mismo incidente, y ejecución en hilo background para no bloquear las peticiones HTTP.
"""

from __future__ import annotations

import os
import smtplib
import threading
import time
from datetime import datetime
from email.message import EmailMessage
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from ..config import settings
from ..db import get_connection, get_dict_cursor


_alert_lock = threading.Lock()
# Diccionario {clave_falla: timestamp_monotonic_ultimo_envio}
_ultimas_notificaciones: Dict[str, float] = {}
# Historial en memoria de las últimas notificaciones despachadas (para consulta / UI)
_historial_notificaciones: List[Dict[str, Any]] = []

# Runtime override de configuración de WhatsApp (para configurar desde UI sin reiniciar servidor)
_runtime_whatsapp_config: Dict[str, str] = {
    "phone": "",
    "apikey": "",
    "email_extra": "",
}


def obtener_config_notificaciones() -> Dict[str, Any]:
    """Devuelve la configuración activa de notificaciones (combinando .env y ajustes en caliente)."""
    phone = _runtime_whatsapp_config.get("phone") or os.getenv("WHATSAPP_PHONE", "") or settings.WHATSAPP_PHONE
    apikey = _runtime_whatsapp_config.get("apikey") or os.getenv("WHATSAPP_APIKEY", "") or settings.WHATSAPP_APIKEY
    email_extra = _runtime_whatsapp_config.get("email_extra") or os.getenv("ALERT_EMAIL_TO", "") or settings.ALERT_EMAIL_TO
    return {
        "smtp_configurado": bool(settings.SMTP_HOST and settings.SMTP_FROM),
        "smtp_from": settings.SMTP_FROM,
        "email_extra": email_extra,
        "whatsapp_configurado": bool(phone and apikey),
        "whatsapp_phone": phone,
        "whatsapp_apikey_mascarada": (apikey[:2] + "***" + apikey[-2:]) if len(apikey) > 4 else ("***" if apikey else ""),
        "cooldown_minutos": settings.ALERT_COOLDOWN_MINUTES,
        "ultimas_notificaciones": list(_historial_notificaciones[-15:]),
    }


def actualizar_config_notificaciones(
    whatsapp_phone: Optional[str] = None,
    whatsapp_apikey: Optional[str] = None,
    email_extra: Optional[str] = None,
) -> Dict[str, Any]:
    """Actualiza en memoria y en el archivo .env los parámetros de WhatsApp / Correo de alerta."""
    if whatsapp_phone is not None:
        _runtime_whatsapp_config["phone"] = whatsapp_phone.strip()
        os.environ["WHATSAPP_PHONE"] = whatsapp_phone.strip()
        settings.WHATSAPP_PHONE = whatsapp_phone.strip()
    if whatsapp_apikey is not None:
        _runtime_whatsapp_config["apikey"] = whatsapp_apikey.strip()
        os.environ["WHATSAPP_APIKEY"] = whatsapp_apikey.strip()
        settings.WHATSAPP_APIKEY = whatsapp_apikey.strip()
    if email_extra is not None:
        _runtime_whatsapp_config["email_extra"] = email_extra.strip()
        os.environ["ALERT_EMAIL_TO"] = email_extra.strip()
        settings.ALERT_EMAIL_TO = email_extra.strip()

    # Persistir también en .env si existe
    try:
        from pathlib import Path
        env_path = Path(__file__).resolve().parents[2] / ".env"
        if env_path.exists():
            contenido = env_path.read_text(encoding="utf-8")
            lineas = contenido.splitlines()
            actualizados = set()
            nuevas_lineas = []
            mapa = {
                "WHATSAPP_PHONE": settings.WHATSAPP_PHONE,
                "WHATSAPP_APIKEY": settings.WHATSAPP_APIKEY,
                "ALERT_EMAIL_TO": settings.ALERT_EMAIL_TO,
            }
            for linea in lineas:
                clave_match = linea.split("=", 1)[0].strip() if "=" in linea else ""
                if clave_match in mapa:
                    nuevas_lineas.append(f"{clave_match}={mapa[clave_match]}")
                    actualizados.add(clave_match)
                else:
                    nuevas_lineas.append(linea)
            for k, v in mapa.items():
                if k not in actualizados:
                    nuevas_lineas.append(f"{k}={v}")
            env_path.write_text("\n".join(nuevas_lineas) + "\n", encoding="utf-8")
    except Exception as exc:
        print(f"[Notificaciones] Aviso al persistir .env: {exc}")

    return obtener_config_notificaciones()


def obtener_correos_administradores() -> List[str]:
    """Obtiene los correos de todos los usuarios Administradores activos en la base de datos
    más los correos adicionales configurados en `ALERT_EMAIL_TO`."""
    correos: List[str] = []

    # 1. Correos en ALERT_EMAIL_TO o SMTP_FROM como respaldo
    email_extra = (
        _runtime_whatsapp_config.get("email_extra")
        or os.getenv("ALERT_EMAIL_TO", "")
        or settings.ALERT_EMAIL_TO
    )
    if email_extra:
        for c in email_extra.split(","):
            c_limpio = c.strip()
            if c_limpio and "@" in c_limpio and c_limpio not in correos:
                correos.append(c_limpio)

    # 2. Administradores activos en BD
    conn = get_connection()
    if conn is not None:
        try:
            cur = get_dict_cursor(conn)
            cur.execute(
                """
                SELECT correo
                FROM usuario
                WHERE activo = TRUE AND sigla_rol = 'ADM' AND correo IS NOT NULL
                """
            )
            for row in cur.fetchall():
                c = (row.get("correo") or "").strip()
                if c and "@" in c and c not in correos:
                    correos.append(c)
            cur.close()
        except Exception as exc:
            print(f"[Notificaciones] No se pudieron consultar correos ADM en BD: {exc}")
        finally:
            conn.close()

    if not correos and settings.SMTP_FROM and "@" in settings.SMTP_FROM:
        correos.append(settings.SMTP_FROM)

    return correos


def enviar_correo_alerta(
    asunto: str,
    titulo: str,
    modulo: str,
    dispositivo: str,
    detalle: str,
    destinatarios: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Envía un correo electrónico con formato claro detallando la falla del dispositivo."""
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        return {"enviado": False, "error": "SMTP no configurado (SMTP_HOST / SMTP_FROM)"}

    lista_destinos = destinatarios if destinatarios is not None else obtener_correos_administradores()
    if not lista_destinos:
        return {"enviado": False, "error": "No hay destinatarios de correo configurados"}

    fecha_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cuerpo_texto = (
        f"🚨 ALERTA DE FALLA EN DISPOSITIVO - PISCINA PLAYA AZUL\n"
        f"========================================================\n\n"
        f"• Título: {titulo}\n"
        f"• Módulo: {modulo}\n"
        f"• Dispositivo afectado: {dispositivo}\n"
        f"• Fecha y Hora: {fecha_str}\n"
        f"• Detalle de la falla:\n  {detalle}\n\n"
        f"Por favor, revise la conexión física del hardware o el panel de control del sistema.\n"
    )

    cuerpo_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #dc2626; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px;">🚨 Alerta de Falla en Dispositivo — Piscina Playa Azul</h2>
        </div>
        <div style="padding: 24px; background-color: #ffffff; color: #1e293b;">
            <p style="margin-top: 0; font-size: 15px; font-weight: bold; color: #b91c1c;">{titulo}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
                <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 160px;"><strong>Módulo:</strong></td>
                    <td style="padding: 8px 0; color: #0f172a;">{modulo}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #64748b;"><strong>Dispositivo:</strong></td>
                    <td style="padding: 8px 0; color: #0f172a;">{dispositivo}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #64748b;"><strong>Fecha y Hora:</strong></td>
                    <td style="padding: 8px 0; color: #0f172a;">{fecha_str}</td>
                </tr>
            </table>
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #7f1d1d;">
                <strong>Detalle del incidente:</strong><br/>
                {detalle}
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">
                Este mensaje fue generado automáticamente por el Sistema Inteligente de Monitoreo y Dosificación.
            </p>
        </div>
    </div>
    """

    try:
        mensaje = EmailMessage()
        mensaje["Subject"] = asunto
        mensaje["From"] = settings.SMTP_FROM
        mensaje["To"] = ", ".join(lista_destinos)
        mensaje.set_content(cuerpo_texto)
        mensaje.add_alternative(cuerpo_html, subtype="html")

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as servidor:
            if settings.SMTP_USE_TLS:
                servidor.starttls()
            if settings.SMTP_USER:
                servidor.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            servidor.send_message(mensaje)

        return {"enviado": True, "destinatarios": lista_destinos}
    except Exception as exc:
        print(f"[Notificaciones] Error al enviar correo de alerta: {exc}")
        return {"enviado": False, "error": str(exc), "destinatarios": lista_destinos}


def enviar_whatsapp_alerta(
    titulo: str,
    modulo: str,
    dispositivo: str,
    detalle: str,
    phone_override: Optional[str] = None,
    apikey_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Envía un mensaje de alerta por WhatsApp utilizando CallMeBot API."""
    phone = (
        phone_override
        or _runtime_whatsapp_config.get("phone")
        or os.getenv("WHATSAPP_PHONE", "")
        or settings.WHATSAPP_PHONE
    ).strip()
    apikey = (
        apikey_override
        or _runtime_whatsapp_config.get("apikey")
        or os.getenv("WHATSAPP_APIKEY", "")
        or settings.WHATSAPP_APIKEY
    ).strip()

    if not phone or not apikey:
        return {
            "enviado": False,
            "error": "WhatsApp no configurado (defina WHATSAPP_PHONE y WHATSAPP_APIKEY)",
        }

    fecha_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    texto = (
        f"🚨 *ALERTA PISCINA PLAYA AZUL*\n"
        f"*{titulo}*\n"
        f"• *Módulo:* {modulo}\n"
        f"• *Dispositivo:* {dispositivo}\n"
        f"• *Detalle:* {detalle}\n"
        f"• *Hora:* {fecha_str}"
    )

    phone_clean = phone.replace(" ", "").replace("-", "")
    url = (
        f"https://api.callmebot.com/whatsapp.php"
        f"?phone={quote(phone_clean)}&text={quote(texto)}&apikey={quote(apikey)}"
    )

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url)
            if resp.status_code == 200 and "error" not in resp.text.lower()[:80]:
                return {"enviado": True, "telefono": phone_clean, "status_code": resp.status_code}
            return {
                "enviado": False,
                "telefono": phone_clean,
                "status_code": resp.status_code,
                "error": resp.text[:200],
            }
    except Exception as exc:
        print(f"[Notificaciones] Error al enviar WhatsApp de alerta: {exc}")
        return {"enviado": False, "telefono": phone_clean, "error": str(exc)}


def _debe_notificar(clave_falla: str, forzar: bool = False) -> bool:
    """Verifica si ya transcurrió el tiempo de cooldown para esta clave de falla."""
    if forzar:
        return True
    ahora = time.monotonic()
    cooldown_seg = max(60, int(settings.ALERT_COOLDOWN_MINUTES) * 60)
    with _alert_lock:
        ultimo = _ultimas_notificaciones.get(clave_falla)
        if ultimo is not None and (ahora - ultimo) < cooldown_seg:
            return False
        _ultimas_notificaciones[clave_falla] = ahora
        return True


def limpiar_cooldown_falla(clave_falla: Optional[str] = None) -> None:
    """Limpia el cooldown de una falla específica (ej. cuando el sensor se recupera) o de todas."""
    with _alert_lock:
        if clave_falla is None:
            _ultimas_notificaciones.clear()
        else:
            _ultimas_notificaciones.pop(clave_falla, None)


def _despachar_notificacion_sincrono(
    clave_falla: str,
    titulo: str,
    modulo: str,
    dispositivo: str,
    detalle: str,
) -> Dict[str, Any]:
    """Ejecuta el envío de correo y WhatsApp y registra el resultado en el historial."""
    asunto = f"🚨 [ALERTA {modulo.upper()}] {titulo} - Piscina Playa Azul"
    res_correo = enviar_correo_alerta(
        asunto=asunto,
        titulo=titulo,
        modulo=modulo,
        dispositivo=dispositivo,
        detalle=detalle,
    )
    res_whatsapp = enviar_whatsapp_alerta(
        titulo=titulo,
        modulo=modulo,
        dispositivo=dispositivo,
        detalle=detalle,
    )

    registro = {
        "clave_falla": clave_falla,
        "titulo": titulo,
        "modulo": modulo,
        "dispositivo": dispositivo,
        "detalle": detalle,
        "fecha_hora": datetime.now().isoformat(),
        "correo": res_correo,
        "whatsapp": res_whatsapp,
    }
    with _alert_lock:
        _historial_notificaciones.append(registro)
        if len(_historial_notificaciones) > 50:
            del _historial_notificaciones[:-50]

    return registro


def notificar_falla_dispositivo(
    clave_falla: str,
    titulo: str,
    modulo: str,
    dispositivo: str,
    detalle: str,
    forzar: bool = False,
    en_background: bool = True,
) -> Optional[Dict[str, Any]]:
    """Dispara una alerta por Correo y WhatsApp si no está en período de enfriamiento (cooldown).

    - `clave_falla`: identificador único del incidente (ej. 'sensor_ph_sin_dato', 'dosificador_hardware_error').
    - `modulo`: 'Monitoreo' o 'Dosificación'.
    - `dispositivo`: nombre del sensor o actuador (ej. 'Sensor de pH', 'Bomba / Electroválvula ESP32').
    """
    if not _debe_notificar(clave_falla, forzar=forzar):
        return None

    if en_background:
        hilo = threading.Thread(
            target=_despachar_notificacion_sincrono,
            args=(clave_falla, titulo, modulo, dispositivo, detalle),
            daemon=True,
        )
        hilo.start()
        return {"en_cola": True, "clave_falla": clave_falla}

    return _despachar_notificacion_sincrono(clave_falla, titulo, modulo, dispositivo, detalle)
