-- Fase 2.5 · Roles de la BD (DEC-025, docs/08 sección «Roles»).
--
-- `nexo_app` es el rol de la API: SOLO puede ejecutar los procesos `proc_*`. No tiene permisos
-- sobre tablas, vistas ni secuencias, ni puede llamar a las auxiliares `fn_*`. Así, aunque
-- alguien robe la conexión de la aplicación, no puede leer ni escribir tablas a mano.
--
-- `nexo_migraciones` es el dueño del esquema: es el rol con el que se EJECUTAN las migraciones
-- (DATABASE_URL_MIGRACIONES). No lo crea esta migración: es quien la ejecuta. En local y en la
-- CI ese papel lo hace el usuario de DATABASE_URL.
--
-- Esta migración no escribe contraseñas (docs/09): `nexo_app` nace sin inicio de sesión y una
-- persona lo habilita en el despliegue con `ALTER ROLE nexo_app LOGIN PASSWORD '…'`.

-- Up Migration

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    BEGIN
      CREATE ROLE nexo_app NOLOGIN;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'No se pudo crear el rol nexo_app (falta CREATEROLE). Créalo a mano y ejecuta SELECT fn_conceder_procesos();';
    END;
  END IF;
END $$;

/**
 * Deja los permisos como dice la regla: nadie más que el dueño ejecuta `fn_*`; `nexo_app` solo
 * ejecuta `proc_*` (menos los de desarrollo, `proc_dev_*`) y no toca tablas.
 * Es idempotente. Toda migración que cree o cambie procesos termina con
 * `SELECT fn_conceder_procesos();` (lo comprueba la prueba de roles).
 */
CREATE OR REPLACE FUNCTION fn_conceder_procesos() RETURNS void AS $$
DECLARE
  f     record;
  v_app boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app');
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'proc\_%' OR p.proname LIKE 'fn\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.firma);
    IF v_app THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM nexo_app', f.firma);
      IF f.proname LIKE 'proc\_%' AND f.proname NOT LIKE 'proc\_dev\_%' THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO nexo_app', f.firma);
      END IF;
    END IF;
  END LOOP;
  IF v_app THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexo_app';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexo_app';
    EXECUTE 'GRANT USAGE ON SCHEMA public TO nexo_app';
  END IF;
END $$ LANGUAGE plpgsql;

SELECT fn_conceder_procesos();

-- Down Migration
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'proc\_%' OR p.proname LIKE 'fn\_%')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f.firma);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    BEGIN
      EXECUTE 'DROP OWNED BY nexo_app';
      EXECUTE 'DROP ROLE nexo_app';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'El rol nexo_app no se borró (se usa en otra base o falta permiso): %', SQLERRM;
    END;
  END IF;
END $$;
DROP FUNCTION IF EXISTS fn_conceder_procesos();
