import psycopg2
from psycopg2.extras import RealDictCursor

from .config import settings


def get_connection():
    try:
        return psycopg2.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            dbname=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
        )
    except Exception as exc:  # pragma: no cover - depende del entorno de ejecución
        print(f"No se pudo conectar a Supabase: {exc}")
        return None


def get_dict_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor)
