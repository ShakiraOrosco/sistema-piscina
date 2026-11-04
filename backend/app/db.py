import psycopg2
from psycopg2.extras import RealDictCursor

from .config import settings


def get_connection():
    puertos = [settings.DB_PORT, 5432] if str(settings.DB_PORT) != "5432" else [5432, 6543]
    for p in puertos:
        try:
            conn = psycopg2.connect(
                host=settings.DB_HOST,
                port=p,
                dbname=settings.DB_NAME,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                options="-c search_path=piscina_lstm3,public",
                connect_timeout=5,
            )
            with conn.cursor() as cur:
                cur.execute("SET search_path TO piscina_lstm3, public;")
            conn.commit()
            return conn
        except Exception:
            continue
    print(f"No se pudo conectar a Supabase en ninguno de los puertos {puertos}")
    return None


def get_dict_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor)
