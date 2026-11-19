import type { FastifyInstance, InjectOptions } from 'fastify';
import { crearApp } from '../app';
import { cargarConfig } from '../config';
import { correoEnMemoria, type MensajeCorreo } from '../correo';
import { crearBaseDatos, type BaseDatos } from '../db/conexion';
import { COOKIE_SESION } from '../sesiones';

/** Las pruebas de integración necesitan una BD migrada y sembrada (`pnpm db:reset`; la CI lo hace). */
export const DATABASE_URL = process.env.DATABASE_URL;

/** Equipo y personas de la semilla (db/seed/semilla.sql). */
export const SEMILLA = {
  equipo: '10000000-0000-4000-8000-000000000001',
  valeria: 'valeria@nexo.mx', // líder del Equipo Nexo
  carlos: 'carlos@nexo.mx', // integrante
  daniela: 'daniela@nexo.mx', // integrante
  emilio: 'emilio@nexo.mx', // integrante
  ivan: 'ivan@nexo.mx', // integrante
  mariana: 'mariana.lozano@universidad.mx', // invitada (ve T-01 y T-05)
  jorge: 'jorge@salas-consultores.mx', // invitado
  paola: 'paola.reyes@nexo.mx', // sin equipo
} as const;

export type Cookies = Record<string, string>;

export interface Entorno {
  db: BaseDatos;
  app: FastifyInstance;
  /** Inicia sesión con el acceso de desarrollo y devuelve la cookie. */
  entrar: (email: string) => Promise<Cookies>;
  /** Petición JSON con sesión. */
  pedir: (
    cookies: Cookies | null,
    method: NonNullable<InjectOptions['method']>,
    url: string,
    payload?: object,
    // justificado: cuerpo JSON arbitrario; cada prueba afirma su forma.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ estado: number; cuerpo: any }>;
  /** Correos que la API habría enviado (Fase 5). */
  correos: MensajeCorreo[];
  cerrar: () => Promise<void>;
}

export async function crearEntorno(): Promise<Entorno> {
  const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true' });
  const db = crearBaseDatos(config.DATABASE_URL);
  const correo = correoEnMemoria();
  const app = await crearApp(config, db, { correo });
  return {
    db,
    app,
    correos: correo.enviados,
    async entrar(email) {
      const r = await app.inject({ method: 'POST', url: '/dev/login', payload: { email } });
      const cookie = r.cookies.find((c) => c.name === COOKIE_SESION);
      if (!cookie) throw new Error(`No se pudo entrar como ${email}: ${r.body}`);
      return { [COOKIE_SESION]: cookie.value };
    },
    async pedir(cookies, method, url, payload) {
      const r = await app.inject({ method, url, cookies: cookies ?? undefined, payload });
      return { estado: r.statusCode, cuerpo: r.body ? r.json() : null };
    },
    async cerrar() {
      await app.close();
      await db.destroy();
    },
  };
}
