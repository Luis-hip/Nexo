import { CheckSquare, CornerDownLeft } from 'lucide-react';
import { useState } from 'react';
import { Buscador, InsigniaEstado, Modal, Vacio } from '@/components/ui';
import { useTareas } from '@/lib/consultas';
import { useAcciones } from './contexto';

/**
 * GL-01: búsqueda global. En la Fase 1 es una búsqueda simple por título entre las
 * tareas personales; mensajes, personas y archivos llegan con sus módulos.
 */
export function Busqueda({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [q, setQ] = useState('');
  const { data: tareas = [] } = useTareas();
  const acc = useAcciones();
  const texto = q.trim().toLowerCase();
  const resultados = texto
    ? tareas.filter((t) => t.titulo.toLowerCase().includes(texto)).slice(0, 8)
    : [];
  const cerrar = () => {
    setQ('');
    onCerrar();
  };
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Buscar" nombre="NX/GL-01-Busqueda">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const primera = resultados[0];
          if (primera) {
            cerrar();
            acc.abrirTarea(primera.id);
          }
        }}
      >
        <Buscador
          valor={q}
          onChange={setQ}
          etiqueta="Buscar tareas"
          placeholder="Buscar tareas por título"
          autoFocus
        />
      </form>
      <div className="mt-3 min-h-40">
        {!texto ? (
          <Vacio compacto titulo="Escribe para buscar en tus tareas" />
        ) : resultados.length === 0 ? (
          <Vacio compacto titulo={`Sin resultados para «${q.trim()}»`} />
        ) : (
          <ul className="divide-y divide-line">
            {resultados.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    cerrar();
                    acc.abrirTarea(t.id);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-[8px] px-2 text-left hover:bg-surface"
                >
                  <CheckSquare className="size-[18px] shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.titulo}</span>
                  <InsigniaEstado estado={t.estado} />
                  {i === 0 && (
                    <CornerDownLeft className="size-4 text-muted" aria-label="Intro para abrir" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
