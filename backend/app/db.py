import psycopg2
from psycopg2.extras import RealDictCursor

from .config import settings


def get_connection():
    try:
        conn = psycopg2.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            dbname=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            options="-c search_path=piscina_lstm3,public",
        )
        # Supabase usa pgBouncer en modo transaction (puerto 6543),
        # lo que ignora el parámetro `options`. Por eso ejecutamos
        # SET search_path explícitamente en cada conexión nueva.
        with conn.cursor() as cur:
            cur.execute("SET search_path TO piscina_lstm3, public;")
        conn.commit()
        return conn
    except Exception as exc:  # pragma: no cover - depende del entorno de ejecución
        print(f"No se pudo conectar a Supabase: {exc}")
        return None


def get_dict_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor)
