import type { WhatsAppUsuario } from '@nexo/shared';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Boton, CampoTelefono, Casilla, Interruptor, type ValorTelefono } from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesWhatsAppYo } from '@/lib/consultasWhatsApp';
import { formatoLegible } from '@/lib/telefono';
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
  // `null` = sin cambios respecto al número guardado.
  const [numero, setNumero] = useState<ValorTelefono | null>(null);
  const [acepta, setAcepta] = useState(true);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string>();
  const [validar, setValidar] = useState(false);
  // El campo se vuelve a montar al guardar, para prellenarse con el número nuevo.
  const [version, setVersion] = useState(0);
  const valor = numero?.e164 ?? w.numero ?? '';
  const valido = numero ? numero.valido : !!w.numero;
  const guardar = (cambios: { numero?: string; consentimiento?: boolean }, ok?: string) => {
    setError(undefined);
    acciones.guardar.mutate(cambios, {
      onSuccess: () => {
        setNumero(null);
        setEditando(false);
        setValidar(false);
        setVersion((v) => v + 1);
        if (ok) toast(ok);
      },
      onError: (e) => setError(mensajeDeError(e)),
    });
  };
  const campoNumero = (
    <CampoTelefono
      key={version}
      etiqueta="Tu número de WhatsApp"
      valorInicial={w.numero}
      error={error}
      validar={validar}
      onCambio={(v) => {
        setError(undefined);
        setNumero(v);
      }}
    />
  );

  if (variante === 'ajustes') {
    return (
      <>
        {campoNumero}
        <Boton
          cargando={acciones.guardar.isPending}
          // Hasta que el número sea válido; vacío también se puede guardar (borra el número).
          disabled={numero === null || (!numero.valido && !numero.vacio)}
          onClick={() => {
            setValidar(true);
            if (!numero || (!numero.valido && !numero.vacio)) return;
            guardar({ numero: numero.e164 }, numero.e164 ? 'Número guardado.' : 'Número borrado.');
          }}
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
        Tu número: <strong className="tabular">{formatoLegible(w.numero)}</strong>
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
        setValidar(true);
        if (!valor || !valido) return;
        guardar({ numero: valor, consentimiento: acepta });
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
        disabled={!acepta || !valor || !valido}
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
