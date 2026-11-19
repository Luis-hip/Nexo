import {
  esquemaEntrar,
  esquemaRecuperar,
  esquemaRegistro,
  esquemaRestablecer,
  MIN_CONTRASENA,
} from '@nexo/shared';
import { CheckCircle2, FlaskConical, KeyRound, MailCheck, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Avatar, Banner, Boton, Campo, Contrasena, Entrada, EsqueletoLista } from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import {
  useEntrar,
  useRecuperar,
  useRegistro,
  useRestablecer,
  useVerificarCorreo,
} from '@/lib/consultasAuth';
import { useDevLogin, useUsuariosDev } from '@/lib/consultas';
import { destinoSeguro, Tarjeta } from './comunes';

/** Lo que hace falta de un esquema Zod de `@nexo/shared` (la web no depende de Zod). */
interface Esquema<T> {
  safeParse(
    d: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/** Errores por campo del mismo esquema que valida la API. */
function erroresDe<T>(esquema: Esquema<T>, datos: unknown) {
  const r = esquema.safeParse(datos);
  if (r.success) return { datos: r.data, errores: {} as Record<string, string> };
  const errores: Record<string, string> = {};
  for (const i of r.error.issues) {
    const campo = String(i.path[0] ?? '');
    errores[campo] ??= i.message;
  }
  return { datos: null, errores };
}

const enlace = 'font-medium text-brand hover:underline';

// --- AUTH-02 ------------------------------------------------------------------------------------

/** AUTH-02: inicio de sesión con correo y contraseña (y, en desarrollo, el acceso de la semilla). */
export function Entrar() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const entrar = useEntrar();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const destino = destinoSeguro(sp.get('volver')) ?? '/app';

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const { datos, errores: err } = erroresDe(esquemaEntrar, { correo, contrasena });
    setErrores(err);
    if (datos) entrar.mutate(datos, { onSuccess: () => nav(destino, { replace: true }) });
  };

  return (
    <Tarjeta
      titulo="Inicia sesión"
      subtitulo={
        sp.get('salio')
          ? 'Cerraste sesión correctamente.'
          : sp.get('restablecida')
            ? 'Tu contraseña cambió. Entra con la nueva.'
            : 'Qué bueno verte de nuevo.'
      }
      nombre="NX/AUTH-02-Inicio-sesion"
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        {entrar.error && (
          <Banner tono="danger" className="mb-1">
            {mensajeDeError(entrar.error)}
          </Banner>
        )}
        <Campo etiqueta="Correo" error={errores.correo}>
          <Entrada
            type="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Contraseña" error={errores.contrasena}>
          <Contrasena
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </Campo>
        <div className="flex justify-end text-sm">
          <Link to="/recuperar" className={enlace}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Boton type="submit" variante="primario" bloque cargando={entrar.isPending}>
          Entrar
        </Boton>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        ¿No tienes cuenta?{' '}
        <Link
          to={`/registro${sp.get('volver') ? `?volver=${encodeURIComponent(destino)}` : ''}`}
          className={enlace}
        >
          Regístrate
        </Link>
      </p>
      <AccesoDesarrollo destino={destino} />
    </Tarjeta>
  );
}

/**
 * Acceso de desarrollo: solo aparece si la API lo tiene activo (DEV_LOGIN_ENABLED=true, nunca en
 * producción). Permite entrar como cualquier persona de la semilla sin escribir la contraseña.
 */
function AccesoDesarrollo({ destino }: { destino: string }) {
  const nav = useNavigate();
  const usuarios = useUsuariosDev();
  const login = useDevLogin();
  const [abierto, setAbierto] = useState(false);
  if (!usuarios.data || (usuarios.error instanceof ErrorApi && usuarios.error.estado === 404)) {
    return null;
  }
  return (
    <div className="mt-6 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 text-sm text-muted hover:text-fg"
      >
        <FlaskConical className="size-4" aria-hidden />
        Acceso de desarrollo (semilla)
      </button>
      {abierto && (
        <>
          <p className="mt-2 text-xs text-muted">
            Solo en local y en la CI. Las personas de la semilla también entran con la contraseña
            «Nexo-2026».
          </p>
          {login.error && (
            <Banner tono="danger" className="mt-2">
              {mensajeDeError(login.error)}
            </Banner>
          )}
          {usuarios.isPending ? (
            <EsqueletoLista filas={3} />
          ) : (
            <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
              {usuarios.data.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={login.isPending}
                    onClick={() =>
                      login.mutate(u.correo, { onSuccess: () => nav(destino, { replace: true }) })
                    }
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface disabled:opacity-60"
                  >
                    <Avatar persona={{ nombre: u.nombre }} tamano={30} conAnillo={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.nombre}</span>
                      <span className="block truncate text-xs text-muted">{u.correo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// --- AUTH-01 ------------------------------------------------------------------------------------

/** AUTH-01: crear cuenta. Al terminar se entra y se va a la bienvenida (ONB-01). */
export function Registro() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const registro = useRegistro();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const { datos, errores: err } = erroresDe(esquemaRegistro, { nombre, correo, contrasena });
    setErrores(err);
    if (!datos) return;
    const volver = destinoSeguro(sp.get('volver'));
    registro.mutate(datos, {
      onSuccess: () => nav(volver ?? '/bienvenida/1', { replace: true }),
    });
  };

  return (
    <Tarjeta
      titulo="Crea tu cuenta"
      subtitulo="Organiza tu trabajo y el de tu equipo en un solo lugar."
      nombre="NX/AUTH-01-Registro"
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        {registro.error && <Banner tono="danger">{mensajeDeError(registro.error)}</Banner>}
        <Campo etiqueta="Nombre" error={errores.nombre}>
          <Entrada
            autoComplete="name"
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Correo" error={errores.correo}>
          <Entrada
            type="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </Campo>
        <Campo
          etiqueta="Contraseña"
          error={errores.contrasena}
          ayuda={`Al menos ${MIN_CONTRASENA} caracteres. Una frase larga es más segura.`}
        >
          <Contrasena
            autoComplete="new-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </Campo>
        <p className="text-xs text-muted">
          Al crear tu cuenta aceptas los{' '}
          <Link to="/terminos" className={enlace}>
            Términos
          </Link>{' '}
          y el{' '}
          <Link to="/privacidad" className={enlace}>
            Aviso de privacidad
          </Link>
          .
        </p>
        <Boton type="submit" variante="primario" bloque cargando={registro.isPending}>
          Crear cuenta
        </Boton>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link to="/entrar" className={enlace}>
          Inicia sesión
        </Link>
      </p>
    </Tarjeta>
  );
}

// --- AUTH-03 y AUTH-04 --------------------------------------------------------------------------

/** AUTH-03: pedir el enlace. La respuesta es la misma exista o no la cuenta. */
export function Recuperar() {
  const nav = useNavigate();
  const recuperar = useRecuperar();
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState('');

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const { datos, errores } = erroresDe(esquemaRecuperar, { correo });
    setError(errores.correo ?? '');
    if (datos) {
      recuperar.mutate(datos.correo, {
        onSuccess: () => nav('/recuperar/enviado', { state: { correo: datos.correo } }),
      });
    }
  };

  return (
    <Tarjeta
      titulo="Recupera tu contraseña"
      subtitulo="Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una nueva."
      nombre="NX/AUTH-03-Recuperar"
      icono={<KeyRound />}
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        {recuperar.error && <Banner tono="danger">{mensajeDeError(recuperar.error)}</Banner>}
        <Campo etiqueta="Correo" error={error}>
          <Entrada
            type="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoFocus
          />
        </Campo>
        <Boton type="submit" variante="primario" bloque cargando={recuperar.isPending}>
          Enviar enlace
        </Boton>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link to="/entrar" className={enlace}>
          Volver a iniciar sesión
        </Link>
      </p>
    </Tarjeta>
  );
}

/** AUTH-04: enlace enviado (no confirma si el correo tiene cuenta). */
export function RecuperarEnviado() {
  return (
    <Tarjeta
      titulo="Revisa tu correo"
      subtitulo="Si hay una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Vence en 1 hora."
      nombre="NX/AUTH-04-Enviado"
      icono={<MailCheck />}
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Revisa también la carpeta de spam o promociones.</li>
        <li>Si pides otro enlace, el anterior deja de servir.</li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/recuperar" className={enlace}>
          Pedir otro enlace
        </Link>
        <Link to="/entrar" className={enlace}>
          Volver a iniciar sesión
        </Link>
      </div>
    </Tarjeta>
  );
}

// --- AUTH-05 ------------------------------------------------------------------------------------

/** AUTH-05: elegir la contraseña nueva con el enlace del correo. */
export function Restablecer() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const restablecer = useRestablecer();
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const enlaceInvalido = restablecer.error instanceof ErrorApi && restablecer.error.estado === 410;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const { datos, errores: err } = erroresDe(esquemaRestablecer, { token, contrasena });
    if (!err.contrasena && contrasena !== confirmar)
      err.confirmar = 'Las contraseñas no coinciden.';
    setErrores(err);
    if (datos && !err.confirmar) {
      restablecer.mutate(datos, {
        onSuccess: () => nav('/entrar?restablecida=1', { replace: true }),
      });
    }
  };

  if (!token || errores.token || enlaceInvalido) {
    return (
      <Tarjeta
        titulo="El enlace ya no es válido"
        subtitulo="Puede que haya vencido (dura 1 hora), que ya lo hayas usado o que pidieras uno más nuevo."
        nombre="NX/AUTH-05-Enlace-invalido"
        icono={<XCircle />}
      >
        <Link to="/recuperar" className={enlace}>
          Pedir un enlace nuevo
        </Link>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta
      titulo="Elige una contraseña nueva"
      subtitulo="Al guardarla se cerrarán las sesiones abiertas de tu cuenta."
      nombre="NX/AUTH-05-Restablecer"
      icono={<KeyRound />}
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        {restablecer.error && !enlaceInvalido && (
          <Banner tono="danger">{mensajeDeError(restablecer.error)}</Banner>
        )}
        <Campo
          etiqueta="Contraseña nueva"
          error={errores.contrasena}
          ayuda={`Al menos ${MIN_CONTRASENA} caracteres.`}
        >
          <Contrasena
            autoComplete="new-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Repite la contraseña" error={errores.confirmar}>
          <Contrasena
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
          />
        </Campo>
        <Boton type="submit" variante="primario" bloque cargando={restablecer.isPending}>
          Guardar contraseña
        </Boton>
      </form>
    </Tarjeta>
  );
}

// --- AUTH-06 ------------------------------------------------------------------------------------

/** AUTH-06: confirma el correo al abrir el enlace (no hace falta tener sesión). */
export function Verificar() {
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const verificar = useVerificarCorreo();
  const enviado = useRef(false);
  const { mutate } = verificar;
  useEffect(() => {
    // Una sola vez aunque React monte dos veces en desarrollo: el enlace es de un solo uso.
    if (token && !enviado.current) {
      enviado.current = true;
      mutate(token);
    }
  }, [token, mutate]);

  if (!token || verificar.isError) {
    return (
      <Tarjeta
        titulo="No pudimos verificar tu correo"
        subtitulo={
          verificar.error instanceof ErrorApi && verificar.error.estado !== 410
            ? mensajeDeError(verificar.error)
            : 'El enlace venció (dura 24 horas), ya se usó o pediste uno más nuevo. Puedes pedir otro desde Ajustes → Cuenta.'
        }
        nombre="NX/AUTH-06-Error"
        icono={<XCircle />}
      >
        <Link to="/ajustes/cuenta" className={enlace}>
          Ir a Ajustes → Cuenta
        </Link>
      </Tarjeta>
    );
  }
  if (!verificar.isSuccess) return <EsqueletoLista filas={2} />;
  return (
    <Tarjeta
      titulo="Correo verificado"
      subtitulo="Gracias. Tu cuenta quedó confirmada."
      nombre="NX/AUTH-06-Verificado"
      icono={<CheckCircle2 />}
    >
      <Link
        to="/app"
        className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
      >
        Ir a Nexo
      </Link>
    </Tarjeta>
  );
}
