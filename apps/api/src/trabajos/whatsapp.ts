import type { Config } from '../config';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/whatsapp';
import { entregar } from '../whatsapp/proveedor';

interface Registro {
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

/**
 * Un ciclo del despachador de WhatsApp (Fase 4.2, DEC-WA-1):
 *  1. registra los vencimientos de las próximas 24 h (`tarea.por_vencer`);
 *  2. procesa los eventos de dominio pendientes (avisos en la app y cola de WhatsApp);
 *  3. arma los reportes programados que ya tocan;
 *  4. entrega lo que el sistema envía solo (reportes y, con envío automático, instantáneos).
 * Todo pasa por procesos con `FOR UPDATE SKIP LOCKED`: dos instancias no repiten trabajo.
 */
export async function cicloWhatsApp(db: BaseDatos, config: Config, ahora?: string) {
  // Spike 1 a 1: lo que esperaba la ventana de 24 h y ya caducó (P-7).
  const cad = await repo.caducarPendientes(db, ahora);
  const venc = await repo.vencimientos(db);
  const eventos = await repo.procesarEventos(db);
  const rep = await repo.reportes(db);
  const envio = await entregar(db, config, await repo.porEnviar(db));
  return {
    vencimientos: venc.registrados,
    ...eventos,
    reportes: rep.generados,
    ...envio,
    caducadas: cad.caducadas,
  };
}

/**
 * Corre el ciclo cada minuto en el mismo proceso de la API, igual que los plazos de las elecciones
 * (`trabajos/plazos.ts`). En el plan gratuito de Render la API duerme sin tráfico: al despertar,
 * el primer ciclo pone todo al día (DEC-WA-1). Devuelve la función que lo detiene.
 */
export function iniciarWhatsApp(
  db: BaseDatos,
  config: Config,
  log: Registro,
  cadaMs = 60_000,
): () => void {
  let ocupado = false;
  const tic = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await cicloWhatsApp(db, config);
      if (r.encolados + r.reportes + r.enviados + r.fallidos > 0) log.info(r, 'Ciclo de WhatsApp');
    } catch (error) {
      log.error(error, 'Falló el ciclo de WhatsApp');
    } finally {
      ocupado = false;
    }
  };
  const temporizador = setInterval(() => void tic(), cadaMs);
  temporizador.unref();
  void tic();
  return () => clearInterval(temporizador);
}
