import type { BaseDatos } from '../db/conexion';
import * as liderazgo from '../repositorios/liderazgo';
import * as pendientes from '../repositorios/pendientes';

interface Registro {
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

/**
 * Tareas programadas de la Fase 3 (DEC-032): cada minuto resuelve las elecciones de líder cuyo
 * plazo venció (`proc_eleccion_vencidas`). Corre en el mismo proceso de la API, como pide
 * `10_Plan_de_Despliegue.md` (sin `pg-boss`, DEC-WA-1). También guarda la foto diaria del burndown
 * de cada sprint activo (`proc_sprint_fotos_diarias`, DEC-037). Con varias
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
    }
    // Foto diaria del burndown (DEC-037): una por sprint activo y día; repetirla solo la actualiza.
    try {
      await pendientes.fotosDiarias(db);
    } catch (error) {
      log.error(error, 'No se pudo guardar la foto diaria de los sprints');
    } finally {
      ocupado = false;
    }
  };
  const temporizador = setInterval(() => void tic(), cadaMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
