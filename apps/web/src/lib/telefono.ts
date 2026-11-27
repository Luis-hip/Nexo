import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js';

/**
 * Teléfono con la lada aparte (retroalimentación, bloque 3). El contrato con la API no cambia:
 * se sigue enviando E.164 (`+` + lada + número), que es lo que valida `proc_wa_usuario_guardar`.
 * Para México se compone `+52` + 10 dígitos, el formato de la semilla; los números guardados con
 * el formato antiguo `+521…` se leen igual (la BD los compara normalizados, P-13).
 */

export type Pais = CountryCode;

export interface OpcionPais {
  pais: Pais;
  nombre: string;
  lada: string;
}

export const PAIS_DEFECTO: Pais = 'MX';

const nombres = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    return null;
  }
})();

const nombreDe = (p: Pais) => nombres?.of(p) ?? p;

/** Países con su lada, ordenados por nombre; México va primero por ser el más común. */
export const PAISES: OpcionPais[] = getCountries()
  .map((pais) => ({ pais, nombre: nombreDe(pais), lada: getCountryCallingCode(pais) }))
  .sort((a, b) =>
    a.pais === PAIS_DEFECTO
      ? -1
      : b.pais === PAIS_DEFECTO
        ? 1
        : a.nombre.localeCompare(b.nombre, 'es'),
  );

export const ladaDe = (pais: Pais) => getCountryCallingCode(pais);
export const opcionDe = (pais: Pais) =>
  PAISES.find((o) => o.pais === pais) ?? { pais, nombre: nombreDe(pais), lada: ladaDe(pais) };

/** Busca por nombre (sin acentos), siglas o lada («52», «+52»). */
export function buscarPaises(texto: string): OpcionPais[] {
  const q = sinAcentos(texto.trim().toLowerCase()).replace(/^\+/, '');
  if (!q) return PAISES;
  return PAISES.filter(
    (o) =>
      sinAcentos(o.nombre.toLowerCase()).includes(q) ||
      o.pais.toLowerCase() === q ||
      o.lada.startsWith(q),
  );
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Quita espacios, guiones, puntos y paréntesis; deja dígitos (y el `+` inicial si lo hay). */
export function limpiar(texto: string): string {
  const t = texto.trim();
  const mas = t.startsWith('+') || t.startsWith('00');
  const digitos = t.replace(/\D/g, '');
  return mas ? '+' + (t.startsWith('00') ? digitos.slice(2) : digitos) : digitos;
}

/** Dígitos que lleva el número sin lada en México. */
export const DIGITOS_MX = 10;

/**
 * México: el número a 10 dígitos a partir de lo que siga a la lada 52. Acepta el formato antiguo
 * de celulares (`1` + 10 dígitos). Devuelve `null` si no encaja.
 */
function nacionalMx(trasLada: string): string | null {
  if (trasLada.length === DIGITOS_MX) return trasLada;
  if (trasLada.length === DIGITOS_MX + 1 && trasLada.startsWith('1')) return trasLada.slice(1);
  return null;
}

export interface Telefono {
  pais: Pais;
  /** Solo dígitos, sin lada. */
  numero: string;
}

/**
 * Separa la lada de lo que la persona escribió o pegó, si se reconoce. Con `+` (o `00`) se toma la
 * lada del propio texto; sin él, se quita la lada del país elegido solo si el texto la trae de más
 * (por ejemplo `5215512345678` con México). Si nada se reconoce, se queda el país actual.
 *
 * Con `+` y un número aún incompleto devuelve `null` (se sigue escribiendo), salvo con
 * `aproximar`, que separa lo que pueda (se usa al salir del campo y al cargar un número guardado).
 */
export function separar(texto: string, paisActual: Pais, aproximar = true): Telefono | null {
  const limpio = limpiar(texto);
  if (limpio.startsWith('+')) {
    const digitos = limpio.slice(1);
    if (digitos.startsWith('52')) {
      const mx = nacionalMx(digitos.slice(2));
      if (mx !== null) return { pais: 'MX', numero: mx };
    }
    const p = parsePhoneNumberFromString(limpio);
    if (p && (aproximar || p.isValid())) {
      const pais =
        p.country ??
        (ladaDe(paisActual) === p.countryCallingCode
          ? paisActual
          : (PAISES.find((o) => o.lada === p.countryCallingCode)?.pais ?? paisActual));
      return { pais, numero: p.nationalNumber };
    }
    return aproximar ? { pais: paisActual, numero: '' } : null;
  }
  const lada = ladaDe(paisActual);
  if (paisActual === 'MX') {
    if (limpio.length > DIGITOS_MX && limpio.startsWith(lada)) {
      const mx = nacionalMx(limpio.slice(lada.length));
      if (mx !== null) return { pais: 'MX', numero: mx };
    }
    return { pais: 'MX', numero: limpio };
  }
  if (
    limpio.startsWith(lada) &&
    !isValidPhoneNumber(limpio, paisActual) &&
    isValidPhoneNumber(limpio.slice(lada.length), paisActual)
  ) {
    return { pais: paisActual, numero: limpio.slice(lada.length) };
  }
  return { pais: paisActual, numero: limpio };
}

/** ¿Cabe un dígito más? Evita escribir números más largos de lo posible para el país. */
export function demasiadoLargo(numero: string, pais: Pais): boolean {
  if (pais === 'MX') return numero.length > DIGITOS_MX;
  return (
    numero.length > 15 - ladaDe(pais).length ||
    validatePhoneNumberLength(numero, pais) === 'TOO_LONG'
  );
}

export function esValido({ pais, numero }: Telefono): boolean {
  if (!numero) return false;
  if (pais === 'MX') return /^\d{10}$/.test(numero);
  return isValidPhoneNumber(numero, pais);
}

/** E.164, el formato que espera la API (`+5215…` deja de escribirse; se escribe `+52` + 10). */
export function aE164({ pais, numero }: Telefono): string {
  return `+${ladaDe(pais)}${numero}`;
}

/** Descompone un número guardado (E.164) para prellenar los dos controles. */
export function desdeE164(valor: string | null | undefined): Telefono {
  if (!valor) return { pais: PAIS_DEFECTO, numero: '' };
  return separar(valor, PAIS_DEFECTO) ?? { pais: PAIS_DEFECTO, numero: '' };
}

/** Para mostrar un número guardado: `+52 55 1234 5678`. */
export function formatoLegible(valor: string): string {
  const t = desdeE164(valor);
  const p = parsePhoneNumberFromString(aE164(t));
  return p?.formatInternational() ?? valor;
}

/** Texto de ayuda según el país elegido. */
export function ayudaPara(pais: Pais): string {
  return pais === 'MX'
    ? 'Escribe solo tu número a 10 dígitos, sin lada. Solo se usa para los avisos de Nexo.'
    : `Escribe tu número sin la lada (+${ladaDe(pais)}). Solo se usa para los avisos de Nexo.`;
}

/** Mensaje de error según el país elegido (vacío si el número es válido). */
export function errorPara(t: Telefono): string | undefined {
  if (esValido(t)) return undefined;
  if (t.pais === 'MX') return 'Escribe los 10 dígitos de tu número, sin lada.';
  if (!t.numero) return 'Escribe tu número, sin lada.';
  return `Revisa el número: no parece válido para ${opcionDe(t.pais).nombre}.`;
}
