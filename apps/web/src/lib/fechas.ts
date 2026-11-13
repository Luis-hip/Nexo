const DIA = 86_400_000;

export function hoy0(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fecha ISO relativa a hoy (fin del día salvo hora explícita). */
export function enDias(n: number, hora = 23, minuto = 59): string {
  const d = hoy0();
  d.setDate(d.getDate() + n);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

export function haceMin(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

export function diasHasta(iso: string): number {
  const d = new Date(iso);
  const a = new Date(d);
  a.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - hoy0().getTime()) / DIA);
}

export function horasHasta(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

let formatoHora: '24h' | '12h' = '24h';
let formatoFecha: 'dd/mm' | 'mm/dd' = 'dd/mm';
export function configurarFormato(h: '24h' | '12h', f: 'dd/mm' | 'mm/dd') {
  formatoHora = h;
  formatoFecha = f;
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  const dia = d.getDate();
  const mes = d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return formatoFecha === 'dd/mm' ? `${dia} ${mes}` : `${mes} ${dia}`;
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: formatoHora === '12h',
  });
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function relativo(iso: string): string {
  const n = diasHasta(iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n > 1) return `en ${n} días`;
  return `hace ${-n} días`;
}

export function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function etiquetaDia(iso: string): string {
  const n = diasHasta(iso);
  if (n === 0) return 'Hoy';
  if (n === -1) return 'Ayer';
  if (n === 1) return 'Mañana';
  const s = fechaLarga(iso);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mismaFecha(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function aInputFecha(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function deInputFecha(v: string, h = 23, m = 59): string | undefined {
  if (!v) return undefined;
  const [y, mo, d] = v.split('-').map(Number);
  return new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h, m).toISOString();
}

export const DIA_MS = DIA;
