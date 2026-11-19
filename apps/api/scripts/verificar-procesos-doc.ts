import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RUTA_DB } from './comun';

/**
 * Control de docs/08_Procesos_BD.md (DEC-025): falla si una migración crea un proceso
 * `proc_*` que no tiene su apartado en el documento, o si el documento describe un proceso
 * que ninguna migración crea. No necesita base de datos: solo lee archivos.
 */
const DOC = resolve(RUTA_DB, '..', '..', '..', 'docs', '08_Procesos_BD.md');
const CREA = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(proc_[a-z0-9_]+)/gi;
const BORRA = /drop\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(proc_[a-z0-9_]+)/gi;
const APARTADO = /^###\s+(proc_[a-z0-9_]+)\s*$/gm;

const dirMigraciones = resolve(RUTA_DB, 'migrations');
const archivos = (await readdir(dirMigraciones)).filter((a) => a.endsWith('.sql')).sort();

const enMigraciones = new Map<string, string>();
for (const archivo of archivos) {
  const sql = await readFile(resolve(dirMigraciones, archivo), 'utf8');
  // Solo cuenta la subida: la bajada borra lo que la propia migración creó.
  const subida = sql.split(/^--\s*Down Migration/im)[0] ?? sql;
  for (const m of subida.matchAll(CREA)) {
    if (m[1]) enMigraciones.set(m[1].toLowerCase(), archivo);
  }
  for (const m of subida.matchAll(BORRA)) {
    if (m[1]) enMigraciones.delete(m[1].toLowerCase());
  }
}

const doc = await readFile(DOC, 'utf8');
const enDoc = new Set([...doc.matchAll(APARTADO)].map((m) => (m[1] ?? '').toLowerCase()));
// La plantilla del documento usa un nombre de ejemplo.
enDoc.delete('proc_dominio_accion');

const sinDocumentar = [...enMigraciones].filter(([nombre]) => !enDoc.has(nombre));
const sinMigracion = [...enDoc].filter((nombre) => !enMigraciones.has(nombre));
const sinIndice = [...enMigraciones.keys()].filter((nombre) => !doc.includes(`| \`${nombre}\` |`));

if (sinDocumentar.length || sinMigracion.length || sinIndice.length) {
  for (const [nombre, archivo] of sinDocumentar) {
    console.error(
      `Falta el apartado «### ${nombre}» en docs/08_Procesos_BD.md (lo crea ${archivo}).`,
    );
  }
  for (const nombre of sinMigracion) {
    console.error(`docs/08_Procesos_BD.md describe ${nombre}, pero ninguna migración lo crea.`);
  }
  for (const nombre of sinIndice) {
    console.error(`Falta ${nombre} en la tabla índice de docs/08_Procesos_BD.md (sección 4).`);
  }
  process.exit(1);
}
console.log(
  `${enMigraciones.size} procesos de la BD, todos documentados en docs/08_Procesos_BD.md.`,
);
