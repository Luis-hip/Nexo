import {
  esquemaCambiarContrasena,
  esquemaCodigoDosPasos,
  esquemaSegundoPaso,
  esquemaEntrar,
  esquemaRecuperar,
  esquemaRegistro,
  esquemaRestablecer,
  esquemaVerificarCorreo,
  MENSAJE_CREDENCIALES,
  MENSAJE_RECUPERAR,
} from '@nexo/shared';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { exigirSesion } from '../autenticacion';
import { cifrar, descifrar } from '../cifrado';
import type { Config } from '../config';
import type { Correo } from '../correo';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/autenticacion';
import { COOKIE_SESION, DURACION_SESION_MS, crearTokenSesion, hashToken } from '../sesiones';
import { validar } from '../validacion';
import { codigosRespaldo, generarSecreto, hashRespaldo, pasoValido, uriOtpauth } from '../totp';

interface Opciones {
  db: BaseDatos;
  config: Config;
  correo: Correo;
}

const HORA = 60 * 60 * 1000;
const VIGENCIA_RESTABLECER_MS = HORA;
const VIGENCIA_VERIFICAR_MS = 24 * HORA;

/**
 * Autenticación real (Fase 5.1: AUTH-01 a AUTH-06, AUTH-11 y la contraseña de PF-02), DEC-AUTH-1.
 *  - Contraseñas con Argon2id (`@node-rs/argon2`, parámetros por defecto de OWASP: 19 MiB, t=2, p=1).
 *  - Sesiones con el mismo mecanismo que ya existía: token opaco en cookie `HttpOnly`, hash en la BD.
 *  - Inicio de sesión y recuperación no revelan si un correo existe: misma respuesta y, sin cuenta,
 *    se verifica contra un hash señuelo para que el tiempo de respuesta no lo delate.
 *  - Bloqueo de 15 min tras 5 fallos seguidos (en la BD) y límite de peticiones por IP (aquí).
 */
export const rutasAutenticacion: FastifyPluginAsync<Opciones> = async (
  app,
  { db, config, correo },
) => {
  const produccion = config.NODE_ENV === 'production';
  // En las pruebas se hacen muchos intentos seguidos desde la misma IP.
  const limite = (max: number) => ({
    config: {
      rateLimit: { max: config.NODE_ENV === 'test' ? max * 50 : max, timeWindow: '1 minute' },
    },
  });
  const hashSenuelo = await hash(randomBytes(24).toString('base64url'));

  const nuevaSesion = (req: FastifyRequest) => {
    const { token, hash: tokenHash } = crearTokenSesion();
    const expiraEn = new Date(Date.now() + DURACION_SESION_MS);
    const datos: repo.DatosSesion = {
      tokenHash,
      ip: req.ip,
      dispositivo: String(req.headers['user-agent'] ?? '').slice(0, 200),
      expiraEn,
    };
    return { token, datos };
  };
  const ponerCookie = (res: FastifyReply, token: string, expira: Date) =>
    res.setCookie(COOKIE_SESION, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: produccion,
      expires: expira,
    });

  /** Envía un correo sin romper la petición si el proveedor falla. */
  const enviar = async (para: string, asunto: string, texto: string) => {
    try {
      await correo.enviar({ para, asunto, texto });
    } catch (e) {
      app.log.error({ err: e, asunto }, 'No se pudo enviar el correo.');
    }
  };
  const enlace = (ruta: string, token: string) =>
    `${config.APP_URL.replace(/\/$/, '')}${ruta}?token=${encodeURIComponent(token)}`;

  async function enviarVerificacion(usuarioId: string) {
    const { token, hash: tokenHash } = crearTokenSesion();
    const r = await repo.solicitarVerificacion(
      db,
      usuarioId,
      tokenHash,
      new Date(Date.now() + VIGENCIA_VERIFICAR_MS),
    );
    if (!r.verificado) {
      await enviar(
        r.correo,
        'Confirma tu correo en Nexo',
        `Hola, ${r.nombre}:\n\nConfirma tu correo con este enlace (vence en 24 horas):\n${enlace('/verificar', token)}\n\nSi no creaste una cuenta en Nexo, ignora este mensaje.`,
      );
    }
    return r;
  }

  // --- AUTH-01 · Registro ---------------------------------------------------------------------
  app.post('/auth/registro', limite(5), async (req, res) => {
    const datos = validar(esquemaRegistro, req.body);
    const { token, datos: sesion } = nuevaSesion(req);
    const r = await repo.registrar(
      db,
      { correo: datos.correo, nombre: datos.nombre, hash: await hash(datos.contrasena) },
      sesion,
    );
    ponerCookie(res, token, sesion.expiraEn);
    await enviarVerificacion(r.usuario.id);
    return res.status(201).send(r);
  });

  // --- AUTH-02 · Iniciar sesión ---------------------------------------------------------------
  app.post('/auth/entrar', limite(10), async (req, res) => {
    const { correo: direccion, contrasena } = validar(esquemaEntrar, req.body);
    const cred = await repo.credenciales(db, direccion);
    const correcta = await verify(cred?.hash ?? hashSenuelo, contrasena).catch(() => false);
    if (!cred) throw new ErrorNexo(401, 'credenciales_invalidas', MENSAJE_CREDENCIALES);
    const { token, datos: sesion } = nuevaSesion(req);
    const r = await repo.entrar(db, cred.usuario_id, correcta, sesion);
    if (r.estado === '2fa') {
      // AUTH-07: sin sesión todavía. El token pasa a ser el del desafío del segundo paso.
      return { dos_pasos: true, desafio: token };
    }
    if (r.estado !== 'ok' || !r.usuario) {
      throw new ErrorNexo(401, 'credenciales_invalidas', MENSAJE_CREDENCIALES);
    }
    ponerCookie(res, token, sesion.expiraEn);
    return { usuario: r.usuario };
  });

  // --- AUTH-07 · Verificación en dos pasos (docs/13, 1.2) -------------------------------------

  /** Convierte el código escrito en lo que decide la BD: un paso TOTP válido o el hash de respaldo. */
  const factor = (secretoCifrado: string, codigo: string) =>
    /^\d{6}$/.test(codigo)
      ? { paso: pasoValido(descifrar(config, secretoCifrado), codigo), respaldo: null }
      : { paso: null, respaldo: hashRespaldo(codigo) };

  // Segundo paso del inicio de sesión (contraseña o Google).
  app.post('/auth/2fa', limite(10), async (req, res) => {
    const { desafio, codigo } = validar(esquemaSegundoPaso, req.body);
    const tokenHash = hashToken(desafio);
    const d = await repo.desafio2fa(db, tokenHash);
    const f = factor(d.secreto_cifrado, codigo);
    const { token, datos: sesion } = nuevaSesion(req);
    // Un código de 6 dígitos que no cuadra se registra como fallo (cuenta para el tope de 5).
    const r = await repo.completar2fa(
      db,
      tokenHash,
      f.paso ?? (f.respaldo ? null : -1),
      f.respaldo,
      sesion,
    );
    if (r.estado === 'ok' && r.usuario) {
      ponerCookie(res, token, sesion.expiraEn);
      return { usuario: r.usuario };
    }
    if (r.estado === 'agotado') {
      throw new ErrorNexo(401, 'desafio_agotado', 'Demasiados intentos. Vuelve a iniciar sesión.');
    }
    throw new ErrorNexo(
      401,
      'codigo_incorrecto',
      `El código no es correcto. Te quedan ${r.intentos_restantes ?? 0} intentos.`,
    );
  });

  app.get('/auth/2fa', async (req) => repo.estado2fa(db, exigirSesion(req).usuario.id));

  // Activar, paso 1: secreto nuevo (cifrado en la BD), su enlace otpauth y el QR.
  app.post('/auth/2fa/iniciar', limite(5), async (req) => {
    const { usuario } = exigirSesion(req);
    const secreto = generarSecreto();
    await repo.iniciar2fa(db, usuario.id, cifrar(config, secreto));
    const uri = uriOtpauth(secreto, usuario.correo);
    const qr_svg = await QRCode.toString(uri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return { secreto, uri, qr_svg };
  });

  // Activar, paso 2: el primer código confirma; se entregan los 10 códigos de respaldo (una vez).
  app.post('/auth/2fa/confirmar', limite(10), async (req) => {
    const { usuario } = exigirSesion(req);
    const { codigo } = validar(esquemaCodigoDosPasos, req.body);
    const s = await repo.secreto2fa(db, usuario.id);
    if (!s || s.confirmado) {
      throw new ErrorNexo(
        409,
        'sin_activacion',
        'No hay una activación pendiente. Empieza de nuevo.',
      );
    }
    const paso = pasoValido(descifrar(config, s.secreto_cifrado), codigo);
    if (paso === null) throw new ErrorNexo(400, 'codigo_incorrecto', 'El código no es correcto.');
    const { codigos, hashes } = codigosRespaldo();
    const estado = await repo.confirmar2fa(db, usuario.id, paso, hashes);
    return { estado, codigos };
  });

  app.post('/auth/2fa/desactivar', limite(5), async (req) => {
    const { usuario } = exigirSesion(req);
    const { codigo } = validar(esquemaCodigoDosPasos, req.body);
    const s = await repo.secreto2fa(db, usuario.id);
    if (!s?.confirmado)
      throw new ErrorNexo(409, 'no_activa', 'La verificación en dos pasos no está activa.');
    const f = factor(s.secreto_cifrado, codigo);
    return repo.desactivar2fa(db, usuario.id, f.paso ?? (f.respaldo ? null : -1), f.respaldo);
  });

  app.post('/auth/2fa/respaldo', limite(5), async (req) => {
    const { usuario } = exigirSesion(req);
    const { codigo } = validar(esquemaCodigoDosPasos, req.body);
    const s = await repo.secreto2fa(db, usuario.id);
    if (!s?.confirmado)
      throw new ErrorNexo(409, 'no_activa', 'La verificación en dos pasos no está activa.');
    const f = factor(s.secreto_cifrado, codigo);
    const { codigos, hashes } = codigosRespaldo();
    const estado = await repo.regenerarRespaldo2fa(
      db,
      usuario.id,
      f.paso ?? (f.respaldo ? null : -1),
      f.respaldo,
      hashes,
    );
    return { estado, codigos };
  });

  // --- AUTH-07 · Entrar con Google (OAuth 2.0 con PKCE, docs/13 1.2) ---------------------------
  //
  // El estado y el verificador PKCE viajan en una cookie cifrada y autenticada (AES-256-GCM) que
  // solo sirve 10 minutos. El token de Google se pide directo a Google por TLS (OpenID permite no
  // verificar la firma del id_token recibido así) y se comprueban emisor, audiencia y vigencia.

  const COOKIE_GOOGLE = 'nexo_google';
  const googleActivo = !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  const appUrl = config.APP_URL.replace(/\/$/, '');
  const callbackGoogle = `${config.API_URL.replace(/\/$/, '')}/auth/google/callback`;

  app.get('/auth/proveedores', async () => ({ google: googleActivo }));

  app.get('/auth/google', limite(20), async (req, res) => {
    if (!googleActivo)
      throw new ErrorNexo(404, 'google_no_configurado', 'Google no está configurado.');
    const q = req.query as { volver?: string; modo?: string };
    const modo = q.modo === 'vincular' ? 'vincular' : 'entrar';
    if (modo === 'vincular') exigirSesion(req);
    const volver =
      q.volver && q.volver.startsWith('/') && !q.volver.startsWith('//') ? q.volver : '/app';
    const estado = randomBytes(24).toString('base64url');
    const verificador = randomBytes(48).toString('base64url');
    const reto = createHash('sha256').update(verificador).digest('base64url');
    res.setCookie(
      COOKIE_GOOGLE,
      cifrar(config, JSON.stringify({ estado, verificador, volver, modo })),
      {
        path: '/auth/google',
        httpOnly: true,
        sameSite: 'lax',
        secure: produccion,
        maxAge: 600,
      },
    );
    const url = new URL(config.GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackGoogle,
      response_type: 'code',
      scope: 'openid email profile',
      state: estado,
      code_challenge: reto,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return res.redirect(url.toString());
  });

  app.get('/auth/google/callback', limite(20), async (req, res) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const guardado = req.cookies[COOKIE_GOOGLE];
    res.clearCookie(COOKIE_GOOGLE, { path: '/auth/google' });
    let datos: { estado: string; verificador: string; volver: string; modo: string } | null;
    try {
      datos = guardado ? JSON.parse(descifrar(config, guardado)) : null;
    } catch {
      datos = null;
    }
    const vincular = datos?.modo === 'vincular';
    const fallo = (codigo: string) =>
      res.redirect(`${appUrl}${vincular ? '/ajustes/cuenta' : '/entrar'}?google=${codigo}`);
    if (!googleActivo || !datos) return fallo('expirado');
    if (q.error) return fallo('cancelado');
    if (!q.code || q.state !== datos.estado) return fallo('error');
    try {
      const r = await fetch(config.GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: q.code,
          client_id: config.GOOGLE_CLIENT_ID!,
          client_secret: config.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackGoogle,
          grant_type: 'authorization_code',
          code_verifier: datos.verificador,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const t = (await r.json().catch(() => null)) as { id_token?: string } | null;
      const partes = t?.id_token?.split('.');
      if (!r.ok || !partes || partes.length !== 3) return fallo('error');
      const p = JSON.parse(Buffer.from(partes[1]!, 'base64url').toString('utf8')) as {
        iss?: string;
        aud?: string;
        exp?: number;
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      const emisorOk = p.iss === 'https://accounts.google.com' || p.iss === 'accounts.google.com';
      if (!emisorOk || p.aud !== config.GOOGLE_CLIENT_ID || !p.exp || p.exp * 1000 < Date.now()) {
        return fallo('error');
      }
      const { token, datos: sesion } = nuevaSesion(req);
      const actor = vincular ? (req.sesion?.usuario.id ?? null) : null;
      if (vincular && !actor) return fallo('expirado');
      const g = await repo.google(
        db,
        {
          sub: p.sub ?? '',
          correo: p.email ?? '',
          verificado: p.email_verified === true,
          nombre: p.name ?? '',
        },
        actor,
        sesion,
      );
      if (g.estado === 'vinculada')
        return res.redirect(`${appUrl}/ajustes/cuenta?google=vinculada`);
      if (g.estado === '2fa') {
        // El desafío va en el fragmento (#): no llega a los registros ni al Referer.
        const frag = new URLSearchParams({ desafio: token, volver: datos.volver }).toString();
        return res.redirect(`${appUrl}/entrar/dos-pasos#${frag}`);
      }
      ponerCookie(res, token, sesion.expiraEn);
      return res.redirect(`${appUrl}${g.nuevo ? '/bienvenida/1' : datos.volver}`);
    } catch (e) {
      if (e instanceof ErrorNexo) return fallo(e.codigo);
      req.log.error({ err: e }, 'Falló el acceso con Google.');
      return fallo('error');
    }
  });

  app.post('/auth/google/desvincular', limite(5), async (req) =>
    repo.desvincularGoogle(db, exigirSesion(req).usuario.id),
  );

  // --- AUTH-03 y AUTH-04 · Recuperar contraseña -----------------------------------------------
  app.post('/auth/recuperar', limite(5), async (req, res) => {
    const { correo: direccion } = validar(esquemaRecuperar, req.body);
    const { token, hash: tokenHash } = crearTokenSesion();
    const r = await repo.recuperar(
      db,
      direccion,
      tokenHash,
      new Date(Date.now() + VIGENCIA_RESTABLECER_MS),
    );
    if (r) {
      await enviar(
        r.correo,
        'Restablece tu contraseña de Nexo',
        `Hola, ${r.nombre}:\n\nPara elegir una contraseña nueva abre este enlace (vence en 1 hora):\n${enlace('/restablecer', token)}\n\nSi no lo pediste, ignora este mensaje: tu contraseña no cambia.`,
      );
    }
    return res.status(202).send({ mensaje: MENSAJE_RECUPERAR });
  });

  // --- AUTH-05 · Restablecer ------------------------------------------------------------------
  app.post('/auth/restablecer', limite(10), async (req, res) => {
    const { token, contrasena } = validar(esquemaRestablecer, req.body);
    // El token del enlace se guarda como hash SHA-256, igual que el de las sesiones.
    const r = await repo.restablecer(db, hashToken(token), await hash(contrasena));
    // Todas las sesiones de la cuenta se cerraron, también la de este navegador si la había.
    res.clearCookie(COOKIE_SESION, { path: '/' });
    return r;
  });

  // --- AUTH-06 · Verificar correo -------------------------------------------------------------
  app.post('/auth/verificar', limite(10), async (req) => {
    const { token } = validar(esquemaVerificarCorreo, req.body);
    return repo.verificarCorreo(db, hashToken(token));
  });

  app.post('/auth/verificacion', limite(3), async (req) => {
    const { usuario } = exigirSesion(req);
    const r = await enviarVerificacion(usuario.id);
    return { verificado: r.verificado };
  });

  // --- PF-02 · Cuenta y contraseña ------------------------------------------------------------
  app.get('/auth/cuenta', async (req) => repo.cuenta(db, exigirSesion(req).usuario.id));

  app.post('/auth/contrasena', limite(5), async (req) => {
    const { usuario, sesionId } = exigirSesion(req);
    const { actual, nueva } = validar(esquemaCambiarContrasena, req.body);
    const { hash: guardado } = await repo.hashActual(db, usuario.id);
    if (!guardado || !(await verify(guardado, actual).catch(() => false))) {
      throw new ErrorNexo(400, 'contrasena_incorrecta', 'La contraseña actual no es correcta.');
    }
    return repo.cambiarContrasena(db, usuario.id, sesionId, await hash(nueva));
  });
};
