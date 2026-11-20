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

/** Error de la API Graph con su código (p. ej. 131047: fuera de la ventana de 24 h). */
export class ErrorMeta extends Error {
  constructor(
    mensaje: string,
    readonly codigo: number | undefined,
  ) {
    super(mensaje);
  }
}

/** Códigos de Meta que significan «fuera de la ventana de 24 h: usa una plantilla». */
const FUERA_DE_VENTANA = new Set([131047, 131051, 470]);

export interface OpcionesCloudApi {
  token: string;
  phoneId: string;
  graph?: string;
  /** Plantilla aprobada para cuando Meta rechaza el texto libre (DEC-WA-2). */
  plantilla?: string;
  idioma?: string;
}

/**
 * Proveedor de la API Cloud de Meta (grupos o directo, según el aviso). En directo, Meta solo acepta
 * texto libre dentro de la ventana de 24 h desde el último mensaje de la persona; fuera de ella se
 * manda la plantilla configurada (`hello_world` no lleva variables; cualquier otra recibe el texto
 * del aviso como `{{1}}`).
 */
export function proveedorCloudApi(o: OpcionesCloudApi): ProveedorWhatsApp {
  const graph = o.graph ?? 'https://graph.facebook.com/v21.0';
  const publicar = async (cuerpo: object) => {
    const r = await fetch(`${graph}/${encodeURIComponent(o.phoneId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
      signal: AbortSignal.timeout(15_000),
    });
    const datos = (await r.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    } | null;
    if (!r.ok || !datos?.messages?.[0]?.id) {
      throw new ErrorMeta(
        datos?.error?.message ?? `Meta respondió ${r.status}`,
        datos?.error?.code,
      );
    }
    return datos.messages[0].id;
  };
  const plantilla = (to: string, texto: string) => {
    const nombre = o.plantilla ?? 'hello_world';
    return publicar({
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: nombre,
        language: { code: o.idioma ?? 'en_US' },
        ...(nombre === 'hello_world'
          ? {}
          : { components: [{ type: 'body', parameters: [{ type: 'text', text: texto }] }] }),
      },
    });
  };
  /** Un mensaje directo: texto y, si Meta lo rechaza por la ventana de 24 h, la plantilla. */
  const directo = async (numero: string, texto: string) => {
    const to = numero.replace(/^\+/, '');
    try {
      return await publicar({
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: texto },
      });
    } catch (e) {
      if (e instanceof ErrorMeta && e.codigo !== undefined && FUERA_DE_VENTANA.has(e.codigo)) {
        return plantilla(to, texto);
      }
      throw e;
    }
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
      // Un destinatario que falla no impide que los demás lo reciban; el aviso falla solo si nadie.
      const ids: string[] = [];
      const errores: string[] = [];
      for (const numero of aviso.destinatarios) {
        try {
          ids.push(await directo(numero, aviso.texto));
        } catch (e) {
          errores.push(`${numero}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (ids.length === 0) throw new Error(errores.join(' · '));
      return ids[0]!;
    },
  };
}

/** Elige el proveedor para un aviso según el modo del servidor y el proveedor del equipo. */
export function proveedorPara(config: Config, aviso: AvisoParaEnviar): ProveedorWhatsApp {
  if (config.WHATSAPP_PROVIDER !== 'real' || aviso.proveedor === 'simulado')
    return proveedorSimulado;
  return proveedorCloudApi({
    token: config.WHATSAPP_TOKEN!,
    phoneId: config.WHATSAPP_PHONE_ID!,
    graph: config.WHATSAPP_API_URL,
    plantilla: config.WHATSAPP_PLANTILLA,
    idioma: config.WHATSAPP_PLANTILLA_IDIOMA,
  });
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
