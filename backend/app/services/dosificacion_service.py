"""Servicio de control y cálculo de dosificación para piscina.

Controla los actuadores físicos:
- Bomba (Pin 26)
- Electroválvula (Pin 25)
- Sensor de flujo / Caudalímetro (Pin 27, 380 pulsos/litro)

Reglas de dosificación (Conversión Gramos -> Litros de solución):
- Para Cloro: Cada 100 g equivalen a 10 Litros (0.10 L/g).
- Para los demás químicos (Sulfato de Aluminio, Sulfato de Cobre, etc.):
  Cada 1000 g equivalen a 50 Litros (0.050 L/g).
"""

from __future__ import annotations

import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

try:
    import serial
    import serial.tools.list_ports
    SERIAL_DISPONIBLE = True
except ImportError:
    SERIAL_DISPONIBLE = False

from ..db import get_connection, get_dict_cursor
from .piscina_service import obtener_o_crear_jornada_hoy


# Constantes del hardware
PIN_RELE_BOMBA = 26
PIN_RELE_VALVULA = 25
PIN_FLUJO = 27
PULSOS_POR_LITRO = 380.0

# Factores de conversión
FACTOR_CLORO_L_POR_G = 10.0 / 100.0       # 0.10 L/g (100g = 10L)
FACTOR_OTROS_L_POR_G = 50.0 / 1000.0      # 0.050 L/g (1000g = 50L)


class DosificacionManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._sim_thread: Optional[threading.Thread] = None
        self._detener_solicitado = False
        self._ser_conn: Optional[Any] = None
        self._ser_lock = threading.Lock()
        
        # Configuración de comunicación
        # URL de la API del ESP32 si está por WiFi (ej: http://192.168.1.120)
        self.esp32_url = os.getenv("ESP32_DOSIFICADOR_URL", "").strip()
        # Puerto COM para Arduino/ESP32 por USB (ej: COM3 o /dev/ttyUSB0)
        self.serial_port = os.getenv("ARDUINO_SERIAL_PORT", "").strip()
        self.serial_baud = int(os.getenv("ARDUINO_SERIAL_BAUD", "115200"))
        
        # Estado en vivo del sistema
        self.estado: Dict[str, Any] = {
            "activa": False,
            "bomba_encendida": False,
            "valvula_abierta": False,
            "quimico": None,
            "tipo": None,  # "parcial" o "final"
            "cantidad_g": 0.0,
            "litros_objetivo": 0.0,
            "litros_actuales": 0.0,
            "pulsos": 0,
            "pulsos_por_litro": PULSOS_POR_LITRO,
            "progreso_pct": 0.0,
            "mensaje": "Sistema listo para dosificar",
            "modo": "listo",  # "listo", "dosificando", "completado", "detenido", "error"
            "medio_control": "local",  # "wifi", "serial", "simulado"
            "inicio_timestamp": None,
            "fin_timestamp": None,
        }

    def detectar_puerto_serial(self) -> Optional[str]:
        """Detecta automáticamente el puerto COM donde está conectado el microcontrolador (ESP32/Arduino)."""
        if self.serial_port:
            return self.serial_port
        if not SERIAL_DISPONIBLE:
            return None
        try:
            puertos = list(serial.tools.list_ports.comports())
            # Priorizar chips USB-UART típicos (CP210x de ESP32, CH340 de Arduino Nano/Uno, etc.)
            for p in puertos:
                desc = (p.description or "").lower()
                if any(k in desc for k in ["cp210", "ch340", "ch341", "arduino", "usb to uart", "ftdi"]):
                    return p.device
            # Si no, cualquier puerto COM físico que no sea Bluetooth
            for p in puertos:
                if "bluetooth" not in (p.description or "").lower():
                    return p.device
        except Exception as e:
            print(f"[Dosificador] Error al enumerar puertos COM: {e}")
        return None

    def calcular_volumen(self, quimico: str, cantidad_g: float) -> Dict[str, Any]:
        """Calcula los litros requeridos según el químico y la regla especificada."""
        q_norm = (quimico or "").lower().strip()
        es_cloro = "cloro" in q_norm

        if es_cloro:
            litros = (float(cantidad_g) / 100.0) * 10.0
            regla = "Cloro: 100g = 10L (0.10 L/g)"
            factor = FACTOR_CLORO_L_POR_G
        else:
            litros = (float(cantidad_g) / 1000.0) * 50.0
            regla = "Aluminio / Cobre: 1000g = 50L (0.050 L/g)"
            factor = FACTOR_OTROS_L_POR_G

        litros_redondeados = round(max(litros, 0.0), 3)
        pulsos_esperados = int(round(litros_redondeados * PULSOS_POR_LITRO))

        return {
            "quimico": quimico,
            "cantidad_g": round(float(cantidad_g), 2),
            "litros_objetivo": litros_redondeados,
            "factor_l_por_g": factor,
            "regla_aplicada": regla,
            "pulsos_estimados": pulsos_esperados,
            "es_cloro": es_cloro,
        }

    def obtener_estado(self) -> Dict[str, Any]:
        with self._lock:
            # Copia del estado para evitar modificaciones externas
            copia = dict(self.estado)
            if copia["litros_objetivo"] > 0:
                copia["progreso_pct"] = round(min(100.0, (copia["litros_actuales"] / copia["litros_objetivo"]) * 100.0), 1)
            else:
                copia["progreso_pct"] = 0.0
            return copia

    def iniciar(
        self,
        quimico: str,
        cantidad_g: float,
        tipo: str = "parcial",
        id_usuario: Optional[int] = None,
        descontar_inventario: bool = True,
        validar_cuota_maxima: bool = False
    ) -> Dict[str, Any]:
        """Inicia el proceso de dosificación parcial o final."""
        with self._lock:
            if self.estado["activa"]:
                return {
                    "ok": False,
                    "error": "Ya hay una dosificación en curso. Deténgala antes de iniciar otra.",
                    "estado": dict(self.estado),
                }

            calculo = self.calcular_volumen(quimico, cantidad_g)
            litros_objetivo = calculo["litros_objetivo"]

            if litros_objetivo <= 0:
                return {
                    "ok": False,
                    "error": "La cantidad a dosificar debe ser mayor a 0 gramos.",
                }

            # Regla de seguridad: el sulfato de aluminio es un floculante y solo se permite en dosificación final
            if tipo.lower() == "parcial" and "aluminio" in (quimico or "").lower():
                return {
                    "ok": False,
                    "error": "El Sulfato de Aluminio solo se puede aplicar en la Dosificación Final al cierre de la jornada (es un floculante clarificador).",
                }

        # Validación de seguridad fuera del lock de estado para no bloquear /estado
        if validar_cuota_maxima:
            conn_check = get_connection()
            if conn_check:
                try:
                    id_jornada = obtener_o_crear_jornada_hoy(conn_check)
                    cur_check = conn_check.cursor()
                    q_norm = (quimico or "").lower()
                    cur_check.execute(
                        "SELECT cloro_pred, cobre_pred, aluminio_pred FROM prediccion WHERE id_jornada = %s ORDER BY fecha_prediccion DESC LIMIT 1",
                        (id_jornada,)
                    )
                    pred_row = cur_check.fetchone()
                    if pred_row:
                        pred_max = float(pred_row[0] if "cloro" in q_norm else (pred_row[1] if "cobre" in q_norm else pred_row[2]) or 0)
                        if pred_max > 0:
                            q_filtro = "%cloro%" if "cloro" in q_norm else ("%cobre%" if "cobre" in q_norm else "%aluminio%")
                            cur_check.execute(
                                "SELECT COALESCE(SUM(cantidad_g), 0) FROM dosificacion_parcial WHERE id_jornada = %s AND LOWER(quimico) LIKE %s",
                                (id_jornada, q_filtro)
                            )
                            ya_aplicado = float(cur_check.fetchone()[0] or 0)
                            if ya_aplicado >= pred_max:
                                cur_check.close()
                                conn_check.close()
                                return {
                                    "ok": False,
                                    "error": f"La cuota recomendada para {quimico} ({pred_max:.1f}g) ya fue completada al 100%. No se permite dosificar más para evitar sobredosificación en la piscina."
                                }
                    cur_check.close()
                except Exception as ex:
                    print(f"[Dosificador] Aviso al verificar cuota máxima: {ex}")
                finally:
                    conn_check.close()

        with self._lock:
            if self.estado["activa"]:
                return {
                    "ok": False,
                    "error": "Ya hay una dosificación en curso. Deténgala antes de iniciar otra.",
                    "estado": dict(self.estado),
                }
            self._detener_solicitado = False
            self.estado.update({
                "activa": True,
                "bomba_encendida": True,
                "valvula_abierta": True,
                "quimico": quimico,
                "tipo": tipo,
                "cantidad_g": calculo["cantidad_g"],
                "litros_objetivo": litros_objetivo,
                "litros_actuales": 0.0,
                "pulsos": 0,
                "progreso_pct": 0.0,
                "mensaje": f"Dosificando {calculo['cantidad_g']}g ({litros_objetivo}L) de {quimico}",
                "modo": "dosificando",
                "inicio_timestamp": datetime.now(timezone.utc).isoformat(),
                "fin_timestamp": None,
            })

        # 1. Intentar por Serial USB directo primero si hay microcontrolador conectado (ej. COM5)
        comando_hardware_enviado = False
        medio_usado = "simulado"
        puerto_com = self.detectar_puerto_serial()

        if SERIAL_DISPONIBLE and puerto_com:
            for intento_ser in range(2):
                try:
                    ser = self._abrir_o_reusar_serial(puerto_com)
                    if ser and ser.is_open:
                        with self._ser_lock:
                            try:
                                ser.reset_input_buffer()
                            except Exception:
                                pass
                            comando = f"\nINICIAR {litros_objetivo:.3f}\n"
                            ser.write(comando.encode("utf-8"))
                            ser.flush()
                        comando_hardware_enviado = True
                        medio_usado = f"serial ({puerto_com})"
                        break
                except Exception as e:
                    print(f"[Dosificador] Reintentando Serial ({puerto_com}) tras error: {e}")
                    with self._ser_lock:
                        try:
                            if self._ser_conn:
                                self._ser_conn.close()
                        except Exception:
                            pass
                        self._ser_conn = None

        # 2. Si no se envió por Serial USB, intentar por WiFi HTTP si está configurado
        url_esp32 = self.esp32_url or os.getenv("ESP32_DOSIFICADOR_URL", "").strip()
        if not comando_hardware_enviado and url_esp32:
            try:
                with httpx.Client(timeout=2.0) as client:
                    resp = client.post(
                        f"{url_esp32.rstrip('/')}/dosificar",
                        params={"litros": f"{litros_objetivo:.3f}"},
                        json={
                            "litros": litros_objetivo,
                            "quimico": quimico,
                            "tipo": tipo
                        }
                    )
                    if resp.status_code == 200:
                        comando_hardware_enviado = True
                        medio_usado = "wifi"
                        self.esp32_url = url_esp32
            except Exception as e:
                print(f"[Dosificador] No se pudo conectar al ESP32 por WiFi: {e}")

        with self._lock:
            self.estado["medio_control"] = medio_usado

        # Iniciar ciclo de monitoreo / simulación en hilo background
        self._sim_thread = threading.Thread(
            target=self._hilo_control_dosificacion,
            args=(quimico, cantidad_g, tipo, litros_objetivo, medio_usado, id_usuario, descontar_inventario),
            daemon=True
        )
        self._sim_thread.start()

        return {
            "ok": True,
            "mensaje": f"Dosificación iniciada: {litros_objetivo} L calculados para {cantidad_g} g de {quimico}.",
            "calculo": calculo,
            "estado": self.obtener_estado(),
        }

    def _abrir_o_reusar_serial(self, puerto_com: str) -> Optional[Any]:
        """Abre el puerto Serial sin activar DTR/RTS (evitando reiniciar el ESP32) y mantiene la conexión activa."""
        if not SERIAL_DISPONIBLE or not puerto_com:
            return None
        with self._ser_lock:
            if self._ser_conn is not None:
                try:
                    if self._ser_conn.is_open and self._ser_conn.port == puerto_com:
                        return self._ser_conn
                    self._ser_conn.close()
                except Exception:
                    pass
                self._ser_conn = None

            for intento in range(2):
                try:
                    ser = serial.Serial()
                    ser.port = puerto_com
                    ser.baudrate = self.serial_baud
                    ser.timeout = 0.2
                    ser.write_timeout = 1.0
                    # Crítico: desactivar DTR y RTS ANTES de open() para no resetear el ESP32
                    ser.dtr = False
                    ser.rts = False
                    ser.open()
                    self._ser_conn = ser
                    print(f"[Dosificador] Puerto {puerto_com} conectado exitosamente sin reset.")
                    return self._ser_conn
                except Exception as ser_err:
                    err_str = str(ser_err)
                    if intento == 0 and ("Acceso denegado" in err_str or "PermissionError" in err_str or "13" in err_str):
                        print(f"[Dosificador] Liberando {puerto_com} ocupado por serial-monitor...")
                        try:
                            subprocess.run(
                                ["taskkill", "/F", "/IM", "serial-monitor.exe"],
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL,
                                timeout=2
                            )
                            time.sleep(0.2)
                        except Exception:
                            pass
                    else:
                        print(f"[Dosificador] No se pudo abrir {puerto_com}: {ser_err}")
                        break
            return None

    def detener(self, motivo: str = "Detención manual por el usuario") -> Dict[str, Any]:
        """Detiene de emergencia o cancela la dosificación en curso."""
        with self._lock:
            if not self.estado["activa"]:
                return {"ok": True, "mensaje": "No hay dosificación activa en este momento."}
            self._detener_solicitado = True
            self.estado["bomba_encendida"] = False
            self.estado["valvula_abierta"] = False
            self.estado["activa"] = False
            self.estado["modo"] = "detenido"
            self.estado["mensaje"] = f"Dosificación detenida: {motivo}"
            self.estado["fin_timestamp"] = datetime.now(timezone.utc).isoformat()

        # Enviar orden de parada por Serial si aplica
        puerto_com = self.detectar_puerto_serial()
        if SERIAL_DISPONIBLE and puerto_com:
            try:
                ser = self._abrir_o_reusar_serial(puerto_com)
                if ser and ser.is_open:
                    with self._ser_lock:
                        ser.write(b"DETENER\n")
                        ser.flush()
            except Exception:
                pass

        # Enviar orden de parada al ESP32 por WiFi si aplica
        if self.esp32_url and str(self.estado.get("medio_control", "")).startswith("wifi"):
            try:
                with httpx.Client(timeout=1.5) as client:
                    client.post(f"{self.esp32_url.rstrip('/')}/detener")
            except Exception:
                pass

        return {
            "ok": True,
            "mensaje": f"Bomba apagada y electroválvula cerrada. {motivo}",
            "estado": self.obtener_estado(),
        }

    def _hilo_control_dosificacion(
        self,
        quimico: str,
        cantidad_g: float,
        tipo: str,
        litros_objetivo: float,
        medio: str,
        id_usuario: Optional[int],
        descontar_inventario: bool
    ):
        """Monitorea el avance de litros y al completarse persiste en la base de datos."""
        url_esp32 = self.esp32_url or os.getenv("ESP32_DOSIFICADOR_URL", "").strip()
        es_wifi = medio == "wifi" and bool(url_esp32)
        es_serial = medio.startswith("serial")
        client_wifi = httpx.Client(timeout=1.5) if es_wifi else None
        ultimo_poll_wifi = 0.0

        try:
            pulsos_totales_meta = max(1, int(round(litros_objetivo * PULSOS_POR_LITRO)))
            # Si no hay flujo físico pasando por el sensor (pulsos_sensor == 0), mantener la bomba encendida
            # un tiempo proporcional realista (mínimo 5 segundos) antes de cortar automáticamente
            duracion_estimada_seg = max(5.0, min(60.0, litros_objetivo * 4.0))
            incremento_pulsos_sim = max(1, int(round((pulsos_totales_meta / duracion_estimada_seg) * 0.25)))

            pulsos_actuales = 0
            pulsos_reales_detectados = False
            objetivo_alcanzado_hw = False
            inicio_ciclo = time.time()

            while not self._detener_solicitado:
                time.sleep(0.25)
                ahora = time.time()

                if es_serial and self._ser_conn and self._ser_conn.is_open:
                    lineas_serial = []
                    with self._ser_lock:
                        try:
                            if self._ser_conn.in_waiting > 0:
                                raw = self._ser_conn.read(self._ser_conn.in_waiting).decode("utf-8", errors="ignore")
                                lineas_serial = raw.splitlines()
                        except Exception:
                            pass

                    for linea in lineas_serial:
                        m_pulsos = re.search(r"Pulsos:\s*(\d+)", linea, re.IGNORECASE)
                        if not m_pulsos:
                            m_pulsos = re.search(r"PULSOS=(\d+)", linea, re.IGNORECASE)
                        if m_pulsos:
                            p_val = int(m_pulsos.group(1))
                            if p_val > 0:
                                pulsos_reales_detectados = True
                                pulsos_actuales = p_val
                        if "OBJETIVO ALCANZADO" in linea.upper():
                            objetivo_alcanzado_hw = True

                    # Si no pasan pulsos por el caudalímetro tras 1.5s (prueba sin agua en sensor), avanzar por tiempo
                    if not pulsos_reales_detectados and (ahora - inicio_ciclo >= 1.5):
                        pulsos_actuales = min(pulsos_totales_meta, pulsos_actuales + incremento_pulsos_sim)

                elif client_wifi and (ahora - ultimo_poll_wifi >= 1.0):
                    ultimo_poll_wifi = ahora
                    try:
                        r = client_wifi.get(f"{url_esp32.rstrip('/')}/estado")
                        if r.status_code == 200:
                            data = r.json()
                            pulsos_actuales = int(data.get("pulsos", pulsos_actuales))
                            if not data.get("activa", True):
                                objetivo_alcanzado_hw = True
                    except Exception:
                        pass
                else:
                    pulsos_actuales = min(pulsos_totales_meta, pulsos_actuales + incremento_pulsos_sim)

                litros_calc = round(pulsos_actuales / PULSOS_POR_LITRO, 3)

                with self._lock:
                    if self._detener_solicitado:
                        break
                    self.estado["pulsos"] = pulsos_actuales
                    self.estado["litros_actuales"] = min(litros_calc, litros_objetivo)
                    self.estado["progreso_pct"] = round(min(100.0, (self.estado["litros_actuales"] / litros_objetivo) * 100.0), 1)

                if objetivo_alcanzado_hw or pulsos_actuales >= pulsos_totales_meta:
                    # Si completó por tiempo (sin agua en el sensor de flujo), apagar relés en el ESP32
                    if es_serial and not objetivo_alcanzado_hw and self._ser_conn and self._ser_conn.is_open:
                        with self._ser_lock:
                            try:
                                self._ser_conn.write(b"\nDETENER\n")
                                self._ser_conn.flush()
                                time.sleep(0.15)
                                self._ser_conn.reset_input_buffer()
                            except Exception:
                                pass
                    break

            with self._lock:
                if not self._detener_solicitado:
                    self.estado["activa"] = False
                    self.estado["bomba_encendida"] = False
                    self.estado["valvula_abierta"] = False
                    self.estado["litros_actuales"] = litros_objetivo
                    self.estado["pulsos"] = pulsos_totales_meta
                    self.estado["progreso_pct"] = 100.0
                    self.estado["modo"] = "completado"
                    self.estado["mensaje"] = f"Dosificación de {quimico} ({litros_objetivo} L) completada con éxito."
                    self.estado["fin_timestamp"] = datetime.now(timezone.utc).isoformat()

            # Registrar en Base de Datos (dosificacion_parcial y opcionalmente inventario)
            self._guardar_registro_bd(quimico, cantidad_g, tipo, id_usuario, descontar_inventario)

        except Exception as e:
            print(f"[Dosificador] Error en hilo de control: {e}")
            with self._lock:
                self.estado["activa"] = False
                self.estado["bomba_encendida"] = False
                self.estado["valvula_abierta"] = False
                self.estado["modo"] = "error"
                self.estado["mensaje"] = f"Error en dosificación: {e}"
        finally:
            if client_wifi:
                try:
                    client_wifi.close()
                except Exception:
                    pass

    def _guardar_registro_bd(
        self,
        quimico: str,
        cantidad_g: float,
        tipo: str,
        id_usuario: Optional[int],
        descontar_inventario: bool
    ):
        conn = get_connection()
        if not conn:
            print("[Dosificador] No se pudo conectar a la base de datos para guardar la dosis.")
            return

        try:
            id_jornada = obtener_o_crear_jornada_hoy(conn)
            cur = conn.cursor()

            # 1. Insertar en dosificacion_parcial
            cur.execute(
                """
                INSERT INTO dosificacion_parcial (id_jornada, fecha_hora, quimico, cantidad_g)
                VALUES (%s, CURRENT_TIMESTAMP, %s, %s)
                RETURNING id_parcial
                """,
                (id_jornada, quimico, float(cantidad_g))
            )
            id_parcial = cur.fetchone()[0]
            conn.commit()

            # 2. Descontar de inventario si aplica y existe el insumo
            if descontar_inventario:
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "SELECT id_quimico, sigla, stock_actual, unidad_medida FROM quimico WHERE LOWER(nombre) LIKE %s OR LOWER(sigla) = %s LIMIT 1",
                        (f"%{quimico.lower()}%", quimico.lower())
                    )
                    q_row = cur.fetchone()
                    if q_row:
                        id_quim, sigla, stock_act, unidad = q_row[0], q_row[1], float(q_row[2]), q_row[3]
                        # Convertir cantidad_g a la unidad de medida si es kg
                        cant_descontar = cantidad_g / 1000.0 if unidad.lower() == "kg" else cantidad_g
                        nuevo_stock = max(0.0, stock_act - cant_descontar)

                        cur.execute("UPDATE quimico SET stock_actual = %s WHERE id_quimico = %s", (nuevo_stock, id_quim))
                        
                        # Registrar movimiento de inventario si la tabla existe
                        obs = f"Salida automática por dosificación {tipo}: {cantidad_g}g ({self.estado['litros_objetivo']}L)"
                        cur.execute(
                            """
                            INSERT INTO movimiento_inventario (
                                sigla_quimico, sigla_tipo_movimiento, sigla_origen,
                                cantidad, stock_resultante, id_usuario, fecha_hora, observaciones
                            ) VALUES (%s, 'SAL', 'DOS', %s, %s, %s, CURRENT_TIMESTAMP, %s)
                            """,
                            (sigla, cant_descontar, nuevo_stock, id_usuario, obs)
                        )
                        conn.commit()
                except Exception as inv_err:
                    print(f"[Dosificador] No se pudo descontar del inventario: {inv_err}")
                    conn.rollback()

            cur.close()
        except Exception as exc:
            conn.rollback()
            print(f"[Dosificador] Error al persistir en DB: {exc}")
        finally:
            conn.close()


# Instancia singleton para toda la aplicación
dosificacion_manager = DosificacionManager()
