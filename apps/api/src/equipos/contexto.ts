import { puede, type Accion, type ContextoPermiso, type RolEquipo } from '@nexo/shared';
import type { Ejecutor } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/equipos';

/** Membresía activa de la persona en el equipo de la ruta. */
export interface ContextoEquipo {
  equipoId: string;
  usuarioId: string;
  membresiaId: string;
  rol: RolEquipo;
  equipo: { nombre: string; estado: 'activo' | 'archivado'; max_miembros: number };
}

/**
 * Comprueba en el servidor que la persona es miembro activo de **este** equipo (docs/01, 7.1).
 * Lo decide el proceso `proc_equipo_contexto`: quien no pertenece recibe 404, igual que si el
 * equipo no existiera, para no revelar equipos ajenos; un invitado cuyo acceso caducó recibe
 * 403 `acceso_caducado` (pantalla FALT-02).
 */
export async function contextoEquipo(
  db: Ejecutor,
  usuarioId: string,
  equipoId: string,
): Promise<ContextoEquipo> {
  const c = await repo.contexto(db, usuarioId, equipoId);
  return { equipoId, usuarioId, membresiaId: c.membresia_id, rol: c.rol, equipo: c.equipo };
}

/** Guardia de permisos de una ruta de equipo: 403 con el motivo en español de la matriz. */
export function requierePermiso(
  ctx: ContextoEquipo,
  accion: Accion,
  extra: Omit<ContextoPermiso, 'perfil'> = {},
): void {
  const r = puede(accion, { perfil: ctx.rol, ...extra });
  if (!r.permitido) throw new ErrorNexo(403, 'sin_permiso', r.motivo);
}

/** Un equipo archivado es de solo lectura. */
export function requiereEquipoActivo(ctx: ContextoEquipo): void {
  if (ctx.equipo.estado === 'archivado') {
    throw new ErrorNexo(403, 'equipo_archivado', 'El equipo está archivado: solo lectura.');
  }
}
