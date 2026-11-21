/**
 * Prueba real de WhatsApp con el número de pruebas de Meta (DEC-WA-2).
 *
 *   pnpm --filter @nexo/api wa:probar +5215512345678 [+52…]
 *   (o sin argumentos, con WHATSAPP_NUMERO_PRUEBA=+52… en apps/api/.env)
 *
 * Lee `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` (y opcionalmente `WHATSAPP_PLANTILLA`,
 * `WHATSAPP_PLANTILLA_IDIOMA`, `WHATSAPP_API_URL`) de `apps/api/.env`. A cada número le manda:
 *   1. la plantilla (por defecto `hello_world`, que siempre se puede enviar), y
 *   2. un aviso de Nexo con el mismo proveedor que usa la app (texto y, si Meta lo rechaza por estar
 *      fuera de la ventana de 24 h, otra vez la plantilla).
 * El número de pruebas solo entrega a destinatarios dados de alta en Meta for Developers
 * (WhatsApp → Configuración de la API → «Para»), hasta 5.
 */
import { randomUUID } from 'node:crypto';
import { proveedorCloudApi } from '../src/whatsapp/proveedor';

const numeros = [...process.argv.slice(2), ...(process.env.WHATSAPP_NUMERO_PRUEBA ?? '').split(',')]
  .map((a) => a.trim().replace(/[\s-]/g, ''))
  .filter((a) => /^\+?\d{8,15}$/.test(a));
const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_ID: phoneId } = process.env;

if (numeros.length === 0) {
  console.error(
    'Uso: pnpm --filter @nexo/api wa:probar +5215512345678 [+52…] (o WHATSAPP_NUMERO_PRUEBA en apps/api/.env)',
  );
  process.exit(2);
}
if (!token || !phoneId) {
  console.error(
    'Faltan WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en apps/api/.env (ver docs/operacion.md §10).',
  );
  process.exit(2);
}

const graph = process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0';
const plantilla = process.env.WHATSAPP_PLANTILLA ?? 'hello_world';
const idioma = process.env.WHATSAPP_PLANTILLA_IDIOMA ?? 'en_US';
const proveedor = proveedorCloudApi({ token, phoneId, graph, plantilla, idioma });

const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
let fallos = 0;
console.log(`Número de envío (phone_number_id): ${phoneId} · plantilla: ${plantilla} (${idioma})`);
for (const numero of numeros) {
  const aviso = {
    id: randomUUID(),
    equipo_id: randomUUID(),
    proveedor: 'cloud_api_directo' as const,
    grupo_externo_id: null,
    destinatarios: [numero.startsWith('+') ? numero : `+${numero}`],
  };
  console.log(`\n→ ${aviso.destinatarios[0]}`);
  // 1. La plantilla, que Meta acepta aunque la persona no haya escrito antes al número.
  try {
    const r = await fetch(`${graph}/${phoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: aviso.destinatarios[0]!.replace(/^\+/, ''),
        type: 'template',
        template: { name: plantilla, language: { code: idioma } },
      }),
    });
    const d = (await r.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!r.ok) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
    console.log(`  ✓ plantilla «${plantilla}» enviada · id ${d.messages?.[0]?.id}`);
  } catch (e) {
    fallos++;
    console.log(`  ✗ plantilla: ${e instanceof Error ? e.message : String(e)}`);
  }
  // 2. Un aviso de Nexo por el mismo camino que la app.
  try {
    const id = await proveedor.enviar({
      ...aviso,
      texto: `📅 Prueba de Nexo (${hora}): si lees esto, la conexión con WhatsApp funciona.`,
    });
    console.log(`  ✓ aviso de Nexo enviado · id ${id}`);
  } catch (e) {
    fallos++;
    console.log(`  ✗ aviso de Nexo: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(fallos === 0 ? 0 : 1);
