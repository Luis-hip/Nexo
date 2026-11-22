import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { llamarProceso } from './procesos';

/** Rol de soporte (docs/15): cada función llama a un `proc_soporte_*` de la migración 0040. */

const fecha = z.string();
const esquemaCuenta = z.object({
  id: z.string(),
  nombre: z.string(),
  correo: z.string(),
  creada_en: fecha,
  correo_verificado: z.boolean(),
  bloqueada_hasta: fecha.nullable(),
  intentos_fallidos: z.number().int(),
  dos_pasos: z.boolean(),
  google: z.boolean(),
  tiene_contrasena: z.boolean(),
  equipos_activos: z.number().int(),
  ultima_actividad_en: fecha.nullable(),
});

export const buscarCuenta = (db: Ejecutor, actor: string, correo: string) =>
  llamarProceso(
    db,
    'proc_soporte_buscar_cuenta',
    [actor, correo],
    z.object({ encontrada: z.boolean(), cuenta: esquemaCuenta.optional() }),
  );

export const desbloquear = (db: Ejecutor, actor: string, id: string) =>
  llamarProceso(db, 'proc_soporte_desbloquear', [actor, id], esquemaCuenta);

export const reenviarVerificacion = (
  db: Ejecutor,
  actor: string,
  id: string,
  tokenHash: Buffer,
  expira: Date,
) =>
  llamarProceso(
    db,
    'proc_soporte_reenviar_verificacion',
    [actor, id, tokenHash, expira.toISOString()],
    z.object({ correo: z.string(), nombre: z.string() }),
  );

export const bitacora = (db: Ejecutor, actor: string, limite: number) =>
  llamarProceso(
    db,
    'proc_soporte_bitacora',
    [actor, limite],
    z.array(
      z.object({
        id: z.string(),
        accion: z.enum(['buscar_cuenta', 'desbloquear', 'reenviar_verificacion', 'crear_soporte']),
        actor: z.object({ id: z.string(), nombre: z.string() }).nullable(),
        cuenta: z.string().nullable(),
        detalles: z.record(z.string(), z.unknown()),
        creado_en: fecha,
      }),
    ),
  );

export const plataforma = (db: Ejecutor, actor: string) =>
  llamarProceso(
    db,
    'proc_soporte_plataforma',
    [actor],
    z.object({
      cuentas: z.number().int(),
      nuevas_7_dias: z.number().int(),
      verificadas: z.number().int(),
      con_dos_pasos: z.number().int(),
      con_google: z.number().int(),
      activas_30_dias: z.number().int(),
      equipos_activos: z.number().int(),
      altas_por_semana: z.array(z.object({ semana: z.string(), altas: z.number().int() })),
    }),
  );

export const equipo = (db: Ejecutor, actor: string) =>
  llamarProceso(
    db,
    'proc_soporte_equipo_listar',
    [actor],
    z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        correo: z.string(),
        dos_pasos: z.boolean(),
        activa: z.boolean(),
        permisos: z.array(z.string()),
        creada_en: fecha,
        ultima_actividad_en: fecha.nullable(),
      }),
    ),
  );

export const crearCuenta = (
  db: Ejecutor,
  actor: string,
  datos: { correo: string; nombre: string; puede_dar_alta: boolean },
  tokenHash: Buffer,
  expira: Date,
) =>
  llamarProceso(
    db,
    'proc_soporte_crear_cuenta',
    [actor, datos.correo, datos.nombre, datos.puede_dar_alta, tokenHash, expira.toISOString()],
    z.object({ id: z.string(), correo: z.string(), nombre: z.string() }),
  );
