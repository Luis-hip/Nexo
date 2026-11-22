import type { CodigosRespaldo } from '@nexo/shared';
import { Copy, Download, KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Banner,
  Boton,
  Campo,
  Codigo6,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  Insignia,
  Tarjeta,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesDosPasos, useDosPasos, useSegundoPaso } from '@/lib/consultasAuth';
import { toast } from '@/lib/toasts';

/**
 * AUTH-07 · Verificación en dos pasos (docs/13_Plan_Integrado_Pendientes.md, 1.2).
 * Códigos TOTP de 6 dígitos (Google Authenticator, Authy, Microsoft Authenticator) o un código de
 * respaldo de un solo uso (XXXX-XXXX).
 */

/** Campo del código: 6 dígitos o, si la persona lo elige, un código de respaldo. */
function CampoCodigo({
  valor,
  onChange,
  respaldo,
  onRespaldo,
  error,
}: {
  valor: string;
  onChange: (v: string) => void;
  respaldo: boolean;
  onRespaldo: (v: boolean) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      {respaldo ? (
        <Campo
          etiqueta="Código de respaldo"
          error={error}
          ayuda="Ocho caracteres, por ejemplo ABCD-EFGH."
        >
          <Entrada
            value={valor}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            autoComplete="one-time-code"
            maxLength={9}
            autoFocus
          />
        </Campo>
      ) : (
        <>
          <Codigo6
            valor={valor}
            onChange={onChange}
            error={!!error}
            etiqueta="Código de 6 dígitos"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="text-sm text-brand hover:underline"
        onClick={() => {
          onChange('');
          onRespaldo(!respaldo);
        }}
      >
        {respaldo ? 'Usar el código de la app' : '¿Sin acceso a tu app? Usa un código de respaldo'}
      </button>
    </div>
  );
}

/** Segundo paso del inicio de sesión. Lo usan «Entrar» y el regreso de Google. */
export function SegundoPaso({
  desafio,
  onListo,
  onCancelar,
}: {
  desafio: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const paso = useSegundoPaso();
  const [codigo, setCodigo] = useState('');
  const [respaldo, setRespaldo] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    paso.mutate(
      { desafio, codigo },
      {
        onSuccess: onListo,
        onError: () => setCodigo(''),
      },
    );
  };
  const agotado =
    paso.error &&
    'codigo' in paso.error &&
    ['desafio_agotado', 'desafio_vencido', 'no_disponible'].includes(String(paso.error.codigo));
  return (
    <form onSubmit={enviar} noValidate className="space-y-4" data-name="NX/AUTH-07-Segundo-paso">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-muted">
          Abre tu app de autenticación (Google Authenticator, Authy…) y escribe el código de Nexo.
        </p>
      </div>
      {paso.error && <Banner tono="danger">{mensajeDeError(paso.error)}</Banner>}
      {agotado ? (
        <Boton variante="primario" bloque onClick={onCancelar}>
          Volver a iniciar sesión
        </Boton>
      ) : (
        <>
          <CampoCodigo
            valor={codigo}
            onChange={setCodigo}
            respaldo={respaldo}
            onRespaldo={setRespaldo}
          />
          <Boton
            type="submit"
            variante="primario"
            bloque
            cargando={paso.isPending}
            disabled={respaldo ? codigo.replace('-', '').length < 8 : codigo.length < 6}
          >
            Verificar
          </Boton>
          <button
            type="button"
            className="w-full text-sm text-muted hover:underline"
            onClick={onCancelar}
          >
            Cancelar
          </button>
        </>
      )}
    </form>
  );
}

/** Los 10 códigos de respaldo: se muestran una sola vez, con copiar y descargar. */
function ListaRespaldo({ codigos, onListo }: { codigos: string[]; onListo: () => void }) {
  const texto = `Códigos de respaldo de Nexo (cada uno sirve una vez):\n\n${codigos.join('\n')}\n`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast('Códigos copiados.');
    } catch {
      toast('No se pudieron copiar; anótalos.', 'warn');
    }
  };
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexo-codigos-de-respaldo.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3" data-name="NX/AUTH-07-Respaldo">
      <Banner tono="warn">
        Guarda estos códigos en un lugar seguro. Sirven para entrar si pierdes tu teléfono, cada uno
        una sola vez, y <strong>no los volverás a ver</strong>.
      </Banner>
      <ol className="grid grid-cols-2 gap-2 font-mono text-sm tabular sm:grid-cols-5">
        {codigos.map((c) => (
          <li
            key={c}
            className="rounded-[8px] border border-line bg-surface px-2 py-1.5 text-center"
          >
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Boton icono={<Copy className="size-4" />} onClick={() => void copiar()}>
          Copiar
        </Boton>
        <Boton icono={<Download className="size-4" />} onClick={descargar}>
          Descargar
        </Boton>
        <Boton variante="primario" onClick={onListo}>
          Ya los guardé
        </Boton>
      </div>
    </div>
  );
}

/** Pide un código (app o respaldo) para una acción sensible: desactivar o regenerar. */
function ConfirmarConCodigo({
  titulo,
  boton,
  peligro,
  cargando,
  error,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  boton: string;
  peligro?: boolean;
  cargando: boolean;
  error?: string;
  onConfirmar: (codigo: string) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [respaldo, setRespaldo] = useState(false);
  return (
    <form
      className="space-y-3 rounded-[10px] border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar(codigo);
      }}
    >
      <p className="text-sm font-medium">{titulo}</p>
      <CampoCodigo
        valor={codigo}
        onChange={setCodigo}
        respaldo={respaldo}
        onRespaldo={setRespaldo}
        error={error}
      />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante={peligro ? 'destructivo' : 'primario'} cargando={cargando}>
          {boton}
        </Boton>
        <Boton variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** Ajustes → Cuenta: activar, ver el estado, regenerar códigos y desactivar. */
/** `onTerminar`: se llama al cerrar la lista de códigos de respaldo (el tablero de soporte espera a eso). */
export function DosPasosAjustes({ onTerminar }: { onTerminar?: () => void } = {}) {
  const consulta = useDosPasos();
  const acc = useAccionesDosPasos();
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [codigo, setCodigo] = useState('');
  const [modo, setModo] = useState<'nada' | 'desactivar' | 'regenerar'>('nada');
  const [error, setError] = useState<string>();
  const inicio = acc.iniciar.data;
  const conCodigos = (r: CodigosRespaldo) => {
    setCodigos(r.codigos);
    setModo('nada');
    setError(undefined);
  };
  return (
    <Tarjeta as="section" className="space-y-4 p-4 sm:p-5" data-name="NX/PF-02-Dos-pasos">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-muted" aria-hidden /> Verificación en dos pasos
      </h2>
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={1} />}>
        {(estado) => {
          if (codigos) {
            return (
              <ListaRespaldo
                codigos={codigos}
                onListo={() => {
                  setCodigos(null);
                  onTerminar?.();
                  acc.iniciar.reset();
                }}
              />
            );
          }
          if (estado.activa) {
            return (
              <div className="space-y-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Insignia tono="ok">Activa</Insignia>
                  <span className="text-muted">
                    Te pediremos un código de tu app al iniciar sesión. Códigos de respaldo
                    disponibles: <strong className="tabular">{estado.codigos_restantes}</strong>.
                  </span>
                </p>
                {estado.codigos_restantes <= 2 && (
                  <Banner tono="warn">
                    Te quedan pocos códigos de respaldo. Genera unos nuevos.
                  </Banner>
                )}
                {modo === 'nada' ? (
                  <div className="flex flex-wrap gap-2">
                    <Boton
                      icono={<KeyRound className="size-4" />}
                      onClick={() => setModo('regenerar')}
                    >
                      Generar códigos de respaldo nuevos
                    </Boton>
                    <Boton
                      variante="fantasma"
                      icono={<ShieldOff className="size-4" />}
                      onClick={() => setModo('desactivar')}
                    >
                      Desactivar
                    </Boton>
                  </div>
                ) : modo === 'regenerar' ? (
                  <ConfirmarConCodigo
                    titulo="Los códigos anteriores dejarán de servir. Confirma con un código."
                    boton="Generar"
                    cargando={acc.respaldo.isPending}
                    error={error}
                    onCancelar={() => setModo('nada')}
                    onConfirmar={(c) =>
                      acc.respaldo.mutate(c, {
                        onSuccess: conCodigos,
                        onError: (e) => setError(mensajeDeError(e)),
                      })
                    }
                  />
                ) : (
                  <ConfirmarConCodigo
                    titulo="Tu cuenta quedará protegida solo con tu contraseña. Confirma con un código."
                    boton="Desactivar"
                    peligro
                    cargando={acc.desactivar.isPending}
                    error={error}
                    onCancelar={() => setModo('nada')}
                    onConfirmar={(c) =>
                      acc.desactivar.mutate(c, {
                        onSuccess: () => {
                          setModo('nada');
                          setError(undefined);
                          toast('Verificación en dos pasos desactivada.');
                        },
                        onError: (e) => setError(mensajeDeError(e)),
                      })
                    }
                  />
                )}
              </div>
            );
          }
          if (!inicio) {
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Además de tu contraseña (o de Google), te pediremos un código de 6 dígitos de una
                  app de autenticación. Así nadie entra solo con tu contraseña.
                </p>
                <Boton
                  variante="primario"
                  icono={<ShieldCheck className="size-4" />}
                  cargando={acc.iniciar.isPending}
                  onClick={() =>
                    acc.iniciar.mutate(undefined, {
                      onError: (e) => toast(mensajeDeError(e), 'warn'),
                    })
                  }
                >
                  Activar
                </Boton>
              </div>
            );
          }
          return (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                acc.confirmar.mutate(codigo, {
                  onSuccess: (r) => {
                    setCodigo('');
                    conCodigos(r);
                    toast('Verificación en dos pasos activada.');
                  },
                  onError: (er) => {
                    setCodigo('');
                    setError(mensajeDeError(er));
                  },
                });
              }}
            >
              <ol className="space-y-1 text-sm">
                <li>1. Instala Google Authenticator, Authy o Microsoft Authenticator.</li>
                <li>2. En la app, agrega una cuenta y escanea este código QR.</li>
                <li>3. Escribe el código de 6 dígitos que te muestra.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(inicio.qr_svg)}`}
                  alt="Código QR para tu app de autenticación"
                  className="size-44 rounded-[10px] bg-white p-2"
                />
                <div className="space-y-1 text-sm">
                  <p className="text-muted">¿No puedes escanear? Escribe esta clave:</p>
                  <p className="font-mono tracking-wider break-all">
                    {inicio.secreto.match(/.{1,4}/g)?.join(' ')}
                  </p>
                </div>
              </div>
              <Codigo6
                valor={codigo}
                onChange={setCodigo}
                error={!!error}
                etiqueta="Código de 6 dígitos"
              />
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Boton
                  type="submit"
                  variante="primario"
                  cargando={acc.confirmar.isPending}
                  disabled={codigo.length < 6}
                >
                  Confirmar y activar
                </Boton>
                <Boton variante="fantasma" onClick={() => acc.iniciar.reset()}>
                  Cancelar
                </Boton>
              </div>
            </form>
          );
        }}
      </EstadosDatos>
    </Tarjeta>
  );
}
