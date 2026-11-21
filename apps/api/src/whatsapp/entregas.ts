import type { AvisoParaEnviar, EntregaParaEnviar } from '@nexo/shared';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Ejecutor } from '../db/conexion';
import * as repo from '../repositorios/whatsapp';
import { ErrorMeta } from './proveedor';

/**
 * Spike WhatsApp 1 a 1 (docs/11_Plan_Spike_WhatsApp_1a1.md, DEC-039): envío por entregas.
 *
 * Cada aviso trae sus entregas (una por persona, o una al grupo). Por persona, el despachador
 * decide según el formato y la ventana de 24 h (plan §5.2):
 *  - bajo demanda con la ventana abierta → texto completo;
 *  - bajo demanda sin ventana → plantilla corta `nx_aviso_ver` y la entrega queda esperando a
 *    que la persona responda (un solo aviso corto cada 12 h, P-8);
 *  - resumen con enlace → plantilla `nx_resumen_enlace` (resumen + botón a la app);
 *  - PDF → documento generado aquí con `pdf-lib` y plantilla `nx_reporte_pdf`.
 */

export const PLANTILLAS_WA = {
  aviso: 'nx_aviso_ver',
  resumen: 'nx_resumen_enlace',
  pdf: 'nx_reporte_pdf',
} as const;
const IDIOMA = 'es_MX';

/** Componentes de una plantilla tal como los pide la API Cloud. */
export type Componente =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'header';
      parameters: { type: 'document'; document: { id: string; filename: string } }[];
    }
  | {
      type: 'button';
      sub_type: 'url' | 'quick_reply';
      index: string;
      parameters: ({ type: 'text'; text: string } | { type: 'payload'; payload: string })[];
    };

/** Canal hacia WhatsApp: real (API Cloud) o simulado. */
export interface CanalWhatsApp {
  readonly real: boolean;
  texto(numero: string, texto: string, ventanaAbierta: boolean): Promise<string>;
  plantilla(numero: string, nombre: string, componentes: Componente[]): Promise<string>;
  grupo(grupoId: string, texto: string): Promise<string>;
  subirPdf(pdf: Uint8Array, nombre: string): Promise<string>;
}

/**
 * Simulado (plan §5.4): imita las reglas de Meta. El texto libre fuera de la ventana de 24 h se
 * rechaza, igual que la API real (que lo acepta y lo descarta después, DEC-WA-2).
 */
export function canalSimulado(): CanalWhatsApp {
  const id = () => `sim-${randomUUID()}`;
  return {
    real: false,
    async texto(_n, _t, ventanaAbierta) {
      if (!ventanaAbierta) {
        throw new ErrorMeta(
          '(#131047) Fuera de la ventana de 24 h: hace falta una plantilla.',
          131047,
        );
      }
      return id();
    },
    async plantilla() {
      return id();
    },
    async grupo() {
      return id();
    },
    async subirPdf() {
      return `sim-medio-${randomUUID()}`;
    },
  };
}

/** API Cloud de Meta. */
export function canalCloud(o: { token: string; phoneId: string; graph: string }): CanalWhatsApp {
  const publicar = async (cuerpo: object) => {
    const r = await fetch(`${o.graph}/${encodeURIComponent(o.phoneId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = (await r.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    } | null;
    if (!r.ok || !d?.messages?.[0]?.id) {
      throw new ErrorMeta(d?.error?.message ?? `Meta respondió ${r.status}`, d?.error?.code);
    }
    return d.messages[0].id;
  };
  const a = (n: string) => n.replace(/^\+/, '');
  return {
    real: true,
    texto: (numero, texto) =>
      publicar({
        recipient_type: 'individual',
        to: a(numero),
        type: 'text',
        text: { body: texto },
      }),
    plantilla: (numero, name, components) =>
      publicar({
        recipient_type: 'individual',
        to: a(numero),
        type: 'template',
        template: { name, language: { code: IDIOMA }, components },
      }),
    grupo: (grupoId, texto) =>
      publicar({ recipient_type: 'group', to: grupoId, type: 'text', text: { body: texto } }),
    async subirPdf(pdf, nombre) {
      const forma = new FormData();
      forma.append('messaging_product', 'whatsapp');
      forma.append('type', 'application/pdf');
      forma.append('file', new Blob([Buffer.from(pdf)], { type: 'application/pdf' }), nombre);
      const r = await fetch(`${o.graph}/${encodeURIComponent(o.phoneId)}/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${o.token}` },
        body: forma,
        signal: AbortSignal.timeout(30_000),
      });
      const d = (await r.json().catch(() => null)) as {
        id?: string;
        error?: { message?: string };
      } | null;
      if (!r.ok || !d?.id)
        throw new ErrorMeta(d?.error?.message ?? `Meta respondió ${r.status}`, undefined);
      return d.id;
    },
  };
}

/** Real solo con `WHATSAPP_PROVIDER=real` y un aviso que no sea del modo simulado. */
export function canalPara(
  config: Config,
  aviso: Pick<AvisoParaEnviar, 'proveedor'>,
): CanalWhatsApp {
  if (config.WHATSAPP_PROVIDER !== 'real' || aviso.proveedor === 'simulado') return canalSimulado();
  return canalCloud({
    token: config.WHATSAPP_TOKEN!,
    phoneId: config.WHATSAPP_PHONE_ID!,
    graph: config.WHATSAPP_API_URL,
  });
}

/** Una variable de plantilla: una línea, sin espacios repetidos (reglas de Meta). */
export const enLinea = (t: string, max = 200) =>
  t
    .replace(/\s*\n\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);

/** PDF de una página (o las que hagan falta) con el contenido del aviso. */
export async function generarPdf(titulo: string, contenido: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  // Helvetica estándar solo tiene Latin-1: se quitan emojis y símbolos fuera de él.
  const limpio = (t: string) => t.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '').replace(/–|—/g, '-');
  const lineas = limpio(contenido)
    .split('\n')
    .flatMap((l) => (l.match(/.{1,90}(\s|$)|\S+/g) ?? ['']).map((x) => x.trimEnd()));
  let pagina = doc.addPage([595, 842]);
  let y = 790;
  pagina.drawText(limpio(titulo), { x: 50, y, size: 16, font: negrita });
  y -= 30;
  for (const l of lineas) {
    if (y < 60) {
      pagina = doc.addPage([595, 842]);
      y = 790;
    }
    pagina.drawText(l, { x: 50, y, size: 11, font: fuente });
    y -= 16;
  }
  return doc.save();
}

interface Contexto {
  appUrl: string;
  /** Números que ya recibieron un aviso corto en este mismo envío (P-8 dentro de un lote). */
  avisados: Set<string>;
}

/** Envía UNA entrega a una persona según su formato y su ventana (plan §5.2). */
async function aPersona(
  canal: CanalWhatsApp,
  aviso: AvisoParaEnviar,
  x: EntregaParaEnviar,
  ctx: Contexto,
): Promise<object> {
  if (!x.numero) throw new Error('La persona ya no tiene número de WhatsApp.');
  const contenido = x.contenido ?? aviso.texto;
  const personal = !aviso.equipo_id;
  if (x.formato === 'bajo_demanda') {
    if (x.ventana_abierta) {
      return { ok: true, proveedor_id: await canal.texto(x.numero, contenido, true) };
    }
    // P-8: si ya hay un aviso corto sin responder, solo se espera (no se manda otro).
    if (x.aviso_corto_reciente || ctx.avisados.has(x.numero))
      return { ok: true, pendiente_ventana: true };
    const variables = { '1': personal ? 'un reporte nuevo' : 'una actualización de tu equipo' };
    const id = await canal.plantilla(x.numero, PLANTILLAS_WA.aviso, [
      { type: 'body', parameters: [{ type: 'text', text: variables['1'] }] },
    ]);
    ctx.avisados.add(x.numero);
    return {
      ok: true,
      proveedor_id: id,
      pendiente_ventana: true,
      aviso_corto: true,
      plantilla: PLANTILLAS_WA.aviso,
      variables,
    };
  }
  if (x.formato === 'pdf') {
    const fecha = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
    const nombre = `nexo-${personal ? 'reporte' : 'aviso'}-${fecha.replace(/\//g, '-')}.pdf`;
    const medio = await canal.subirPdf(
      await generarPdf(personal ? 'Tu reporte de Nexo' : 'Aviso de tu equipo en Nexo', contenido),
      nombre,
    );
    const variables = { '1': x.nombre ?? 'hola', '2': fecha };
    const id = await canal.plantilla(x.numero, PLANTILLAS_WA.pdf, [
      {
        type: 'header',
        parameters: [{ type: 'document', document: { id: medio, filename: nombre } }],
      },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: variables['1'] },
          { type: 'text', text: variables['2'] },
        ],
      },
    ]);
    return { ok: true, proveedor_id: id, plantilla: PLANTILLAS_WA.pdf, variables };
  }
  // Resumen con enlace (formato 1).
  const ruta = personal ? 'app/personal/reportes' : `app/e/${aviso.equipo_id}/whatsapp/historial`;
  const variables = {
    '1': personal ? 'tu reporte' : 'tu equipo',
    '2': enLinea(contenido.split('\n')[0] ?? contenido, 180).replace(/[.\s]+$/, ''),
    boton: ruta,
  };
  const id = await canal.plantilla(x.numero, PLANTILLAS_WA.resumen, [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: variables['1'] },
        { type: 'text', text: variables['2'] },
      ],
    },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: ruta }] },
  ]);
  void ctx;
  return { ok: true, proveedor_id: id, plantilla: PLANTILLAS_WA.resumen, variables };
}

/** Envía todas las entregas de un aviso y registra cada resultado (el estado del aviso se deriva). */
export async function entregarEntregas(
  db: Ejecutor,
  config: Config,
  aviso: AvisoParaEnviar,
  canal: CanalWhatsApp = canalPara(config, aviso),
  avisados: Set<string> = new Set(),
): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;
  for (const x of aviso.entregas ?? []) {
    let resultado: object;
    try {
      if (x.destino === 'grupo') {
        if (canal.real && !aviso.grupo_externo_id)
          throw new Error('El equipo no tiene el id del grupo.');
        resultado = {
          ok: true,
          proveedor_id: await canal.grupo(aviso.grupo_externo_id ?? '', x.contenido ?? aviso.texto),
        };
      } else {
        resultado = await aPersona(canal, aviso, x, { appUrl: config.APP_URL, avisados });
      }
      enviados++;
    } catch (e) {
      resultado = { ok: false, error: e instanceof Error ? e.message : String(e) };
      fallidos++;
    }
    await repo.marcarEntrega(db, x.id, resultado);
  }
  return { enviados, fallidos };
}

/** Une los contenidos pendientes en textos de hasta 4000 caracteres. */
function enTrozos(partes: string[], max = 4000): string[] {
  const trozos: string[] = [];
  let actual = '';
  for (const p of partes) {
    const siguiente = actual ? `${actual}\n\n— — —\n\n${p}` : p;
    if (siguiente.length <= max) actual = siguiente;
    else {
      if (actual) trozos.push(actual);
      actual = p.slice(0, max);
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

/**
 * Un mensaje que la persona mandó al número de Nexo (webhook o `/dev/whatsapp/entrante`):
 * responde, entrega lo pendiente (ya con la ventana abierta) y atiende «REPORTE».
 */
export async function procesarEntrante(
  db: Ejecutor,
  config: Config,
  numero: string,
  texto: string,
  canal: CanalWhatsApp = canalPara(config, { proveedor: 'cloud_api_directo' }),
) {
  const r = await repo.registrarEntrante(db, numero, texto);
  if (!r.conocido) return { conocido: false, entregadas: 0 };
  const destino = r.numero ?? numero;
  if (r.respuesta) {
    try {
      await canal.texto(destino, r.respuesta, true);
    } catch {
      // La respuesta es cortesía: si falla, no se pierde nada.
    }
  }
  let entregadas = 0;
  const pendientes = r.entregas ?? [];
  if (pendientes.length > 0) {
    const trozos = enTrozos(pendientes.map((x) => x.contenido ?? '').filter(Boolean));
    let id: string | null = null;
    let error: string | null = null;
    try {
      for (const t of trozos) {
        const enviado = await canal.texto(destino, t, true);
        id ??= enviado;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    for (const x of pendientes) {
      await repo.entregaTrasVentana(db, x.id, error === null, id, error);
      if (error === null) entregadas++;
    }
  }
  if (r.reporte && r.usuario_id) {
    const aviso = await repo.crearReportePersonal(db, r.usuario_id);
    await entregarEntregas(db, config, aviso, canal);
  }
  return { conocido: true, verificado: r.verificado ?? false, baja: r.baja ?? false, entregadas };
}
