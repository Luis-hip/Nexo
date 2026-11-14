import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  texto: string;
  tono: 'ok' | 'info' | 'warn' | 'danger';
  deshacer?: () => void;
}

let lista: Toast[] = [];
let siguiente = 1;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function cerrarToast(id: number) {
  lista = lista.filter((t) => t.id !== id);
  avisar();
}

/** Muestra un aviso breve (confirmaciones y errores de acciones). Se cierra solo. */
export function toast(texto: string, tono: Toast['tono'] = 'ok', deshacer?: () => void) {
  const id = siguiente++;
  lista = [...lista.slice(-2), { id, texto, tono, deshacer }];
  avisar();
  setTimeout(() => cerrarToast(id), deshacer ? 7000 : 4500);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => lista,
  );
}
