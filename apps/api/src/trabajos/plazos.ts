import type { BaseDatos } from '../db/conexion';
import * as liderazgo from '../repositorios/liderazgo';

interface Registro {
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

/**
 * Tareas programadas de la Fase 3 (DEC-032): cada minuto resuelve las elecciones de líder cuyo
 * plazo venció (`proc_eleccion_vencidas`). Corre en el mismo proceso de la API, como pide
 * `10_Plan_de_Despliegue.md`; en la Fase 4 la sustituye una cola de `pg-boss`. Con varias
 * instancias es seguro: el proceso salta las elecciones que otra está resolviendo.
 * Devuelve la función que detiene el temporizador.
 */
export function iniciarPlazos(db: BaseDatos, log: Registro, cadaMs = 60_000): () => void {
  let ocupado = false;
  const tic = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const { resueltas } = await liderazgo.vencerElecciones(db);
      if (resueltas > 0) log.info({ resueltas }, 'Elecciones de líder resueltas por plazo');
    } catch (error) {
      log.error(error, 'No se pudieron resolver las elecciones vencidas');
    } finally {
      ocupado = false;
    }
  };
  const temporizador = setInterval(() => void tic(), cadaMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
