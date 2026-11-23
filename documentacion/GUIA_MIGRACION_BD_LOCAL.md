# Guía Paso a Paso: Migración de Base de Datos (Supabase a PostgreSQL Local)

Esta guía explica detalladamente cómo exportar la base de datos alojada en **Supabase** y montarla de forma **local**, para poder trabajar sin conexión a internet o sin depender del servicio en la nube.

---

## 📌 Índice
1. [Requisitos previos](#1-requisitos-previos)
2. [Paso 1: Exportar datos desde Supabase (Dump)](#paso-1-exportar-datos-desde-supabase-dump)
3. [Paso 2: Configurar PostgreSQL Local](#paso-2-configurar-postgresql-local)
   - [Opción A: Con Docker (Recomendada)](#opción-a-con-docker-recomendada)
   - [Opción B: Instalación nativa en Windows](#opción-b-instalación-nativa-en-windows)
4. [Paso 3: Crear la base de datos e importar el respaldo](#paso-3-crear-la-base-de-datos-e-importar-el-respaldo)
5. [Paso 4: Actualizar variables de entorno (.env)](#paso-4-actualizar-variables-de-entorno-env)
6. [Paso 5: Pruebas y verificación](#paso-5-pruebas-y-verificación)
7. [Preguntas Frecuentes y Solución de Problemas](#preguntas-frecuentes-y-solución-de-problemas)

---

## 1. Requisitos previos

- Acceso a internet (solo para el momento de descargar el volcado de Supabase).
- Contraseña actual de la base de datos de Supabase (definida en tu archivo `.env`).
- Herramienta `pg_dump` y `psql` (vienen con cualquier instalación de PostgreSQL o imagen Docker).

---

## Paso 1: Exportar datos desde Supabase (Dump)

Abre una terminal (PowerShell o CMD) en la computadora donde tengas conexión a Supabase y ejecuta:

```powershell
pg_dump -h aws-0-us-east-2.pooler.supabase.com -p 5432 -U "postgres.magihsdcxcjmfdjechvc" -d postgres -F p -b -v --no-owner --no-privileges -f "backup_piscina.sql"
```

> **Explicación de las banderas:**
> - `-h`: Host del servidor de Supabase.
> - `-p`: Puerto (5432).
> - `-U`: Usuario de conexión de Supabase.
> - `-d`: Nombre de la base de datos remota (`postgres`).
> - `--no-owner` y `--no-privileges`: **Muy importante**, evita errores al restaurar en local causados por usuarios internos de Supabase que no existen en tu máquina.
> - `-f "backup_piscina.sql"`: Guarda todo el esquema y los datos en este archivo.

*Nota: Cuando te solicite la contraseña, escribe la contraseña asignada a tu base de datos remota.*

---

## Paso 2: Configurar PostgreSQL Local

Elige la opción que prefieras según tu entorno de trabajo:

### Opción A: Con Docker (Recomendada)

Si utilizas Docker Desktop, puedes añadir el servicio de base de datos a tu archivo `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: piscina-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: tu_password_local
      POSTGRES_DB: piscina_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - piscina-net

volumes:
  postgres_data:
    driver: local
```

Para iniciar solo la base de datos en segundo plano:
```powershell
docker compose up -d db
```

---

### Opción B: Instalación nativa en Windows

1. Descarga el instalador oficial de PostgreSQL (versión 15 o superior) desde:
   [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
   *(o ejecutando `winget install PostgreSQL.PostgreSQL` en PowerShell)*.
2. Sigue el instalador:
   - Define una contraseña para el superusuario `postgres` (ejemplo: `admin123` o `postgres`).
   - Mantén el puerto por defecto `5432`.
   - Se instalará también **pgAdmin 4** (panel visual).

---

## Paso 3: Crear la base de datos e importar el respaldo

### Si elegiste Opción A (Docker):

1. Copia el archivo `backup_piscina.sql` al contenedor de Docker:
   ```powershell
   docker cp backup_piscina.sql piscina-db:/backup_piscina.sql
   ```
2. Ejecuta la restauración dentro del contenedor:
   ```powershell
   docker exec -it piscina-db psql -U postgres -d piscina_db -f /backup_piscina.sql
   ```

---

### Si elegiste Opción B (Windows Nativo):

1. Abre PowerShell o CMD y crea la base de datos:
   ```powershell
   createdb -h localhost -p 5432 -U postgres piscina_db
   ```
   *(También puedes abrir **pgAdmin**, hacer clic derecho en `Databases` -> `Create` -> `Database...` y nombrarla `piscina_db`)*.

2. Restaura los datos del archivo en tu nueva base de datos:
   ```powershell
   psql -h localhost -p 5432 -U postgres -d piscina_db -f "backup_piscina.sql"
   ```

*Nota: Es normal que aparezcan advertencias sobre esquemas de Supabase que no se usan en local (`auth`, `storage`, etc.). Las tablas principales del proyecto (`mediciones`, usuarios, etc.) quedarán completamente operativas.*

---

## Paso 4: Actualizar variables de entorno (.env)

Modifica las variables en tu archivo `.env` en la raíz del proyecto para que apunte a tu base de datos local:

### Caso A: Si ejecutas el backend con Python en Windows (`INICIAR_SISTEMA_WINDOWS.bat` o `uvicorn`):
```env
SUPABASE_DB_HOST=127.0.0.1
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=piscina_db
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=tu_password_local
```

### Caso B: Si ejecutas todo dentro de Docker (`docker compose up`):
```env
SUPABASE_DB_HOST=db
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=piscina_db
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=tu_password_local
```

---

## Paso 5: Pruebas y verificación

Para comprobar que el backend se conecta de forma exitosa antes de levantar todo el sistema:

1. Ejecuta esta prueba rápida en PowerShell:
   ```powershell
   python -c "import psycopg2; conn = psycopg2.connect(host='127.0.0.1', port=5432, dbname='piscina_db', user='postgres', password='tu_password_local'); print('¡Conexión exitosa a la base de datos local!'); conn.close()"
   ```
2. Inicia el sistema con tu método habitual:
   - Windows nativo: `./INICIAR_SISTEMA_WINDOWS.bat`
   - Docker: `docker compose up`
3. Abre el navegador en `http://localhost:3000` y verifica que cargan las tablas y gráficos correctamente.

---

## Preguntas Frecuentes y Solución de Problemas

- **¿Tengo que modificar el código del backend (`db.py`)?**
  No. El backend se conecta mediante `psycopg2`, que es el conector estándar de PostgreSQL. Al cambiar las variables en el `.env`, el backend se comunicará con tu servidor local de forma transparente.

- **¿Qué pasa si el puerto 5432 ya está ocupado?**
  Puedes cambiar el puerto local en Docker (por ejemplo `"5433:5432"`) o en tu instalación de PostgreSQL, y actualizar `SUPABASE_DB_PORT=5433` en tu `.env`.
