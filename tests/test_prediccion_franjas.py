from datetime import datetime

from lstm.src.prediction.prediccion_service import seleccionar_franjas


def _m(h, mi, ph):
    return {"fecha_hora": datetime(2026, 10, 6, h, mi), "ph": ph, "turbidez": 2.0, "temperatura": 27.0}


def test_elige_lectura_mas_cercana_a_cada_franja():
    mediciones = [_m(7, 55, 7.0), _m(8, 30, 7.1), _m(11, 50, 7.2), _m(12, 40, 7.3), _m(16, 10, 7.4)]
    franjas = seleccionar_franjas(mediciones)
    assert [f["ph"] for f in franjas] == [7.0, 7.2, 7.4]
    assert all(f["capturada"] for f in franjas)


def test_antes_del_mediodia_es_parcial_y_rellena():
    franjas = seleccionar_franjas([_m(8, 5, 7.1), _m(9, 0, 7.5)])
    assert [f["capturada"] for f in franjas] == [True, False, False]
    assert [f["ph"] for f in franjas] == [7.1, 7.1, 7.1]


def test_banistas_desde_camara_y_taquilla():
    mediciones = [_m(8, 0, 7.2), _m(12, 0, 7.2)]
    camara = [{"fecha_hora": datetime(2026, 10, 6, 12, 5), "cantidad_personas": 40}]
    manual = [{"hora_entrada": datetime(2026, 10, 6, 7, 30), "total_personas": 12}]
    franjas = seleccionar_franjas(mediciones, camara, manual)
    assert franjas[0]["banistas"] == 12 and franjas[0]["fuente_banistas"] == "taquilla"
    assert franjas[1]["banistas"] == 40 and franjas[1]["fuente_banistas"] == "camara"


def test_lecturas_fuera_de_ventana_no_cuentan():
    franjas = seleccionar_franjas([_m(10, 30, 7.0)], ventana_horas=2)
    assert [f["capturada"] for f in franjas] == [False, True, False]
