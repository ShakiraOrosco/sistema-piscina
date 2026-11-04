import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from ..db import get_connection, get_dict_cursor
from ..services.piscina_service import serializar_dict

router = APIRouter(prefix="/api/v1/auditoria", tags=["auditoria"])


def registrar_log(
    conn=None,
    id_usuario: Optional[int] = None,
    modulo: str = "General",
    accion: str = "INFO",
    entidad: str = "sistema",
    detalle: Optional[dict] = None,
    ip_origen: Optional[str] = None,
):
    """Registra de forma independiente y garantizada un evento en la tabla log_auditoria."""
    audit_conn = get_connection()
    if audit_conn is None:
        return
    try:
        cur = audit_conn.cursor()
        detalle_json = json.dumps(detalle) if detalle else None
        cur.execute(
            """
            INSERT INTO log_auditoria (id_usuario, modulo, accion, entidad, detalle, ip_origen, fecha_hora)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (id_usuario, modulo, accion, entidad, detalle_json, ip_origen, datetime.now()),
        )
        audit_conn.commit()
        cur.close()
    except Exception as exc:
        audit_conn.rollback()
        print(f"Error guardando log de auditoría: {exc}")
    finally:
        audit_conn.close()


@router.get("/logs")
def listar_logs(
    fecha: Optional[str] = None,
    limit: Optional[int] = 500,
    claims: dict = Depends(lambda: __import__('app.routers.auth', fromlist=['administrador_actual']).administrador_actual)
):
    """Obtiene el historial de auditoría de actividades del sistema con soporte para filtrado por fecha."""
    conn = get_connection()
    if conn is None:
        raise HTTPException(status_code=500, detail="No se pudo conectar a la base de datos")
    try:
        cur = get_dict_cursor(conn)
        conditions = []
        params = []

        if fecha and fecha.strip():
            fecha_clean = fecha.strip()
            conditions.append(
                """(
                    DATE(l.fecha_hora) = %s 
                    OR l.fecha_hora::text LIKE %s
                    OR (l.fecha_hora >= %s AND l.fecha_hora <= %s)
                )"""
            )
            params.extend([
                fecha_clean,
                f"{fecha_clean}%",
                f"{fecha_clean} 00:00:00",
                f"{fecha_clean} 23:59:59.999999"
            ])

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query_limit = max(1, min(limit or 500, 2000))
        params.append(query_limit)

        sql = f"""
            SELECT 
                l.id_log,
                l.id_usuario,
                l.modulo,
                l.accion,
                l.entidad,
                l.detalle,
                l.ip_origen,
                l.fecha_hora,
                u.nombre AS nombre_usuario,
                u.primer_apellido AS apellido_usuario,
                u.correo AS correo_usuario,
                u.sigla_rol
            FROM log_auditoria l
            LEFT JOIN usuario u ON u.id_usuario = l.id_usuario
            {where_clause}
            ORDER BY l.fecha_hora DESC
            LIMIT %s
        """
        cur.execute(sql, tuple(params))
        logs = [serializar_dict(log) for log in cur.fetchall()]
        return logs
    finally:
        conn.close()
