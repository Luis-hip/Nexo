import type { WhatsAppUsuario } from '@nexo/shared';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Boton, Campo, Casilla, Entrada, Interruptor } from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesWhatsAppYo } from '@/lib/consultasWhatsApp';
import { toast } from '@/lib/toasts';
import { DirectoPersonal } from './Directo';

/**
 * Registro de WhatsApp: número y consentimiento (docs/13_Plan_Integrado_Pendientes.md, 1.1).
 * Un solo componente para las tres puertas de entrada: Ajustes → WhatsApp (`ajustes`), la
 * bienvenida y `/app/whatsapp/activar` (`paso`). La verificación es la de `DirectoPersonal`.
 */
export function RegistroWhatsApp({
  w,
  variante,
}: {
  w: WhatsAppUsuario;
  variante: 'ajustes' | 'paso';
}) {
  const acciones = useAccionesWhatsAppYo();
  const [numero, setNumero] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(true);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string>();
  const valor = numero ?? w.numero ?? '';
  const guardar = (cambios: { numero?: string; consentimiento?: boolean }, ok?: string) => {
    setError(undefined);
    acciones.guardar.mutate(cambios, {
      onSuccess: () => {
        setNumero(null);
        setEditando(false);
        if (ok) toast(ok);
      },
      onError: (e) => setError(mensajeDeError(e)),
    });
  };
  const campoNumero = (
    <Campo
      etiqueta="Tu número de WhatsApp"
      error={error}
      ayuda="Con lada internacional, por ejemplo +5212221234567. Solo se usa para los avisos de Nexo."
    >
      <Entrada
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={valor}
        maxLength={16}
        onChange={(e) => setNumero(e.target.value)}
      />
    </Campo>
  );

  if (variante === 'ajustes') {
    return (
      <>
        {campoNumero}
        <Boton
          cargando={acciones.guardar.isPending}
          disabled={numero === null}
          onClick={() =>
            guardar({ numero: valor.trim() }, valor.trim() ? 'Número guardado.' : 'Número borrado.')
          }
        >
          Guardar número
        </Boton>
        <Interruptor
          etiqueta="Acepto recibir avisos de Nexo por WhatsApp"
          descripcion="Puedes retirarlo cuando quieras; al hacerlo, dejas de aparecer en los avisos de todos tus equipos."
          checked={w.consentimiento}
          disabled={!w.numero}
          onChange={(v) => guardar({ consentimiento: v })}
        />
      </>
    );
  }

  // Paso guiado: un solo botón guarda el número y el consentimiento; después viene la verificación.
  if (w.numero && w.consentimiento && !editando) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <MessageCircle className="size-4 text-muted" aria-hidden />
        Tu número: <strong className="tabular">{w.numero}</strong>
        <button
          type="button"
          className="text-brand hover:underline"
          onClick={() => setEditando(true)}
        >
          Cambiar
        </button>
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valor.trim()) {
          setError('Escribe tu número con lada internacional.');
          return;
        }
        guardar({ numero: valor.trim(), consentimiento: acepta });
      }}
    >
      {campoNumero}
      <Casilla
        checked={acepta}
        onChange={setAcepta}
        etiqueta="Acepto recibir avisos de Nexo por WhatsApp"
        descripcion="Puedes retirarlo cuando quieras desde Ajustes → WhatsApp o escribiendo BAJA."
      />
      <Boton
        type="submit"
        variante="primario"
        cargando={acciones.guardar.isPending}
        disabled={!acepta}
      >
        Continuar
      </Boton>
    </form>
  );
}

/** Registro y verificación juntos: lo usan la bienvenida y `/app/whatsapp/activar`. */
export function ActivarWhatsApp({ w }: { w: WhatsAppUsuario }) {
  return (
    <div className="space-y-4" data-name="NX/WA-Activar">
      <RegistroWhatsApp w={w} variante="paso" />
      <DirectoPersonal w={w} />
    </div>
  );
}
