import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Chip, Entrada } from '@/components/ui';

/** Etiquetas de una tarea: quitar, elegir de las ya usadas o escribir una nueva. */
export function EditorEtiquetas({
  valor,
  onChange,
  sugeridas,
  error,
}: {
  valor: string[];
  onChange: (v: string[]) => void;
  sugeridas: string[];
  error?: string;
}) {
  const [nueva, setNueva] = useState('');
  const tiene = (n: string) => valor.some((x) => x.toLowerCase() === n.toLowerCase());
  const agregar = (n: string) => {
    const limpio = n.trim();
    if (limpio && !tiene(limpio)) onChange([...valor, limpio]);
    setNueva('');
  };
  const disponibles = sugeridas.filter((s) => !tiene(s));
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium" id="etiquetas-titulo">
        Etiquetas <span className="font-normal text-muted">(opcional)</span>
      </p>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-labelledby="etiquetas-titulo"
      >
        {valor.map((e) => (
          <Chip
            key={e}
            activo
            onClick={() => onChange(valor.filter((x) => x !== e))}
            aria-label={`Quitar etiqueta ${e}`}
            icono={<X className="size-3.5" aria-hidden />}
          >
            {e}
          </Chip>
        ))}
        {disponibles.map((e) => (
          <Chip
            key={e}
            onClick={() => agregar(e)}
            aria-label={`Agregar etiqueta ${e}`}
            icono={<Plus className="size-3.5" aria-hidden />}
          >
            {e}
          </Chip>
        ))}
        <Entrada
          data-campo="etiquetas"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              agregar(nueva);
            }
          }}
          onBlur={() => agregar(nueva)}
          placeholder="Nueva etiqueta"
          aria-label="Nueva etiqueta"
          maxLength={30}
          className="h-9 w-40"
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger-text">{error}</p>}
    </div>
  );
}
