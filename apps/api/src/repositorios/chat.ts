import { sql } from 'kysely';
import type { BaseDatos } from '../db/conexion';
import type { TipoReaccion } from '../db/tipos';
import { ErrorNexo } from '../errores';

export interface MembresiaChat {
  id: string;
  equipo_id: string;
  rol: 'lider' | 'integrante' | 'invitado';
}

export async function obtenerMembresiaActiva(
  db: BaseDatos,
  equipoId: string,
  usuarioId: string,
): Promise<MembresiaChat> {
  const m = await db
    .selectFrom('membresias')
    .select(['id', 'equipo_id', 'rol'])
    .where('equipo_id', '=', equipoId)
    .where('usuario_id', '=', usuarioId)
    .where('estado', '=', 'activa')
    .executeTakeFirst();

  if (!m) {
    throw new ErrorNexo(403, 'sin_membresia', 'No perteneces a este equipo.');
  }
  return m;
}

export async function exigirAccesoConversacion(
  db: BaseDatos,
  conversacionId: string,
  usuarioId: string,
) {
  const conv = await db
    .selectFrom('conversaciones')
    .selectAll()
    .where('id', '=', conversacionId)
    .executeTakeFirst();

  if (!conv) {
    throw new ErrorNexo(404, 'conversacion_no_encontrada', 'La conversación no existe.');
  }

  const membresia = await obtenerMembresiaActiva(db, conv.equipo_id, usuarioId);

  if (membresia.rol === 'invitado') {
    if (conv.tipo === 'invitados') return { conv, membresia };
    if (conv.tipo === 'tarea' && conv.tarea_id) {
      const compartida = await db
        .selectFrom('tarea_compartida')
        .select(['tarea_id'])
        .where('tarea_id', '=', conv.tarea_id)
        .where('membresia_id', '=', membresia.id)
        .executeTakeFirst();
      if (compartida) return { conv, membresia };
    }
    throw new ErrorNexo(403, 'acceso_denegado', 'No tienes acceso a esta conversación.');
  }

  if (conv.tipo === 'dm' && conv.dm_usuario_a !== usuarioId && conv.dm_usuario_b !== usuarioId) {
    throw new ErrorNexo(403, 'acceso_denegado', 'No participas en este mensaje directo.');
  }

  return { conv, membresia };
}

export async function listarConversaciones(
  db: BaseDatos,
  equipoId: string,
  usuarioId: string,
) {
  const membresia = await obtenerMembresiaActiva(db, equipoId, usuarioId);

  let query = db
    .selectFrom('conversaciones as c')
    .leftJoin('conversacion_lecturas as cl', (join) =>
      join.onRef('cl.conversacion_id', '=', 'c.id').on('cl.usuario_id', '=', usuarioId),
    )
    .select([
      'c.id',
      'c.equipo_id',
      'c.tipo',
      'c.nombre',
      'c.tarea_id',
      'c.dm_usuario_a',
      'c.dm_usuario_b',
      'c.creada_en',
      sql<string>`coalesce(cl.ultimo_leido_seq, 0)`.as('ultimo_leido_seq'),
      sql<boolean>`coalesce(cl.fijada, false)`.as('fijada_usuario'),
    ])
    .where('c.equipo_id', '=', equipoId);

  if (membresia.rol === 'invitado') {
    query = query.where((eb) =>
      eb.or([
        eb('c.tipo', '=', 'invitados'),
        eb.and([
          eb('c.tipo', '=', 'tarea'),
          eb.exists(
            eb
              .selectFrom('tarea_compartida as tc')
              .select('tc.tarea_id')
              .whereRef('tc.tarea_id', '=', 'c.tarea_id')
              .where('tc.membresia_id', '=', membresia.id),
          ),
        ]),
      ]),
    );
  } else {
    query = query.where((eb) =>
      eb.or([
        eb('c.tipo', 'in', ['equipo', 'tarea', 'invitados']),
        eb.and([
          eb('c.tipo', '=', 'dm'),
          eb.or([
            eb('c.dm_usuario_a', '=', usuarioId),
            eb('c.dm_usuario_b', '=', usuarioId),
          ]),
        ]),
      ]),
    );
  }

  return query.orderBy('c.creada_en', 'asc').execute();
}

export async function crearObtenerDm(
  db: BaseDatos,
  equipoId: string,
  usuarioId: string,
  otroUsuarioId: string,
) {
  if (usuarioId === otroUsuarioId) {
    throw new ErrorNexo(400, 'dm_invalido', 'No puedes abrir un chat directo contigo mismo.');
  }
  const m1 = await obtenerMembresiaActiva(db, equipoId, usuarioId);
  const m2 = await obtenerMembresiaActiva(db, equipoId, otroUsuarioId);

  if (m1.rol === 'invitado' || m2.rol === 'invitado') {
    throw new ErrorNexo(403, 'invitado_sin_dm', 'Los invitados usan el canal de Invitados.');
  }

  const [a, b] = usuarioId < otroUsuarioId ? [usuarioId, otroUsuarioId] : [otroUsuarioId, usuarioId];

  const existente = await db
    .selectFrom('conversaciones')
    .selectAll()
    .where('equipo_id', '=', equipoId)
    .where('tipo', '=', 'dm')
    .where('dm_usuario_a', '=', a)
    .where('dm_usuario_b', '=', b)
    .executeTakeFirst();

  if (existente) return existente;

  return db
    .insertInto('conversaciones')
    .values({
      equipo_id: equipoId,
      tipo: 'dm',
      nombre: '',
      dm_usuario_a: a,
      dm_usuario_b: b,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listarMensajes(
  db: BaseDatos,
  conversacionId: string,
  usuarioId: string,
  opciones: { hiloDeId?: string | null; antesDeSeq?: number; limite?: number } = {},
) {
  await exigirAccesoConversacion(db, conversacionId, usuarioId);
  const limite = Math.min(opciones.limite ?? 50, 100);

  let q = db
    .selectFrom('mensajes as m')
    .leftJoin('usuarios as u', 'u.id', 'm.autor_id')
    .select([
      'm.id',
      'm.seq',
      'm.conversacion_id',
      'm.autor_id',
      'u.nombre as autor_nombre',
      'm.es_sistema',
      'm.texto',
      'm.hilo_de_id',
      'm.tarea_vinculada_id',
      'm.fijado',
      'm.creado_en',
      'm.editado_en',
      'm.eliminado_en',
    ])
    .where('m.conversacion_id', '=', conversacionId);

  if (opciones.hiloDeId) {
    q = q.where('m.hilo_de_id', '=', opciones.hiloDeId);
  } else {
    q = q.where('m.hilo_de_id', 'is', null);
  }

  if (opciones.antesDeSeq) {
    q = q.where('m.seq', '<', String(opciones.antesDeSeq));
  }

  const filas = await q.orderBy('m.seq', 'desc').limit(limite).execute();
  const mensajes = filas.reverse();

  if (mensajes.length === 0) return [];

  const ids = mensajes.map((m) => m.id);
  const reacciones = await db
    .selectFrom('mensaje_reacciones')
    .select(['mensaje_id', 'usuario_id', 'tipo'])
    .where('mensaje_id', 'in', ids)
    .execute();

  return mensajes.map((m) => ({
    ...m,
    texto: m.eliminado_en ? '' : m.texto,
    reacciones: reacciones.filter((r) => r.mensaje_id === m.id),
  }));
}

export async function crearMensaje(
  db: BaseDatos,
  datos: {
    conversacionId: string;
    autorId: string;
    texto: string;
    hiloDeId?: string | null;
    menciones?: string[];
    idCliente?: string | null;
  },
) {
  const { conv } = await exigirAccesoConversacion(db, datos.conversacionId, datos.autorId);

  const msg = await db
    .insertInto('mensajes')
    .values({
      conversacion_id: datos.conversacionId,
      autor_id: datos.autorId,
      texto: datos.texto.trim(),
      hilo_de_id: datos.hiloDeId ?? null,
      id_cliente: datos.idCliente ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  const mencionesUnicas = [...new Set(datos.menciones ?? [])];
  if (mencionesUnicas.length > 0) {
    await db
      .insertInto('mensaje_menciones')
      .values(mencionesUnicas.map((usuarioId) => ({ mensaje_id: msg.id, usuario_id: usuarioId })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  return { msg, conv, menciones: mencionesUnicas };
}

export async function toggleReaccion(
  db: BaseDatos,
  mensajeId: string,
  usuarioId: string,
  tipo: TipoReaccion,
) {
  const msg = await db
    .selectFrom('mensajes')
    .select(['id', 'conversacion_id'])
    .where('id', '=', mensajeId)
    .executeTakeFirst();

  if (!msg) throw new ErrorNexo(404, 'mensaje_no_encontrado', 'El mensaje no existe.');
  await exigirAccesoConversacion(db, msg.conversacion_id, usuarioId);

  const yaExiste = await db
    .selectFrom('mensaje_reacciones')
    .select(['mensaje_id'])
    .where('mensaje_id', '=', mensajeId)
    .where('usuario_id', '=', usuarioId)
    .where('tipo', '=', tipo)
    .executeTakeFirst();

  if (yaExiste) {
    await db
      .deleteFrom('mensaje_reacciones')
      .where('mensaje_id', '=', mensajeId)
      .where('usuario_id', '=', usuarioId)
      .where('tipo', '=', tipo)
      .execute();
    return { conversacionId: msg.conversacion_id, agregada: false };
  }

  await db
    .insertInto('mensaje_reacciones')
    .values({ mensaje_id: mensajeId, usuario_id: usuarioId, tipo })
    .execute();
  return { conversacionId: msg.conversacion_id, agregada: true };
}

export async function marcarLeida(
  db: BaseDatos,
  conversacionId: string,
  usuarioId: string,
  ultimoLeidoSeq: number,
) {
  await exigirAccesoConversacion(db, conversacionId, usuarioId);

  await db
    .insertInto('conversacion_lecturas')
    .values({
      conversacion_id: conversacionId,
      usuario_id: usuarioId,
      ultimo_leido_seq: String(ultimoLeidoSeq),
    })
    .onConflict((oc) =>
      oc.columns(['conversacion_id', 'usuario_id']).doUpdateSet({
        ultimo_leido_seq: sql`GREATEST(conversacion_lecturas.ultimo_leido_seq, ${ultimoLeidoSeq})`,
      }),
    )
    .execute();
}

export async function buscarMensajes(
  db: BaseDatos,
  equipoId: string,
  usuarioId: string,
  consulta: string,
) {
  const convs = await listarConversaciones(db, equipoId, usuarioId);
  const convIds = convs.map((c) => c.id);
  if (convIds.length === 0 || !consulta.trim()) return [];

  return db
    .selectFrom('mensajes as m')
    .innerJoin('conversaciones as c', 'c.id', 'm.conversacion_id')
    .leftJoin('usuarios as u', 'u.id', 'm.autor_id')
    .select([
      'm.id',
      'm.seq',
      'm.conversacion_id',
      'c.tipo as conversacion_tipo',
      'c.nombre as conversacion_nombre',
      'm.texto',
      'm.creado_en',
      'u.nombre as autor_nombre',
    ])
    .where('m.conversacion_id', 'in', convIds)
    .where('m.eliminado_en', 'is', null)
    .where(sql<boolean>`m.busqueda_tsv @@ plainto_tsquery('spanish', ${consulta.trim()})`)
    .orderBy('m.creado_en', 'desc')
    .limit(30)
    .execute();
}

export async function fijarMensaje(
  db: BaseDatos,
  mensajeId: string,
  usuarioId: string,
  fijado: boolean,
) {
  const msg = await db
    .selectFrom('mensajes')
    .select(['id', 'conversacion_id'])
    .where('id', '=', mensajeId)
    .executeTakeFirst();

  if (!msg) throw new ErrorNexo(404, 'mensaje_no_encontrado', 'El mensaje no existe.');
  const { membresia } = await exigirAccesoConversacion(db, msg.conversacion_id, usuarioId);

  if (membresia.rol !== 'lider') {
    throw new ErrorNexo(403, 'solo_lider', 'Solo el líder del equipo puede fijar mensajes.');
  }

  return db
    .updateTable('mensajes')
    .set({ fijado })
    .where('id', '=', mensajeId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function eliminarMensaje(db: BaseDatos, mensajeId: string, usuarioId: string) {
  const msg = await db
    .selectFrom('mensajes')
    .select(['id', 'conversacion_id', 'autor_id'])
    .where('id', '=', mensajeId)
    .executeTakeFirst();

  if (!msg) throw new ErrorNexo(404, 'mensaje_no_encontrado', 'El mensaje no existe.');
  const { membresia } = await exigirAccesoConversacion(db, msg.conversacion_id, usuarioId);

  if (msg.autor_id !== usuarioId && membresia.rol !== 'lider') {
    throw new ErrorNexo(403, 'sin_permiso', 'Solo el autor o el líder pueden eliminar este mensaje.');
  }

  return db
    .updateTable('mensajes')
    .set({ eliminado_en: new Date(), eliminado_por: usuarioId })
    .where('id', '=', mensajeId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function convertirMensajeEnTarea(
  db: BaseDatos,
  mensajeId: string,
  usuarioId: string,
  tituloOpcional?: string,
) {
  const msg = await db
    .selectFrom('mensajes')
    .select(['id', 'conversacion_id', 'texto', 'tarea_vinculada_id', 'eliminado_en'])
    .where('id', '=', mensajeId)
    .executeTakeFirst();

  if (!msg || msg.eliminado_en) {
    throw new ErrorNexo(404, 'mensaje_no_encontrado', 'El mensaje no existe.');
  }
  if (msg.tarea_vinculada_id) {
    throw new ErrorNexo(409, 'ya_convertido', 'Este mensaje ya fue convertido en tarea.');
  }

  const { conv, membresia } = await exigirAccesoConversacion(db, msg.conversacion_id, usuarioId);
  if (membresia.rol === 'invitado') {
    throw new ErrorNexo(403, 'sin_permiso', 'Los invitados no pueden crear tareas en el equipo.');
  }

  const titulo = (tituloOpcional?.trim() || msg.texto.trim()).slice(0, 140);
  if (!titulo) {
    throw new ErrorNexo(400, 'titulo_vacio', 'El mensaje no tiene texto para crear una tarea.');
  }

  return db.transaction().execute(async (trx) => {
    const ultimo = await trx
      .selectFrom('tareas')
      .select(sql<number>`coalesce(max(codigo), 0)`.as('max_codigo'))
      .where('equipo_id', '=', conv.equipo_id)
      .executeTakeFirstOrThrow();

    const tarea = await trx
      .insertInto('tareas')
      .values({
        equipo_id: conv.equipo_id,
        codigo: Number(ultimo.max_codigo) + 1,
        titulo,
        descripcion: msg.texto,
        estado: 'propuesta',
        origen: 'propuesta',
        proponente_id: usuarioId,
        creada_por: usuarioId,
        mensaje_origen_id: msg.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const mensajeActualizado = await trx
      .updateTable('mensajes')
      .set({ tarea_vinculada_id: tarea.id })
      .where('id', '=', msg.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return { tarea, mensaje: mensajeActualizado, conversacionId: conv.id };
  });
}
