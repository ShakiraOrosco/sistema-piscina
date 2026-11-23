// =====================================================
// SIMULACION DE DEMOSTRACION - SISTEMA IoT DE PISCINA
// -----------------------------------------------------
// Genera lecturas simuladas de pH, turbidez (NTU) y temperatura
// siguiendo el perfil diario real de la piscina (jornada del 21/11).
// NO usa WiFi, NO envia nada al backend y NO escribe en la base de datos.
// Solo imprime en el Monitor Serial (115200 baud).
//
// Mantiene el mismo formato de salida y los mismos comandos que el
// codigo real: INICIAR 2.50 | DETENER | ESTADO
// =====================================================

#include <math.h>

// =====================================================
// 1. CONFIGURACION DE LA SIMULACION
// =====================================================

// Lo que el sensor "obtiene" se muestra cada 2 segundos reales
const unsigned long INTERVALO_MUESTRA = 2000;

// Minutos simulados que avanza el reloj en cada muestra de 2 s.
// Con 1 min por muestra, una hora simulada = 60 muestras = 2 min reales.
// (Pon 2 o 3 para que cada "hora" pase mas rapido en la demo)
const int MINUTOS_SIMULADOS_POR_MUESTRA = 1;

// El REGISTRO (lo que se guardaria en la base de datos) es cada hora simulada
const int MINUTOS_POR_REGISTRO = 60;

// Hora simulada de inicio y fin de la jornada (al llegar al fin, reinicia)
const float HORA_INICIO = 8.0;
const float HORA_FIN = 20.0;

// =====================================================
// 2. PERFIL DIARIO (08:00 a 20:00, un valor por hora)
//    Valores coherentes con los datos de la base de datos
// =====================================================

//                                   08    09    10    11    12    13    14    15    16    17    18    19    20
const float PERFIL_PH[13]   = {7.30, 7.34, 7.39, 7.44, 7.48, 7.52, 7.54, 7.53, 7.49, 7.45, 7.41, 7.37, 7.34};
const float PERFIL_NTU[13]  = {1.30, 1.80, 2.50, 3.20, 3.80, 4.20, 4.50, 4.40, 3.90, 3.20, 2.60, 2.10, 1.70};
const float PERFIL_TEMP[13] = {26.4, 26.6, 26.9, 27.2, 27.5, 27.8, 27.9, 27.8, 27.6, 27.3, 27.0, 26.8, 26.6};

// Rangos optimos de referencia
const float PH_MIN = 7.2, PH_MAX = 7.6;
const float NTU_MAX = 5.0;

// =====================================================
// 3. ESTADO DE LA SIMULACION
// =====================================================

float horaSimulada = HORA_INICIO;
unsigned long ultimaMuestra = 0;
bool primeraMuestra = true;
unsigned long numeroMuestra = 0;
int minutosAcumulados = 0;

// Acumuladores del registro horario
float sumaPH = 0, sumaNTU = 0, sumaTemp = 0;
int muestrasHora = 0;
unsigned long numeroRegistro = 0;

// Filtro EMA (igual que en el codigo real)
float alpha = 0.20;
float filtradoPH = 0, filtradoNTU = 0, filtradoTemp = 0;
bool filtrosInicializados = false;

// =====================================================
// 4. DOSIFICACION SIMULADA
// =====================================================

const float PULSOS_POR_LITRO = 380.0;
const float PULSOS_POR_SEGUNDO_SIM = 48.0;  // ~0.126 L/s

bool dosificacionActiva = false;
bool bombaEncendida = false;
unsigned long pulsos = 0;
float pulsosFraccion = 0;
float litrosObjetivo = 1.0;
unsigned long tiempoAperturaValvula = 0;
unsigned long ultimaTelemetria = 0;
unsigned long ultimoCalculoPulsos = 0;

// =====================================================
// 5. FUNCIONES AUXILIARES
// =====================================================

// Interpolacion lineal del perfil a la hora simulada
float interpolar(const float *perfil, float hora) {
  float pos = hora - 8.0;
  if (pos < 0) pos = 0;
  if (pos > 12) pos = 12;
  int i = (int)pos;
  if (i >= 12) return perfil[12];
  float frac = pos - i;
  return perfil[i] + (perfil[i + 1] - perfil[i]) * frac;
}

// Ruido pequeno y aleatorio en [-amp, +amp]
float ruido(float amp) {
  return ((float)random(-1000, 1001) / 1000.0) * amp;
}

String horaTexto(float hora) {
  int h = (int)hora;
  int m = (int)round((hora - h) * 60.0);
  if (m >= 60) { h++; m -= 60; }
  char buf[8];
  snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
  return String(buf);
}

// =====================================================
// 6. DOSIFICACION (version simulada)
// =====================================================

void iniciarDosificacion(float objetivo) {
  if (!isfinite(objetivo) || objetivo <= 0) {
    Serial.println("ERROR: Litros objetivo invalidos.");
    return;
  }
  if (dosificacionActiva) {
    Serial.println("AVISO: Ya existe una dosificacion activa.");
    return;
  }

  litrosObjetivo = objetivo;
  pulsos = 0;
  pulsosFraccion = 0;
  dosificacionActiva = true;
  bombaEncendida = false;
  tiempoAperturaValvula = millis();
  ultimoCalculoPulsos = millis();

  Serial.println("================================");
  Serial.println("DOSIFICACION INICIADA");
  Serial.println("Electrovalvula activada.");
  Serial.print("Objetivo: ");
  Serial.print(litrosObjetivo, 3);
  Serial.println(" litros");
  Serial.println("La bomba se activara en 300 ms.");
  Serial.println("================================");
}

void detenerDosificacion(String motivo) {
  dosificacionActiva = false;
  bombaEncendida = false;

  float litrosFinales = pulsos / PULSOS_POR_LITRO;

  Serial.println("--------------------------------");
  Serial.println("Bomba apagada.");
  Serial.println("Electrovalvula desactivada.");
  Serial.print("Motivo: ");
  Serial.println(motivo);
  Serial.print("Pulsos finales: ");
  Serial.println(pulsos);
  Serial.print("Volumen dosificado: ");
  Serial.print(litrosFinales, 3);
  Serial.println(" litros");
  Serial.println("--------------------------------");
}

void controlarDosificacion() {
  if (!dosificacionActiva) return;

  unsigned long ahora = millis();

  if (!bombaEncendida && ahora - tiempoAperturaValvula >= 300) {
    bombaEncendida = true;
    ultimoCalculoPulsos = ahora;
    Serial.println("Bomba dosificadora encendida.");
  }

  // Simula los pulsos del caudalimetro mientras la bomba esta encendida
  if (bombaEncendida) {
    float dt = (ahora - ultimoCalculoPulsos) / 1000.0;
    ultimoCalculoPulsos = ahora;
    pulsosFraccion += PULSOS_POR_SEGUNDO_SIM * dt * (1.0 + ruido(0.05));
    unsigned long enteros = (unsigned long)pulsosFraccion;
    pulsos += enteros;
    pulsosFraccion -= enteros;
  }

  float litros = pulsos / PULSOS_POR_LITRO;

  if (ahora - ultimaTelemetria >= 250) {
    ultimaTelemetria = ahora;
    Serial.print("DOSIFICANDO | Pulsos: ");
    Serial.print(pulsos);
    Serial.print(" | Litros: ");
    Serial.print(litros, 3);
    Serial.print(" / ");
    Serial.println(litrosObjetivo, 3);
  }

  if (litros >= litrosObjetivo) {
    detenerDosificacion("OBJETIVO ALCANZADO");
  }
}


// =====================================================
// 7. MUESTRA SIMULADA (cada 2 s) Y REGISTRO HORARIO
// =====================================================

void registrarHora(float hora) {
  numeroRegistro++;

  float ph = sumaPH / muestrasHora;
  float ntu = sumaNTU / muestrasHora;
  float temp = sumaTemp / muestrasHora;

  Serial.println();
  Serial.println("################################################");
  Serial.print("#  REGISTRO HORARIO #");
  Serial.print(numeroRegistro);
  Serial.print("  |  Hora: ");
  Serial.println(horaTexto(hora));
  Serial.println("################################################");
  Serial.print("#  pH: ");
  Serial.print(ph, 2);
  Serial.print(" | NTU: ");
  Serial.print(ntu, 2);
  Serial.print(" | Temp: ");
  Serial.print(temp, 1);
  Serial.println(" C");
  Serial.print("#  Promedio de ");
  Serial.print(muestrasHora);
  Serial.println(" muestras");
  Serial.print("#  Estado: pH ");
  Serial.print((ph >= PH_MIN && ph <= PH_MAX) ? "OK" : "FUERA DE RANGO");
  Serial.print(" | Turbidez ");
  Serial.println(ntu <= NTU_MAX ? "OK" : "ALTA");
  Serial.println("#  Registro horario almacenado");
  Serial.println("################################################");
  Serial.println();

  sumaPH = sumaNTU = sumaTemp = 0;
  muestrasHora = 0;
}

void tomarMuestra() {
  numeroMuestra++;

  // Valor "crudo" simulado = perfil del dia + ruido de sensor
  float phCrudo = interpolar(PERFIL_PH, horaSimulada) + ruido(0.02);
  float ntuCrudo = interpolar(PERFIL_NTU, horaSimulada) + ruido(0.10);
  float tempCruda = interpolar(PERFIL_TEMP, horaSimulada) + ruido(0.05);

  if (!filtrosInicializados) {
    filtradoPH = phCrudo;
    filtradoNTU = ntuCrudo;
    filtradoTemp = tempCruda;
    filtrosInicializados = true;
  }

  filtradoPH = alpha * phCrudo + (1 - alpha) * filtradoPH;
  filtradoNTU = alpha * ntuCrudo + (1 - alpha) * filtradoNTU;
  filtradoTemp = alpha * tempCruda + (1 - alpha) * filtradoTemp;

  // Lectura en vivo (lo que se obtiene cada 2 s)
  Serial.print("[");
  Serial.print(horaTexto(horaSimulada));
  Serial.print("] pH: ");
  Serial.print(filtradoPH, 2);
  Serial.print(" | NTU: ");
  Serial.print(filtradoNTU, 2);
  Serial.print(" | Temp: ");
  Serial.print(filtradoTemp, 2);
  Serial.println(" C");

  // Acumular para el promedio horario
  sumaPH += filtradoPH;
  sumaNTU += filtradoNTU;
  sumaTemp += filtradoTemp;
  muestrasHora++;

  // Avanzar reloj simulado
  horaSimulada += MINUTOS_SIMULADOS_POR_MUESTRA / 60.0;
  minutosAcumulados += MINUTOS_SIMULADOS_POR_MUESTRA;

  // Cada hora simulada se hace el registro
  if (minutosAcumulados >= MINUTOS_POR_REGISTRO) {
    minutosAcumulados = 0;
    registrarHora(horaSimulada);
  }

  // Fin de jornada: reinicia
  if (horaSimulada > HORA_FIN + 0.001) {
    horaSimulada = HORA_INICIO;
    minutosAcumulados = 0;
    sumaPH = sumaNTU = sumaTemp = 0;
    muestrasHora = 0;
    filtrosInicializados = false;
    Serial.println(">> Fin de jornada. Reiniciando a 08:00.");
    Serial.println();
  }
}

// =====================================================
// 8. SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);

  randomSeed(analogRead(0) + micros());

  Serial.println();
  Serial.println("========================================");
  Serial.println(" SISTEMA IoT DE PISCINA - MODO DEMO");
  Serial.println("========================================");
  
  Serial.print("Jornada: ");
  Serial.print(horaTexto(HORA_INICIO));
  Serial.print(" a ");
  Serial.println(horaTexto(HORA_FIN));
  Serial.print("Lectura en vivo: cada ");
  Serial.print(INTERVALO_MUESTRA / 1000);
  Serial.println(" s");
  Serial.print("Registro: cada hora (= ");
  Serial.print((MINUTOS_POR_REGISTRO / MINUTOS_SIMULADOS_POR_MUESTRA) * (INTERVALO_MUESTRA / 1000));
  Serial.println(" s reales)");
  Serial.println();
  Serial.println("COMANDOS SERIAL:");
  Serial.println("INICIAR 2.50");
  Serial.println("DETENER");
  Serial.println("ESTADO");
  Serial.println("========================================");
  Serial.println();
}

// =====================================================
// 9. LOOP
// =====================================================

void loop() {

  // Comandos serial
  if (Serial.available()) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();

    if (comando.startsWith("INICIAR") || comando.startsWith("DOSIFICAR")) {
      float objetivo = 1.0;
      int espacio = comando.indexOf(' ');
      if (espacio != -1) objetivo = comando.substring(espacio + 1).toFloat();
      iniciarDosificacion(objetivo);
    }
    else if (comando.equalsIgnoreCase("DETENER") || comando.equalsIgnoreCase("PARAR")) {
      detenerDosificacion("Comando Serial");
    }
    else if (comando.equalsIgnoreCase("ESTADO")) {
      Serial.print("ESTADO:");
      Serial.print(dosificacionActiva ? "ACTIVO" : "INACTIVO");
      Serial.print(":LITROS=");
      Serial.print(pulsos / PULSOS_POR_LITRO, 3);
      Serial.print(":OBJETIVO=");
      Serial.print(litrosObjetivo, 3);
      Serial.print(":PULSOS=");
      Serial.println(pulsos);
    }
  }

  controlarDosificacion();

  unsigned long ahora = millis();
  if (primeraMuestra || ahora - ultimaMuestra >= INTERVALO_MUESTRA) {
    ultimaMuestra = ahora;
    primeraMuestra = false;
    tomarMuestra();
  }
}
