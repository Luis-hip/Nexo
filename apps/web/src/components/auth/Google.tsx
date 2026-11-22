import { MENSAJES_GOOGLE, type CuentaAuth } from '@nexo/shared';
import { Link2, Unlink } from 'lucide-react';
import { Banner, Boton, Insignia, Tarjeta } from '@/components/ui';
import { mensajeDeError, urlApi } from '@/lib/api';
import { useDesvincularGoogle, useProveedores } from '@/lib/consultasAuth';
import { toast } from '@/lib/toasts';

/**
 * AUTH-07 · Entrar con Google (docs/13_Plan_Integrado_Pendientes.md, 1.2). El flujo OAuth lo hace
 * la API (`/auth/google`): aquí solo hay enlaces a ella y la lectura del resultado al volver.
 */

/** Logotipo «G» de Google para el botón de acceso (pautas de marca de Google Identity). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

const claseBoton =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-line-strong/60 bg-raised px-4 text-sm font-medium text-fg transition-colors hover:bg-surface';

/** «Continuar con Google» en Entrar y Registro (solo si el servidor tiene Google configurado). */
export function AccesoGoogle({ volver }: { volver?: string }) {
  const p = useProveedores();
  if (!p.data?.google) return null;
  const consulta = volver ? `?volver=${encodeURIComponent(volver)}` : '';
  return (
    <div className="space-y-4" data-name="NX/AUTH-Google">
      <a href={urlApi(`/auth/google${consulta}`)} className={claseBoton}>
        <LogoGoogle /> Continuar con Google
      </a>
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> o con tu correo{' '}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

/** Aviso del regreso de Google (`?google=<código>`). */
export function AvisoGoogle({ codigo }: { codigo: string | null }) {
  if (!codigo) return null;
  return (
    <Banner tono={codigo === 'vinculada' ? 'ok' : 'warn'}>
      {MENSAJES_GOOGLE[codigo] ?? MENSAJES_GOOGLE.error}
    </Banner>
  );
}

/** Ajustes → Cuenta: vincular o desvincular Google. */
export function GoogleCuenta({ cuenta }: { cuenta: CuentaAuth }) {
  const p = useProveedores();
  const desvincular = useDesvincularGoogle();
  if (!p.data?.google && !cuenta.google) return null;
  return (
    <Tarjeta as="section" className="space-y-3 p-4 sm:p-5" data-name="NX/PF-02-Google">
      <h2 className="flex items-center gap-2 font-semibold">
        <LogoGoogle /> Google
      </h2>
      {cuenta.google ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Insignia tono="ok">Vinculada</Insignia>
            <span className="text-muted">Puedes entrar con «Continuar con Google».</span>
          </p>
          {cuenta.tiene_contrasena ? (
            <Boton
              variante="fantasma"
              icono={<Unlink className="size-4" />}
              cargando={desvincular.isPending}
              onClick={() =>
                desvincular.mutate(undefined, {
                  onSuccess: () => toast('Google quedó desvinculado.'),
                  onError: (e) => toast(mensajeDeError(e), 'warn'),
                })
              }
            >
              Desvincular Google
            </Boton>
          ) : (
            <p className="text-xs text-muted">
              Tu cuenta solo entra con Google. Para desvincularlo, primero crea una contraseña con
              «¿Olvidaste tu contraseña?» en la pantalla de inicio.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Vincula tu cuenta de Google para entrar sin escribir la contraseña.
          </p>
          <a
            href={urlApi(
              `/auth/google?modo=vincular&volver=${encodeURIComponent('/ajustes/cuenta')}`,
            )}
            className={`${claseBoton} sm:w-auto`}
          >
            <Link2 className="size-4" aria-hidden /> Vincular Google
          </a>
        </>
      )}
    </Tarjeta>
  );
}
