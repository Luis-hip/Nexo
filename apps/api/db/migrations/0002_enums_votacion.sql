-- Fase 2.5 · Votación de propuestas (DEC-024, docs/07 sección 1.3).
-- Solo agrega valores a enums existentes. Va en su propia migración porque PostgreSQL no deja
-- USAR un valor nuevo de enum en la misma transacción que lo crea; la 0003 ya puede usarlos.

-- Up Migration
ALTER TYPE rechazo_por         ADD VALUE IF NOT EXISTS 'votacion';     -- rechazada por mayoría
ALTER TYPE politica_propuestas ADD VALUE IF NOT EXISTS 'votacion';     -- nuevo valor por defecto (0003)
ALTER TYPE estado_tarea        ADD VALUE IF NOT EXISTS 'cancelada';    -- el líder retiró la propuesta

-- Down Migration
-- PostgreSQL no permite quitar valores de un enum sin recrear el tipo y todas sus columnas.
-- Los valores quedan sin uso al revertir la 0003; no se borran (bajada sin efecto, a propósito).
SELECT 1;
