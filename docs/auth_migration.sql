-- Ejecutar después del esquema inicial.
ALTER TABLE piscina_lstm3.usuario
    ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE piscina_lstm3.usuario
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- Separar el nombre conservando temporalmente el valor original para validarlo.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'piscina_lstm3'
          AND table_name = 'usuario'
          AND column_name = 'nombre'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'piscina_lstm3'
          AND table_name = 'usuario'
          AND column_name = 'nombre_completo'
    ) THEN
        ALTER TABLE piscina_lstm3.usuario RENAME COLUMN nombre TO nombre_completo;
    END IF;
END $$;

ALTER TABLE piscina_lstm3.usuario
    ADD COLUMN IF NOT EXISTS nombre VARCHAR(60),
    ADD COLUMN IF NOT EXISTS primer_apellido VARCHAR(60),
    ADD COLUMN IF NOT EXISTS segundo_apellido VARCHAR(60);

WITH partes AS (
    SELECT id_usuario, regexp_split_to_array(trim(nombre_completo), '\s+') AS palabras
    FROM piscina_lstm3.usuario
)
UPDATE piscina_lstm3.usuario AS usuario
SET nombre = partes.palabras[1],
    primer_apellido = COALESCE(partes.palabras[2], ''),
    segundo_apellido = CASE
        WHEN cardinality(partes.palabras) > 2 THEN array_to_string(partes.palabras[3:], ' ')
        ELSE ''
    END
FROM partes
WHERE usuario.id_usuario = partes.id_usuario
  AND usuario.nombre IS NULL;

-- La primera cuenta ADM debe crearse mediante un procedimiento inicial controlado.
-- Después, POST /api/v1/auth/users exige un token de un administrador.
