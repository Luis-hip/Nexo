import { Cookie } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Boton, Interruptor, Modal } from '@/components/ui';

/** PUB-14: aviso de cookies y privacidad. */
export function AvisoCookies() {
  const [valor, setValor] = useState(() => localStorage.getItem('nx-cookies'));
  const [config, setConfig] = useState(false);
  const [analitica, setAnalitica] = useState(false);
  const guardar = (v: string) => (
    localStorage.setItem('nx-cookies', v),
    setValor(v),
    setConfig(false)
  );
  if (valor) return null;
  return (
    <>
      <div
        className="anim-up fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-[16px] border border-line bg-raised p-4 shadow-modal sm:left-auto sm:right-6 sm:bottom-6"
        role="region"
        aria-label="Aviso de cookies"
        data-name="NX/PUB-14-Aviso-cookies"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cookie className="size-6 shrink-0 text-brand" aria-hidden />
          <p className="flex-1 text-sm text-muted">
            Usamos cookies necesarias para que Nexo funcione y, si lo permites, cookies de analítica
            para mejorarlo.{' '}
            <Link to="/privacidad" className="text-brand underline">
              Más información
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton tamano="sm" variante="texto" onClick={() => setConfig(true)}>
              Configurar
            </Boton>
            <Boton tamano="sm" onClick={() => guardar('rechazadas')}>
              Rechazar
            </Boton>
            <Boton tamano="sm" variante="primario" onClick={() => guardar('aceptadas')}>
              Aceptar
            </Boton>
          </div>
        </div>
      </div>
      <Modal
        abierto={config}
        onCerrar={() => setConfig(false)}
        titulo="Configurar cookies"
        ancho="sm"
        pie={
          <Boton
            variante="primario"
            onClick={() => guardar(analitica ? 'aceptadas' : 'configuradas')}
          >
            Guardar preferencias
          </Boton>
        }
      >
        <Interruptor
          etiqueta="Necesarias"
          descripcion="Sesión y preferencias. Siempre activas."
          checked
          onChange={() => {}}
          disabled
        />
        <Interruptor
          etiqueta="Analítica"
          descripcion="Nos ayuda a entender qué funciones se usan."
          checked={analitica}
          onChange={setAnalitica}
        />
      </Modal>
    </>
  );
}
