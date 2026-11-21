import type {
  CodigosRespaldo,
  CuentaAuth,
  Entrar,
  EstadoDosPasos,
  InicioDosPasos,
  PideDosPasos,
  Registro,
  SegundoPaso,
  UsuarioSesion,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Autenticación real (Fase 5.1). Al entrar o registrarse se limpia toda la caché: lo que hubiera
 * de otra sesión no debe verse.
 */
const claveCuenta = ['auth', 'cuenta'] as const;

export function useRegistro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Registro) =>
      api<{ usuario: UsuarioSesion }>('/auth/registro', { metodo: 'POST', cuerpo: datos }),
    onSuccess: () => qc.clear(),
  });
}

export function useEntrar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Entrar) =>
      api<{ usuario: UsuarioSesion } | PideDosPasos>('/auth/entrar', {
        metodo: 'POST',
        cuerpo: datos,
      }),
    // Con la 2FA activa aún no hay sesión: la caché se limpia al completar el segundo paso.
    onSuccess: (r) => {
      if ('usuario' in r) qc.clear();
    },
  });
}

// --- AUTH-07 · Verificación en dos pasos ---------------------------------------------------------

const claveDosPasos = ['auth', 'dos-pasos'] as const;

/** Segundo paso del inicio de sesión (contraseña o Google). */
export function useSegundoPaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: SegundoPaso) =>
      api<{ usuario: UsuarioSesion }>('/auth/2fa', { metodo: 'POST', cuerpo: datos }),
    onSuccess: () => qc.clear(),
  });
}

export function useDosPasos() {
  return useQuery({ queryKey: claveDosPasos, queryFn: () => api<EstadoDosPasos>('/auth/2fa') });
}

export function useAccionesDosPasos() {
  const qc = useQueryClient();
  const listo = (estado: EstadoDosPasos) => {
    qc.setQueryData(claveDosPasos, estado);
    void qc.invalidateQueries({ queryKey: claveCuenta });
  };
  return {
    iniciar: useMutation({
      mutationFn: () => api<InicioDosPasos>('/auth/2fa/iniciar', { metodo: 'POST' }),
    }),
    confirmar: useMutation({
      mutationFn: (codigo: string) =>
        api<CodigosRespaldo>('/auth/2fa/confirmar', { metodo: 'POST', cuerpo: { codigo } }),
      onSuccess: (r) => listo(r.estado),
    }),
    respaldo: useMutation({
      mutationFn: (codigo: string) =>
        api<CodigosRespaldo>('/auth/2fa/respaldo', { metodo: 'POST', cuerpo: { codigo } }),
      onSuccess: (r) => listo(r.estado),
    }),
    desactivar: useMutation({
      mutationFn: (codigo: string) =>
        api<EstadoDosPasos>('/auth/2fa/desactivar', { metodo: 'POST', cuerpo: { codigo } }),
      onSuccess: listo,
    }),
  };
}

export function useRecuperar() {
  return useMutation({
    mutationFn: (correo: string) =>
      api<{ mensaje: string }>('/auth/recuperar', { metodo: 'POST', cuerpo: { correo } }),
  });
}

export function useRestablecer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { token: string; contrasena: string }) =>
      api<{ restablecida: boolean }>('/auth/restablecer', { metodo: 'POST', cuerpo: datos }),
    // Todas las sesiones de la cuenta se cerraron.
    onSuccess: () => qc.clear(),
  });
}

export function useVerificarCorreo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<{ verificado: boolean }>('/auth/verificar', { metodo: 'POST', cuerpo: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveCuenta }),
  });
}

export function useCuenta() {
  return useQuery({ queryKey: claveCuenta, queryFn: () => api<CuentaAuth>('/auth/cuenta') });
}

export function useReenviarVerificacion() {
  return useMutation({
    mutationFn: () => api<{ verificado: boolean }>('/auth/verificacion', { metodo: 'POST' }),
  });
}

export function useCambiarContrasena() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { actual: string; nueva: string }) =>
      api<{ cambiada: boolean; sesiones_cerradas: number }>('/auth/contrasena', {
        metodo: 'POST',
        cuerpo: datos,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveCuenta }),
  });
}
