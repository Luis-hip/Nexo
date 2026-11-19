import {
  aCsv,
  COLUMNAS_EXPORTACION,
  esquemaAsistencia,
  esquemaConsultaActividad,
  esquemaCrearPlantilla,
  esquemaCrearReunion,
  esquemaEditarReunion,
  esquemaRangoCalendario,
  esquemaSubirArchivo,
  MAX_BYTES_ARCHIVO,
  type Accion,
  type ContextoPermiso,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/vistas';
import { esquemaId, validar } from '../validacion';

const parametrosEquipo = z.object({ equipoId: esquemaId });
const parametrosId = parametrosEquipo.extend({ id: esquemaId });
const consultaExportar = z.object({ solo_mias: z.enum(['true', 'false']).default('false') });
const consultaArchivos = z.object({ tarea_id: esquemaId.optional() });
const consultaNotificaciones = z.object({
  solo_no_leidas: z.enum(['true', 'false']).default('false'),
});

/** «Content-Disposition» que acepta nombres con acentos o espacios sin romper la cabecera. */
const adjunto = (nombre: string) =>
  `attachment; filename="${nombre.replace(/[^\w.-]+/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;

/**
 * Vistas secundarias del equipo (Fase 3.4: EQ-14 a EQ-20, NT-01). Cada ruta: sesión → membresía
 * activa en **este** equipo → permiso de la matriz; las reglas viven en los procesos de las
 * migraciones 0011 y 0012 (docs/08).
 */
export const rutasVistas: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  async function contexto(
    req: FastifyRequest,
    accion: Accion,
    escribe = false,
    extra: Omit<ContextoPermiso, 'perfil'> = {},
  ) {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(parametrosEquipo, {
      equipoId: (req.params as { equipoId?: string }).equipoId,
    });
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    requierePermiso(ctx, accion, extra);
    if (escribe) requiereEquipoActivo(ctx);
    return { actor: usuario.id, equipoId };
  }
  const idDe = (req: FastifyRequest) => validar(parametrosId, req.params).id;

  // --- Calendario y reuniones (EQ-14, EQ-15) -------------------------------------------------

  app.get('/equipos/:equipoId/calendario', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_calendario');
    const { desde, hasta } = validar(esquemaRangoCalendario, req.query);
    return repo.calendario(db, actor, equipoId, desde, hasta);
  });

  app.post('/equipos/:equipoId/reuniones', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'crear_reunion', true);
    const datos = validar(esquemaCrearReunion, req.body);
    return res.status(201).send(await repo.crearReunion(db, actor, equipoId, datos));
  });

  app.patch('/equipos/:equipoId/reuniones/:id', async (req) => {
    // Quien la creó o el líder: lo decide el proceso.
    const { actor, equipoId } = await contexto(req, 'crear_reunion', true);
    return repo.editarReunion(
      db,
      actor,
      equipoId,
      idDe(req),
      validar(esquemaEditarReunion, req.body),
    );
  });

  app.post('/equipos/:equipoId/reuniones/:id/cancelar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'crear_reunion', true);
    return repo.cancelarReunion(db, actor, equipoId, idDe(req));
  });

  app.post('/equipos/:equipoId/reuniones/:id/asistencia', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_calendario', true);
    const { respuesta } = validar(esquemaAsistencia, req.body);
    return repo.responderReunion(db, actor, equipoId, idDe(req), respuesta);
  });

  // --- Actividad (EQ-18) ---------------------------------------------------------------------

  app.get('/equipos/:equipoId/actividad', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_actividad');
    return repo.actividad(db, actor, equipoId, validar(esquemaConsultaActividad, req.query));
  });

  // --- Reportes (EQ-16, EQ-17) ---------------------------------------------------------------

  app.get('/equipos/:equipoId/reportes', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_reportes');
    return repo.reporte(db, actor, equipoId);
  });

  app.get('/equipos/:equipoId/reportes/exportar', async (req, res) => {
    const soloMias = validar(consultaExportar, req.query).solo_mias === 'true';
    // Un integrante solo exporta lo suyo (`exportar_reportes` es «propio» para él).
    const { actor, equipoId } = await contexto(req, 'exportar_reportes', false, {
      esPropio: soloMias,
    });
    const filas = await repo.exportar(db, actor, equipoId, soloMias);
    const nombre = `nexo-reporte${soloMias ? '-mis-tareas' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    return res
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', adjunto(nombre))
      .send(`\uFEFF${aCsv(COLUMNAS_EXPORTACION, filas)}`);
  });

  // --- Plantillas (EQ-20) --------------------------------------------------------------------

  app.get('/equipos/:equipoId/plantillas', async (req) => {
    const { actor, equipoId } = await contexto(req, 'usar_plantilla');
    return repo.plantillas(db, actor, equipoId);
  });

  app.post('/equipos/:equipoId/plantillas', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'crear_plantilla', true);
    const datos = validar(esquemaCrearPlantilla, req.body);
    return res.status(201).send(await repo.crearPlantilla(db, actor, equipoId, datos));
  });

  app.delete('/equipos/:equipoId/plantillas/:id', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'crear_plantilla', true);
    await repo.eliminarPlantilla(db, actor, equipoId, idDe(req));
    return res.status(204).send();
  });

  app.post('/equipos/:equipoId/plantillas/:id/usar', async (req) => {
    // Usar una de proyecto propone tareas: solo el líder (DEC-024).
    const { actor, equipoId } = await contexto(req, 'crear_tarea', true);
    return repo.usarPlantilla(db, actor, equipoId, idDe(req));
  });

  // --- Archivos (EQ-19) ----------------------------------------------------------------------

  app.get('/equipos/:equipoId/archivos', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_archivos');
    const { tarea_id } = validar(consultaArchivos, req.query);
    return repo.archivos(db, actor, equipoId, tarea_id ?? null);
  });

  app.post(
    '/equipos/:equipoId/archivos',
    // El contenido viaja en base64 (≈ 4/3 del tamaño): 5 MB caben en 8 MB de cuerpo.
    { bodyLimit: 8 * 1024 * 1024 },
    async (req, res) => {
      const { actor, equipoId } = await contexto(req, 'adjuntar_archivos', true);
      const datos = validar(esquemaSubirArchivo, req.body);
      const contenido = Buffer.from(datos.contenido_base64, 'base64');
      if (contenido.length === 0 || contenido.length > MAX_BYTES_ARCHIVO) {
        throw new ErrorNexo(
          400,
          'archivo_muy_grande',
          'El archivo debe pesar entre 1 byte y 5 MB.',
        );
      }
      const archivo = await repo.subirArchivo(db, actor, equipoId, {
        nombre: datos.nombre,
        mime: datos.mime,
        datos: contenido,
        tarea: datos.tarea_id ?? null,
      });
      return res.status(201).send(archivo);
    },
  );

  app.get('/equipos/:equipoId/archivos/:id/descarga', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'ver_archivos');
    const a = await repo.descargarArchivo(db, actor, equipoId, idDe(req));
    return res
      .header('content-type', a.mime)
      .header('content-disposition', adjunto(a.nombre))
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .send(Buffer.from(a.contenido, 'base64'));
  });

  app.delete('/equipos/:equipoId/archivos/:id', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'ver_archivos', true);
    await repo.eliminarArchivo(db, actor, equipoId, idDe(req));
    return res.status(204).send();
  });

  // --- Notificaciones de la persona (NT-01) --------------------------------------------------

  app.get('/notificaciones', async (req) => {
    const { usuario } = exigirSesion(req);
    const { solo_no_leidas } = validar(consultaNotificaciones, req.query);
    return repo.notificaciones(db, usuario.id, solo_no_leidas === 'true');
  });

  app.post('/notificaciones/leidas', async (req) => {
    const { usuario } = exigirSesion(req);
    return repo.marcarNotificacion(db, usuario.id, null);
  });

  app.post('/notificaciones/:id/leida', async (req) => {
    const { usuario } = exigirSesion(req);
    const { id } = validar(z.object({ id: esquemaId }), req.params);
    return repo.marcarNotificacion(db, usuario.id, id);
  });
};
