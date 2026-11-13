import queue
import threading
import time
import psycopg2
from psycopg2.extras import RealDictCursor

from .config import settings

_pool: queue.LifoQueue = queue.LifoQueue(maxsize=12)
_puerto_preferido = None
_lock = threading.Lock()


class _PooledConnection:
    """Envoltorio ligero que devuelve la conexión al pool al llamar a close()."""

    def __init__(self, raw_conn, created_at: float):
        self._conn = raw_conn
        self._created_at = created_at
        self._returned = False

    def cursor(self, *args, **kwargs):
        return self._conn.cursor(*args, **kwargs)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    @property
    def closed(self):
        return self._conn.closed

    def close(self):
        if self._returned:
            return
        self._returned = True
        if self._conn is None or self._conn.closed:
            return
        try:
            # Limpiar cualquier transacción pendiente antes de reusar
            if self._conn.info.transaction_status in (
                psycopg2.extensions.TRANSACTION_STATUS_INTRANS,
                psycopg2.extensions.TRANSACTION_STATUS_INERROR,
            ):
                self._conn.rollback()
            # Reusar conexiones con menos de 120s de vida
            if (time.time() - self._created_at) < 120.0:
                _pool.put_nowait((self._conn, time.time()))
                return
        except Exception:
            pass
        try:
            self._conn.close()
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def _crear_conexion_nueva():
    global _puerto_preferido
    puerto_cfg = int(settings.DB_PORT) if str(settings.DB_PORT).isdigit() else 5432
    otro_puerto = 5432 if puerto_cfg != 5432 else 6543

    if _puerto_preferido is not None:
        puertos = [_puerto_preferido, puerto_cfg if _puerto_preferido != puerto_cfg else otro_puerto]
    else:
        puertos = [5432, puerto_cfg] if puerto_cfg != 5432 else [5432, 6543]

    # Eliminar duplicados manteniendo orden
    puertos_unicos = []
    for p in puertos:
        if p not in puertos_unicos:
            puertos_unicos.append(p)

    for p in puertos_unicos:
        try:
            conn = psycopg2.connect(
                host=settings.DB_HOST,
                port=p,
                dbname=settings.DB_NAME,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                options="-c search_path=piscina_lstm3,public",
                connect_timeout=3,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=3,
            )
            _puerto_preferido = p
            return _PooledConnection(conn, time.time())
        except Exception:
            continue
    print(f"No se pudo conectar a Supabase en ninguno de los puertos {puertos_unicos}")
    return None


def get_connection():
    while not _pool.empty():
        try:
            raw_conn, last_used = _pool.get_nowait()
        except queue.Empty:
            break
        if raw_conn is None or raw_conn.closed:
            continue
        # Si estuvo inactiva más de 45s, verificar salud rápidamente
        if (time.time() - last_used) > 45.0:
            try:
                with raw_conn.cursor() as cur:
                    cur.execute("SELECT 1")
            except Exception:
                try:
                    raw_conn.close()
                except Exception:
                    pass
                continue
        return _PooledConnection(raw_conn, last_used)

    return _crear_conexion_nueva()


def get_dict_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor)
