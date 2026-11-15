import { puede, type Accion, type ContextoPermiso, type RolEquipo } from '@nexo/shared';
import type { Ejecutor } from '../db/conexion';
import { ErrorNexo } from '../errores';

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
 * Quien no pertenece recibe 404, igual que si el equipo no existiera, para no revelar equipos ajenos.
 * Un invitado cuyo acceso caducó recibe 403 `acceso_caducado` (pantalla FALT-02).
 */
export async function contextoEquipo(
  db: Ejecutor,
  usuarioId: string,
  equipoId: string,
): Promise<ContextoEquipo> {
  const fila = await db
    .selectFrom('membresias as m')
    .innerJoin('equipos as e', 'e.id', 'm.equipo_id')
    .select(['m.id', 'm.rol', 'm.caduca_en', 'e.nombre', 'e.estado', 'e.max_miembros'])
    .where('m.equipo_id', '=', equipoId)
    .where('m.usuario_id', '=', usuarioId)
    .where('m.estado', '=', 'activa')
    .executeTakeFirst();
  if (!fila) throw new ErrorNexo(404, 'equipo_no_encontrado', 'No encontramos ese equipo.');
  if (fila.rol === 'invitado' && fila.caduca_en && fila.caduca_en < new Date()) {
    throw new ErrorNexo(403, 'acceso_caducado', 'Tu acceso como invitado a este equipo terminó.');
  }
  return {
    equipoId,
    usuarioId,
    membresiaId: fila.id,
    rol: fila.rol,
    equipo: { nombre: fila.nombre, estado: fila.estado, max_miembros: fila.max_miembros },
  };
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
