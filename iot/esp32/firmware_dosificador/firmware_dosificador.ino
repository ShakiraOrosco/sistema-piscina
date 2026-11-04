/*
 * =========================================================================
 * SISTEMA AUTOMÁTICO DE DOSIFICACIÓN DE QUÍMICOS PARA PISCINA
 * Compatible con: ESP32 / Arduino
 * 
 * Hardware y Asignación de Pines:
 * - Pin 26: Relé Bomba Dosificadora (Active LOW)
 * - Pin 25: Relé Electroválvula (Active LOW)
 * - Pin 27: Sensor de Flujo / Caudalímetro YF-S201 (380 pulsos/litro, Interrupción)
 * 
 * Reglas de cálculo del sistema (aplicadas en backend y frontend):
 * - Cloro: Cada 100g = 10 Litros (0.10 L/g)
 * - Demás químicos (Sulfato de Al / Cu): Cada 1000g = 15 Litros (0.015 L/g)
 * 
 * Modos de activación desde el sistema:
 * 1. Serial (USB):
 *    - "INICIAR <litros>"  -> Ej: INICIAR 2.50
 *    - "DETENER"           -> Parada inmediata
 *    - "ESTADO"            -> Consulta estado actual
 * 2. WiFi (Opcional si es ESP32):
 *    - Servidor HTTP embebido en puerto 80
 *    - POST /dosificar?litros=2.5
 *    - POST /detener
 *    - GET /estado
 * =========================================================================
 */

#if defined(ESP32)
  #include <WiFi.h>
  #include <WebServer.h>
  #define ES_ESP32 true
#else
  #define ES_ESP32 false
#endif

// Asignación de Pines
const int PIN_RELE_BOMBA   = 26;
const int PIN_RELE_VALVULA = 25;
const int PIN_FLUJO        = 27;

// Lógica de Relés (Módulos estándar optoacoplados)
const int RELE_ENCENDIDO = LOW;
const int RELE_APAGADO   = HIGH;

// Constantes de calibración de flujo
const float PULSOS_POR_LITRO = 380.0;

// Variables de control de dosificación
volatile unsigned long pulsos = 0;
volatile bool dosificacionActiva = false;
float litrosObjetivo = 1.0; // Valor dinámico recibido desde el sistema

#if ES_ESP32
  // Configuración de red WiFi (opcional para control inalámbrico)
  const char* WIFI_SSID = "HONOR.Ayana";
  const char* WIFI_PASS = "12345hola";
  WebServer server(80);
  bool wifiHabilitado = false;
#endif

// Rutina de servicio de interrupción (ISR)
void IRAM_ATTR contarPulso() {
  if (dosificacionActiva) {
    pulsos++;
  }
}

// Función para detener bomba y válvula
void detenerDosificacion(String motivo = "Completado") {
  noInterrupts();
  dosificacionActiva = false;
  unsigned long conteoFinal = pulsos;
  interrupts();

  digitalWrite(PIN_RELE_BOMBA, RELE_APAGADO);
  digitalWrite(PIN_RELE_VALVULA, RELE_APAGADO);

  float litrosFinales = (float)conteoFinal / PULSOS_POR_LITRO;

  Serial.println("----------------------------------------");
  Serial.println("Bomba apagada.");
  Serial.println("Electrovalvula desactivada.");
  Serial.print("Motivo: ");
  Serial.println(motivo);
  Serial.print("Pulsos finales: ");
  Serial.println(conteoFinal);
  Serial.print("Volumen dosificado: ");
  Serial.print(litrosFinales, 3);
  Serial.println(" litros");
  Serial.println("Dosificacion detenida.");
  Serial.println("----------------------------------------");
}

// Función para iniciar la dosificación con un objetivo de litros específico
void iniciarDosificacion(float objetivo) {
  if (objetivo <= 0.0) {
    Serial.println("ERROR: El objetivo de litros debe ser mayor a 0.");
    return;
  }

  if (dosificacionActiva) {
    Serial.println("AVISO: Ya existe una dosificacion activa en curso.");
    return;
  }

  litrosObjetivo = objetivo;

  noInterrupts();
  pulsos = 0;
  dosificacionActiva = true;
  interrupts();

  // Secuencia de encendido seguro: primero abrir válvula, luego bomba
  digitalWrite(PIN_RELE_VALVULA, RELE_ENCENDIDO);
  delay(300);
  digitalWrite(PIN_RELE_BOMBA, RELE_ENCENDIDO);

  Serial.println("========================================");
  Serial.println("Electrovalvula activada.");
  Serial.println("Bomba encendida.");
  Serial.print("Dosificacion iniciada -> Objetivo: ");
  Serial.print(litrosObjetivo, 3);
  Serial.println(" Litros");
  Serial.println("========================================");
}

#if ES_ESP32
// Controladores HTTP WebServer
void handleRoot() {
  server.send(200, "application/json", "{\"status\":\"ok\",\"dispositivo\":\"ESP32 Dosificador Piscina\"}");
}

void handleEstado() {
  noInterrupts();
  unsigned long c = pulsos;
  bool act = dosificacionActiva;
  interrupts();

  float lit = (float)c / PULSOS_POR_LITRO;
  float pct = litrosObjetivo > 0 ? (lit / litrosObjetivo) * 100.0 : 0;
  if (pct > 100.0) pct = 100.0;

  String json = "{";
  json += "\"activa\":" + String(act ? "true" : "false") + ",";
  json += "\"pulsos\":" + String(c) + ",";
  json += "\"litros\":" + String(lit, 3) + ",";
  json += "\"objetivo\":" + String(litrosObjetivo, 3) + ",";
  json += "\"progreso_pct\":" + String(pct, 1);
  json += "}";
  server.send(200, "application/json", json);
}

void handleDosificar() {
  float objetivo = 1.0;
  if (server.hasArg("litros")) {
    objetivo = server.arg("litros").toFloat();
  }
  iniciarDosificacion(objetivo);
  handleEstado();
}

void handleDetener() {
  detenerDosificacion("Solicitado por HTTP");
  handleEstado();
}
#endif

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50); // Timeout rápido para no bloquear el loop

  // Configuración de pines de relé
  pinMode(PIN_RELE_BOMBA, OUTPUT);
  pinMode(PIN_RELE_VALVULA, OUTPUT);

  // Asegurar relés apagados al encender
  digitalWrite(PIN_RELE_BOMBA, RELE_APAGADO);
  digitalWrite(PIN_RELE_VALVULA, RELE_APAGADO);

  // Sensor de flujo con resistencia PULLUP interna
  pinMode(PIN_FLUJO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLUJO), contarPulso, FALLING);

  Serial.println("==============================================");
  Serial.println("Sistema de Dosificacion de Piscina Listo.");
  Serial.println("Pines: Bomba=26 | Valvula=25 | Flujo=27");
  Serial.println("Comandos Serial disponibles:");
  Serial.println("  INICIAR <litros>  (ej: INICIAR 2.50)");
  Serial.println("  DETENER");
  Serial.println("  ESTADO");
  Serial.println("==============================================");

#if ES_ESP32
  // Intentar conectar a WiFi (timeout 6 segundos para no bloquear si no hay WiFi)
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando a WiFi ");
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 6000) {
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiHabilitado = true;
    Serial.println("\nWiFi Conectado!");
    Serial.print("IP del Dosificador: http://");
    Serial.println(WiFi.localIP());

    server.on("/", HTTP_GET, handleRoot);
    server.on("/estado", HTTP_GET, handleEstado);
    server.on("/dosificar", HTTP_POST, handleDosificar);
    server.on("/detener", HTTP_POST, handleDetener);
    server.begin();
    Serial.println("Servidor Web HTTP activo en puerto 80");
  } else {
    Serial.println("\nWiFi no disponible. Operando en modo Serial USB directo.");
  }
#endif
}

void loop() {
#if ES_ESP32
  if (wifiHabilitado) {
    server.handleClient();
  }
#endif

  // Procesar comandos entrantes por Serial desde el sistema
  if (Serial.available()) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();

    if (comando.startsWith("INICIAR") || comando.startsWith("DOSIFICAR")) {
      float nuevoObjetivo = 1.0;
      int espacioIndex = comando.indexOf(' ');
      if (espacioIndex != -1) {
        nuevoObjetivo = comando.substring(espacioIndex + 1).toFloat();
      }
      iniciarDosificacion(nuevoObjetivo);
    }
    else if (comando.equalsIgnoreCase("DETENER") || comando.equalsIgnoreCase("PARAR")) {
      detenerDosificacion("Comando Serial DETENER");
    }
    else if (comando.equalsIgnoreCase("ESTADO")) {
      noInterrupts();
      unsigned long c = pulsos;
      bool act = dosificacionActiva;
      interrupts();
      float lit = (float)c / PULSOS_POR_LITRO;
      Serial.print("ESTADO:");
      Serial.print(act ? "ACTIVO" : "INACTIVO");
      Serial.print(":LITROS=");
      Serial.print(lit, 3);
      Serial.print(":OBJETIVO=");
      Serial.print(litrosObjetivo, 3);
      Serial.print(":PULSOS=");
      Serial.println(c);
    }
  }

  // Monitoreo en tiempo real si la dosificación está activa (sin delays bloqueantes)
  static unsigned long ultimaTelemetria = 0;
  if (dosificacionActiva) {
    noInterrupts();
    unsigned long conteo = pulsos;
    interrupts();

    float litros = (float)conteo / PULSOS_POR_LITRO;

    // Telemetría periódica cada 250ms sin trabar la atención HTTP
    if (millis() - ultimaTelemetria >= 250) {
      ultimaTelemetria = millis();
      Serial.print("Pulsos: ");
      Serial.print(conteo);
      Serial.print(" | Litros: ");
      Serial.print(litros, 3);
      Serial.print(" / ");
      Serial.println(litrosObjetivo, 3);
    }

    // Condición de parada automática al alcanzar el volumen deseado
    if (litros >= litrosObjetivo) {
      detenerDosificacion("OBJETIVO ALCANZADO");
    }
  }
}
