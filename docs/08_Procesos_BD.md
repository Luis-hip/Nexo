# Nexo · Procesos de la base de datos

> Registro vivo (DEC-025, `07_Cambios_de_Alcance_Fase2.md`, sección 2). **Un apartado por proceso.** Si creas o cambias un proceso en una migración, lo documentas aquí en el mismo PR (la CI lo comprueba con `scripts/verificar-procesos-doc.ts`).

## 1. La regla

**Toda operación sobre datos es un proceso almacenado en PostgreSQL** (función o procedimiento) creado por una migración. El código de la API **no contiene** `SELECT/INSERT/UPDATE/DELETE` con tablas, filtros ni uniones.

> **Qué sí queda en el código (honestidad):** una **llamada** al proceso (por ejemplo `select * from proc_tarea_votar($1,$2,$3)`) en **un único lugar**: la capa `apps/api/src/repositorios/`. Esa llamada no contiene lógica; la lógica, las consultas y las validaciones viven en la BD. Una prueba o regla de lint falla si aparece SQL de negocio fuera de `repositorios/`.

## 2. Convenciones

- **Nombre:** `proc_<dominio>_<accion>` (`proc_tarea_proponer`, `proc_tarea_votar`, `proc_equipo_crear`, `proc_whatsapp_encolar`).
- **Auxiliares y disparadores:** conservan `fn_` / `trg_` y **no** son invocables por la aplicación (se les revoca `EXECUTE`).
- **Parámetros:** siempre `p_actor_id` (quién ejecuta). El proceso verifica **membresía y rol** del actor como defensa en profundidad; la matriz de `packages/shared` sigue decidiendo en la API.
- **Retorno:** `jsonb` o un tipo compuesto bien definido; la API valida la respuesta con un esquema Zod de `packages/shared`.
- **Errores:** `RAISE EXCEPTION … USING ERRCODE = 'NX0xx'` y se mantiene el catálogo de la sección 3.
- **Transacciones:** cada proceso es atómico e inserta su evento de dominio y su fila de `actividad` en la misma transacción.
- **Seguridad:** `SECURITY DEFINER` solo cuando haga falta, con `SET search_path = public, pg_temp`, validando siempre al actor.
- **Roles:** `nexo_migraciones` (dueño del esquema; solo CI y despliegue) y `nexo_app` (la API): **solo `EXECUTE` sobre `proc_*`**, sin permisos sobre tablas. Las lecturas pasan por procesos o por vistas autorizadas.
- **Migraciones:** cada proceso nuevo o cambiado va en una migración nueva con `-- Up Migration` y `-- Down Migration`.
- **Reglas duplicadas:** la máquina de estados y la mayoría de la votación tienen fuente de verdad en TypeScript (`packages/shared`); una prueba compara la copia de la BD y falla si difieren.

## 3. Catálogo de errores

| SQLSTATE | Significado | Mensaje para el usuario | Origen |
|---|---|---|---|
| `NX001` | Equipo lleno | «Este equipo ya tiene 8 miembros activos.» | `0001` |
| `NX002` | El líder saliente no vota (elección) | «El líder saliente no participa en la votación.» | `0001` |
| `NX003` | Límite de votos de retrospectiva | «Ya usaste tus 3 votos.» | `0001` |
| `NX004` | Voto de propuesta no permitido | «Solo los integrantes pueden votar propuestas abiertas.» | `0002` |

Los códigos nuevos de los procesos (`NX005` en adelante) se agregan aquí al crearlos.

## 4. Índice de procesos

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| *(ninguno todavía; se llenan al construir la votación y al migrar lo existente)* | | | |

## 5. Plantilla de apartado

```
### proc_<dominio>_<accion>
- Migración: 000N_nombre.sql
- Propósito: qué hace, en una frase.
- Parámetros: nombre · tipo · descripción.
- Retorno: forma exacta del resultado.
- Reglas y validaciones: lista (quién puede, en qué estado, límites).
- Errores: SQLSTATE · cuándo · mensaje para el usuario.
- Tablas que toca: lectura / escritura.
- Eventos que genera: evento de dominio y actividad.
- Lo llama: archivo y función del repositorio; ruta HTTP.
- Pruebas: archivo y caso.
- Ejemplo de llamada.
- Historial: fecha · cambio · migración.
```

## 6. Procesos

*(Un apartado por proceso, con la plantilla de la sección 5.)*
