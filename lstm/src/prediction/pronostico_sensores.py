"""
pronostico_sensores.py
======================
Pronóstico de corto plazo de las variables de la piscina (pH, turbidez,
temperatura y bañistas) a partir de pocas lecturas del día (3-4 bastan),
y detección de fallas de sensores.

Método (sin entrenamiento, robusto con pocos datos):
  1. Tendencia lineal ponderada (más peso a lecturas recientes) sobre las
     lecturas de hoy, con amortiguamiento: la pendiente se va apagando hora
     a hora para no extrapolar sin límite (idea de Holt "damped trend").
  2. Perfil histórico por hora (promedio de días anteriores), desplazado
     al nivel de hoy. Aporta la "forma" típica del día.
  3. Mezcla: la tendencia domina en horas cercanas y el perfil en las lejanas.
  4. Recorte a rangos físicos + banda de confianza a partir de los residuos.
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

VARIABLES = ("ph", "turbidez", "temperatura")

# Rango en el que una lectura se considera físicamente válida (si no -> falla)
RANGO_VALIDO = {
    "ph": (0.0, 14.0),
    "turbidez": (0.0, 1000.0),
    "temperatura": (0.0, 50.0),
    "banistas": (0.0, 5000.0),
}
# Rango al que se recorta un valor pronosticado
RANGO_PRONOSTICO = {
    "ph": (6.0, 9.0),
    "turbidez": (0.0, 100.0),
    "temperatura": (15.0, 40.0),
    "banistas": (0.0, 5000.0),
}
# Error mínimo asumido (para que la banda no sea 0 con pocos puntos)
SIGMA_MINIMO = {"ph": 0.05, "turbidez": 0.3, "temperatura": 0.3, "banistas": 3.0}

AMORTIGUAMIENTO = 0.85        # phi por hora
HORIZONTE_MEZCLA_H = 3.0      # a mayor distancia, más peso del perfil histórico
MAX_PUNTOS_TENDENCIA = 6      # últimas N lecturas para calcular la tendencia
MIN_SIN_LECTURAS = 90         # minutos sin datos -> sensor/ESP32 desconectado
HORA_APERTURA, HORA_CIERRE = 8, 20


# ─────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────
def a_datetime(valor) -> Optional[datetime]:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.replace(tzinfo=None)
    if isinstance(valor, str):
        try:
            return datetime.fromisoformat(valor.replace("Z", "")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def horas_del_dia(t: datetime) -> float:
    return t.hour + t.minute / 60.0 + t.second / 3600.0


def valor_valido(variable: str, valor) -> Optional[float]:
    """Devuelve el valor como float si es válido, o None si el sensor falló."""
    if valor is None:
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    lo, hi = RANGO_VALIDO.get(variable, (-math.inf, math.inf))
    return v if lo <= v <= hi else None


def _recortar(variable: str, v: float) -> float:
    lo, hi = RANGO_PRONOSTICO.get(variable, (-math.inf, math.inf))
    return min(hi, max(lo, v))


def _interp_perfil(perfil: Optional[Dict[int, float]], h: float) -> Optional[float]:
    if not perfil:
        return None
    horas = sorted(perfil)
    if h <= horas[0]:
        return perfil[horas[0]]
    if h >= horas[-1]:
        return perfil[horas[-1]]
    for a, b in zip(horas, horas[1:]):
        if a <= h <= b:
            if b == a:
                return perfil[a]
            f = (h - a) / (b - a)
            return perfil[a] + f * (perfil[b] - perfil[a])
    return None


# ─────────────────────────────────────────────
# Pronóstico de una serie
# ─────────────────────────────────────────────
def _tendencia(puntos: Sequence[Tuple[float, float]]):
    """Regresión lineal ponderada -> (nivel_en_ultimo, pendiente_por_hora, sigma)."""
    pts = list(puntos)[-MAX_PUNTOS_TENDENCIA:]
    n = len(pts)
    pesos = [0.5 + i / max(1, n - 1) for i in range(n)]  # 0.5 ... 1.5
    sw = sum(pesos)
    mx = sum(w * x for w, (x, _) in zip(pesos, pts)) / sw
    my = sum(w * y for w, (_, y) in zip(pesos, pts)) / sw
    sxx = sum(w * (x - mx) ** 2 for w, (x, _) in zip(pesos, pts))
    sxy = sum(w * (x - mx) * (y - my) for w, (x, y) in zip(pesos, pts))
    pendiente = sxy / sxx if sxx > 1e-9 else 0.0
    x_ult = pts[-1][0]
    nivel = my + pendiente * (x_ult - mx)
    residuos = [y - (my + pendiente * (x - mx)) for x, y in pts]
    gl = max(1, n - 2)
    sigma = math.sqrt(sum(r * r for r in residuos) / gl)
    return nivel, pendiente, sigma


def pronosticar_serie(
    puntos: Sequence[Tuple[float, float]],
    horas_objetivo: Sequence[float],
    variable: str,
    perfil: Optional[Dict[int, float]] = None,
) -> List[Dict[str, float]]:
    """Pronostica `variable` en cada hora (float, 0-24) de `horas_objetivo`.

    `puntos`: lecturas válidas de hoy como (hora_float, valor).
    Devuelve [{hora, valor, inferior, superior}] (vacío si no hay con qué estimar).
    """
    puntos = sorted(puntos)
    sig_min = SIGMA_MINIMO.get(variable, 0.1)
    salida: List[Dict[str, float]] = []

    if not puntos and not perfil:
        return salida

    if len(puntos) >= 3:
        nivel, pendiente, sigma = _tendencia(puntos)
    elif puntos:
        nivel, pendiente, sigma = puntos[-1][1], 0.0, 0.0
        if len(puntos) == 2 and puntos[1][0] > puntos[0][0]:
            # Con 2 puntos: pendiente muy prudente (mitad)
            pendiente = 0.5 * (puntos[1][1] - puntos[0][1]) / (puntos[1][0] - puntos[0][0])
    else:
        nivel = pendiente = sigma = None
    sigma = max(sigma or 0.0, sig_min)

    h_ult = puntos[-1][0] if puntos else None
    offset_perfil = None
    if perfil and puntos:
        base = _interp_perfil(perfil, h_ult)
        offset_perfil = nivel - base if base is not None else None

    phi = AMORTIGUAMIENTO
    for h in horas_objetivo:
        # 1) Dentro del rango de lecturas: interpolación lineal entre vecinos
        if puntos and puntos[0][0] <= h <= puntos[-1][0] and len(puntos) >= 2:
            for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
                if x0 <= h <= x1:
                    v = y0 if x1 == x0 else y0 + (h - x0) / (x1 - x0) * (y1 - y0)
                    break
            banda = sigma
        elif puntos:
            dh = h - h_ult
            if dh >= 0:
                # 2) Futuro: tendencia amortiguada
                avance = pendiente * phi * (1 - phi ** dh) / (1 - phi) if dh > 0 else 0.0
                v_tend = nivel + avance
            else:
                # Antes de la primera lectura: sin extrapolar hacia atrás
                v_tend = puntos[0][1]
                dh = abs(h - puntos[0][0])
            v = v_tend
            if offset_perfil is not None:
                p = _interp_perfil(perfil, h)
                if p is not None:
                    w = math.exp(-abs(dh) / HORIZONTE_MEZCLA_H)
                    v = w * v_tend + (1 - w) * (p + offset_perfil)
            banda = sigma * (1 + 0.35 * abs(dh))
        else:
            # 3) Sin lecturas hoy: solo perfil histórico
            v = _interp_perfil(perfil, h)
            banda = sig_min * 4

        v = _recortar(variable, v)
        lo, hi = RANGO_PRONOSTICO.get(variable, (-math.inf, math.inf))
        salida.append({
            "hora": h,
            "valor": round(v, 3),
            "inferior": round(max(lo, v - 1.96 * banda), 3),
            "superior": round(min(hi, v + 1.96 * banda), 3),
        })
    return salida


# ─────────────────────────────────────────────
# Helpers por jornada
# ─────────────────────────────────────────────
def puntos_validos(mediciones: List[Dict[str, Any]], variable: str) -> List[Tuple[float, float]]:
    pts = []
    for m in mediciones:
        t = a_datetime(m.get("fecha_hora"))
        v = valor_valido(variable, m.get(variable))
        if t is not None and v is not None:
            pts.append((horas_del_dia(t), v))
    return sorted(pts)


def puntos_banistas(aforos_camara: List[Dict[str, Any]]) -> List[Tuple[float, float]]:
    pts = []
    for a in aforos_camara or []:
        t = a_datetime(a.get("fecha_hora"))
        v = valor_valido("banistas", a.get("cantidad_personas"))
        if t is not None and v is not None:
            pts.append((horas_del_dia(t), v))
    return sorted(pts)


def estimar_valor(
    mediciones: List[Dict[str, Any]],
    variable: str,
    momento: datetime,
    perfil: Optional[Dict[int, float]] = None,
    aforos_camara: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, float]]:
    """Valor estimado de `variable` en `momento` (pasado o futuro)."""
    pts = puntos_banistas(aforos_camara) if variable == "banistas" else puntos_validos(mediciones, variable)
    res = pronosticar_serie(pts, [horas_del_dia(momento)], variable, perfil)
    return res[0] if res else None


def detectar_fallas(
    mediciones: List[Dict[str, Any]],
    ahora: Optional[datetime] = None,
    umbral_min: int = MIN_SIN_LECTURAS,
) -> Dict[str, Any]:
    """Estado de cada sensor.

    estado: "ok" | "sin_dato" (llegó vacío) | "fuera_rango" | "sin_conexion" | "sin_lecturas"
    """
    ahora = ahora or datetime.now()
    ordenadas = sorted(
        [(a_datetime(m.get("fecha_hora")), m) for m in mediciones if a_datetime(m.get("fecha_hora"))],
        key=lambda x: x[0],
    )
    ultima_t = ordenadas[-1][0] if ordenadas else None
    minutos_sin = int((ahora - ultima_t).total_seconds() // 60) if ultima_t else None
    en_horario = HORA_APERTURA <= ahora.hour < HORA_CIERRE
    desconectado = minutos_sin is not None and minutos_sin > umbral_min and en_horario

    estado: Dict[str, Any] = {"minutos_sin_lecturas": minutos_sin, "ultima_lectura": ultima_t.isoformat() if ultima_t else None}
    for var in VARIABLES:
        ultima_valida = None
        for t, m in reversed(ordenadas):
            if valor_valido(var, m.get(var)) is not None:
                ultima_valida = t
                break
        if not ordenadas:
            e = "sin_lecturas"
        else:
            bruto = ordenadas[-1][1].get(var)
            if bruto is None:
                e = "sin_dato"
            elif valor_valido(var, bruto) is None:
                e = "fuera_rango"
            elif desconectado:
                e = "sin_conexion"
            else:
                e = "ok"
        estado[var] = {
            "estado": e,
            "ultima_valida": ultima_valida.isoformat() if ultima_valida else None,
        }
    return estado


def pronosticar_dia(
    mediciones: List[Dict[str, Any]],
    aforos_camara: Optional[List[Dict[str, Any]]] = None,
    perfiles: Optional[Dict[str, Dict[int, float]]] = None,
    ahora: Optional[datetime] = None,
    fecha: Optional[date] = None,
    hasta_hora: int = HORA_CIERRE,
) -> Dict[str, List[Dict[str, Any]]]:
    """Pronóstico hora a hora (desde la hora siguiente a la última lectura válida hasta `hasta_hora`)."""
    perfiles = perfiles or {}
    ahora = ahora or datetime.now()
    if fecha is None:
        ts = [a_datetime(m.get("fecha_hora")) for m in mediciones]
        ts = [t for t in ts if t]
        fecha = ts[0].date() if ts else ahora.date()

    resultado: Dict[str, List[Dict[str, Any]]] = {}
    for var in VARIABLES + ("banistas",):
        pts = puntos_banistas(aforos_camara) if var == "banistas" else puntos_validos(mediciones, var)
        if not pts and not perfiles.get(var):
            resultado[var] = []
            continue
        desde = math.floor(pts[-1][0]) + 1 if pts else HORA_APERTURA
        horas = [float(h) for h in range(max(desde, HORA_APERTURA), hasta_hora + 1)]
        serie = pronosticar_serie(pts, horas, var, perfiles.get(var))
        for p in serie:
            p["fecha_hora"] = datetime.combine(fecha, time(hour=int(p.pop("hora")))).isoformat()
        resultado[var] = serie
    return resultado


def valores_estimados_actuales(
    mediciones: List[Dict[str, Any]],
    estado: Dict[str, Any],
    perfiles: Optional[Dict[str, Dict[int, float]]] = None,
    ahora: Optional[datetime] = None,
) -> Dict[str, Dict[str, float]]:
    """Para cada sensor con falla, su valor estimado en este momento."""
    ahora = ahora or datetime.now()
    perfiles = perfiles or {}
    out = {}
    for var in VARIABLES:
        if estado.get(var, {}).get("estado") not in (None, "ok"):
            est = estimar_valor(mediciones, var, ahora, perfiles.get(var))
            if est:
                out[var] = est
    return out
