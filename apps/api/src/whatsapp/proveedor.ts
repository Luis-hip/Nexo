import type { AvisoParaEnviar } from '@nexo/shared';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Ejecutor } from '../db/conexion';
import * as repo from '../repositorios/whatsapp';

/**
 * Capa de proveedor de WhatsApp (docs/01 §7.2, DEC-WA-1). El resto de la aplicación solo conoce
 * `ProveedorWhatsApp`; cambiar de proveedor es cambiar la configuración del equipo.
 *
 * - `simulado`: no envía nada; devuelve un id «sim-…» y el aviso queda como enviado.
 * - `cloud_api_grupos`: un mensaje al grupo del equipo (API de grupos de Meta). Exige una cuenta de
 *   empresa oficial (OBA); **sin probar con una cuenta real** (docs/whatsapp-verificacion.md).
 * - `cloud_api_directo`: un mensaje por persona con número y consentimiento.
 *
 * El servidor solo usa la API de Meta con `WHATSAPP_PROVIDER=real`; en modo `simulado` (el de
 * siempre) ningún aviso sale, aunque un equipo tenga elegido un proveedor real.
 */
export interface ProveedorWhatsApp {
  readonly nombre: string;
  /** Entrega el aviso y devuelve el id que le dio el proveedor. Lanza un error si no se pudo. */
  enviar(aviso: AvisoParaEnviar): Promise<string>;
}

export const proveedorSimulado: ProveedorWhatsApp = {
  nombre: 'simulado',
  async enviar() {
    return `sim-${randomUUID()}`;
  },
};

/** Proveedor de la API Cloud de Meta (grupos o directo, según el aviso). */
export function proveedorCloudApi(
  token: string,
  phoneId: string,
  graph = 'https://graph.facebook.com/v21.0',
): ProveedorWhatsApp {
  const publicar = async (cuerpo: object) => {
    const r = await fetch(`${graph}/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
      signal: AbortSignal.timeout(15_000),
    });
    const datos = (await r.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;
    if (!r.ok || !datos?.messages?.[0]?.id) {
      throw new Error(datos?.error?.message ?? `Meta respondió ${r.status}`);
    }
    return datos.messages[0].id;
  };
  return {
    nombre: 'cloud_api',
    async enviar(aviso) {
      if (aviso.proveedor === 'cloud_api_grupos') {
        if (!aviso.grupo_externo_id) throw new Error('El equipo no tiene el id del grupo.');
        return publicar({
          recipient_type: 'group',
          to: aviso.grupo_externo_id,
          type: 'text',
          text: { body: aviso.texto },
        });
      }
      if (aviso.destinatarios.length === 0) {
        throw new Error('Nadie del equipo tiene número y consentimiento para avisos directos.');
      }
      const ids: string[] = [];
      for (const numero of aviso.destinatarios) {
        ids.push(
          await publicar({
            recipient_type: 'individual',
            to: numero.replace(/^\+/, ''),
            type: 'text',
            text: { body: aviso.texto },
          }),
        );
      }
      return ids[0]!;
    },
  };
}

/** Elige el proveedor para un aviso según el modo del servidor y el proveedor del equipo. */
export function proveedorPara(config: Config, aviso: AvisoParaEnviar): ProveedorWhatsApp {
  if (config.WHATSAPP_PROVIDER !== 'real' || aviso.proveedor === 'simulado')
    return proveedorSimulado;
  return proveedorCloudApi(
    config.WHATSAPP_TOKEN!,
    config.WHATSAPP_PHONE_ID!,
    config.WHATSAPP_API_URL,
  );
}

/**
 * Entrega una lista de avisos que la base ya dejó «enviando» y registra el resultado de cada uno.
 * Un fallo de un aviso no detiene a los demás.
 */
export async function entregar(
  db: Ejecutor,
  config: Config,
  avisos: AvisoParaEnviar[],
  elegir: (a: AvisoParaEnviar) => ProveedorWhatsApp = (a) => proveedorPara(config, a),
): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;
  for (const aviso of avisos) {
    try {
      const id = await elegir(aviso).enviar(aviso);
      await repo.resultadoEnvio(db, aviso.id, true, id, null);
      enviados++;
    } catch (e) {
      await repo.resultadoEnvio(
        db,
        aviso.id,
        false,
        null,
        e instanceof Error ? e.message : String(e),
      );
      fallidos++;
    }
  }
  return { enviados, fallidos };
}
