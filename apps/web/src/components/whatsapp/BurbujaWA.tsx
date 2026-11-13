import { Check } from 'lucide-react';

/**
 * WA-03: vista previa de un mensaje tal como se ve en WhatsApp.
 * justificado: usa los colores propios de WhatsApp (no los tokens de Nexo) a propósito, para
 * que se reconozca como una burbuja de esa app en tema claro y oscuro.
 */
export function BurbujaWA({
  texto,
  hora,
  grupo,
}: {
  texto: string;
  hora?: string;
  grupo?: string;
}) {
  return (
    <div
      className="rounded-[12px] p-3"
      style={{ background: 'color-mix(in oklab, #e5ddd5 70%, var(--bg-surface))' }}
      data-name="NX/WA-03-Burbuja-whatsapp"
    >
      {grupo && <p className="mb-1.5 text-center text-[11px] text-[#54656f]">{grupo}</p>}
      <div className="relative ml-auto w-fit max-w-[92%] rounded-[10px] rounded-tr-[2px] bg-[#d9fdd3] px-3 py-2 text-[14px] leading-snug text-[#111b21] shadow-sm">
        <p className="mb-0.5 text-[12px] font-semibold text-[#1f7a5a]">Nexo · avisos</p>
        <p className="break-words whitespace-pre-wrap">{texto}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
          {hora ?? 'ahora'} <Check className="size-3" aria-hidden />
        </p>
      </div>
    </div>
  );
}
