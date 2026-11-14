import type { Preferencias } from '@nexo/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { TemaResuelto } from './color';
import { configurarFormato } from './fechas';

/**
 * Apariencia aplicada en esta pestaña. La fuente de verdad es `preferencias_usuario` (GET /yo);
 * se copia a localStorage para que las páginas sin sesión y la primera pintura usen el mismo tema.
 */
export interface Apariencia {
  tema: 'sistema' | 'claro' | 'oscuro';
  densidad: 'comoda' | 'compacta';
  tamanoTexto: 'pequeno' | 'normal' | 'grande';
  reducirMovimiento: boolean;
  formatoHora: '24h' | '12h';
  formatoFecha: 'dd/mm' | 'mm/dd';
}

const CLAVE = 'nexo.apariencia';
const POR_DEFECTO: Apariencia = {
  tema: 'sistema',
  densidad: 'comoda',
  tamanoTexto: 'normal',
  reducirMovimiento: false,
  formatoHora: '24h',
  formatoFecha: 'dd/mm',
};

function leer(): Apariencia {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') };
  } catch {
    return POR_DEFECTO;
  }
}

let actual = leer();
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

export function guardarApariencia(cambios: Partial<Apariencia>) {
  actual = { ...actual, ...cambios };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura lo que la pestaña.
  }
  oyentes.forEach((f) => f());
}

/** Aplica preferencias del servidor (nombres de la BD) a la apariencia local. */
export function aplicarPreferencias(p: Partial<Preferencias>) {
  guardarApariencia({
    ...(p.tema !== undefined && { tema: p.tema }),
    ...(p.densidad !== undefined && { densidad: p.densidad }),
    ...(p.tamano_texto !== undefined && { tamanoTexto: p.tamano_texto }),
    ...(p.reducir_movimiento !== undefined && { reducirMovimiento: p.reducir_movimiento }),
    ...(p.formato_hora !== undefined && { formatoHora: p.formato_hora }),
    ...(p.formato_fecha !== undefined && { formatoFecha: p.formato_fecha }),
  });
}

export function useApariencia(): Apariencia {
  return useSyncExternalStore(suscribir, () => actual);
}

function useSistemaOscuro() {
  const [oscuro, setOscuro] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const h = (e: MediaQueryListEvent) => setOscuro(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return oscuro;
}

/** Tema efectivo (resuelve «sistema»). */
export function useTema(): TemaResuelto {
  const { tema } = useApariencia();
  const sistemaOscuro = useSistemaOscuro();
  return tema === 'sistema' ? (sistemaOscuro ? 'oscuro' : 'claro') : tema;
}

/** Sincroniza tema, densidad, tamaño de texto y movimiento con <html>. Se usa una vez, en la raíz. */
export function useSincronizarApariencia() {
  const p = useApariencia();
  const tema = useTema();
  configurarFormato(p.formatoHora, p.formatoFecha);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = tema === 'oscuro' ? 'dark' : 'light';
    el.dataset.density = p.densidad;
    el.dataset.motion = p.reducirMovimiento ? 'reducido' : 'normal';
    el.style.setProperty(
      '--font-scale',
      p.tamanoTexto === 'pequeno' ? '0.9375' : p.tamanoTexto === 'grande' ? '1.125' : '1',
    );
  }, [tema, p.densidad, p.reducirMovimiento, p.tamanoTexto]);
}
