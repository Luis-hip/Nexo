import {
  esquemaArchivar,
  esquemaConfigurarEquipo,
  esquemaGestionarInvitado,
  esquemaResponderTransferencia,
  esquemaTransferir,
  esquemaVotoEleccion,
  type Accion,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import * as repo from '../repositorios/liderazgo';
import { esquemaId, validar } from '../validacion';

const parametrosEquipo = z.object({ equipoId: esquemaId });
const parametrosId = parametrosEquipo.extend({ id: esquemaId });
const parametrosMembresia = parametrosEquipo.extend({ membresiaId: esquemaId });

/**
 * Liderazgo y administración del equipo (Fase 3.5: AD-04 a AD-12). Cada ruta: sesión → membresía
 * activa en **este** equipo → permiso de la matriz. Las reglas viven en los procesos de la 0010
 * (docs/08), que vuelven a comprobarlo todo.
 */
export const rutasLiderazgo: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  async function contexto(req: FastifyRequest, accion: Accion, escribe = false) {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(parametrosEquipo, {
      equipoId: (req.params as { equipoId?: string }).equipoId,
    });
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    requierePermiso(ctx, accion);
    if (escribe) requiereEquipoActivo(ctx);
    return { actor: usuario.id, equipoId };
  }
  const idDe = (req: FastifyRequest) => validar(parametrosId, req.params).id;
  const membresiaDe = (req: FastifyRequest) => validar(parametrosMembresia, req.params).membresiaId;

  // --- Liderazgo (AD-07 a AD-09, FALT-07) ----------------------------------------------------

  app.get('/equipos/:equipoId/liderazgo', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_miembros');
    // Si un plazo venció y el temporizador aún no pasó, el resultado se ve ya.
    await repo.vencerElecciones(db);
    return repo.obtener(db, actor, equipoId);
  });

  app.post('/equipos/:equipoId/liderazgo/transferencias', async (req) => {
    const { actor, equipoId } = await contexto(req, 'transferir_liderazgo', true);
    const { a_id, saldra } = validar(esquemaTransferir, req.body);
    return repo.transferir(db, actor, equipoId, a_id, saldra);
  });

  app.post('/equipos/:equipoId/liderazgo/transferencias/:id/respuesta', async (req) => {
    // Responde la persona propuesta (un integrante): lo comprueba el proceso.
    const { actor, equipoId } = await contexto(req, 'ver_miembros', true);
    const { acepta } = validar(esquemaResponderTransferencia, req.body);
    return repo.responder(db, actor, equipoId, idDe(req), acepta);
  });

  app.post('/equipos/:equipoId/liderazgo/transferencias/:id/cancelar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'transferir_liderazgo');
    return repo.cancelar(db, actor, equipoId, idDe(req));
  });

  app.post('/equipos/:equipoId/liderazgo/eleccion', async (req) => {
    const { actor, equipoId } = await contexto(req, 'transferir_liderazgo', true);
    return repo.convocar(db, actor, equipoId);
  });

  app.post('/equipos/:equipoId/liderazgo/eleccion/:id/voto', async (req) => {
    const { actor, equipoId } = await contexto(req, 'votar_eleccion', true);
    const { candidato_id } = validar(esquemaVotoEleccion, req.body);
    return repo.votar(db, actor, equipoId, idDe(req), candidato_id);
  });

  // --- Membresías (AD-05, AD-10, AD-11) ------------------------------------------------------

  app.post('/equipos/:equipoId/salir', async (req) => {
    const { actor, equipoId } = await contexto(req, 'salir_equipo');
    return repo.salir(db, actor, equipoId);
  });

  app.post('/equipos/:equipoId/miembros/:membresiaId/expulsar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'expulsar_miembros', true);
    return repo.expulsar(db, actor, equipoId, membresiaDe(req));
  });

  app.post('/equipos/:equipoId/miembros/:membresiaId/invitado', async (req) => {
    const { actor, equipoId } = await contexto(req, 'convertir_invitado', true);
    const datos = validar(esquemaGestionarInvitado, req.body);
    return repo.gestionarInvitado(db, actor, equipoId, membresiaDe(req), datos);
  });

  // --- Configuración y archivo (AD-06, AD-12) ------------------------------------------------

  app.get('/equipos/:equipoId/configuracion', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_miembros');
    return repo.configuracion(db, actor, equipoId);
  });

  app.patch('/equipos/:equipoId/configuracion', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_equipo', true);
    return repo.configurar(db, actor, equipoId, validar(esquemaConfigurarEquipo, req.body));
  });

  app.post('/equipos/:equipoId/archivar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'archivar_equipo');
    const { archivar } = validar(esquemaArchivar, req.body);
    return repo.archivar(db, actor, equipoId, archivar);
  });
};
