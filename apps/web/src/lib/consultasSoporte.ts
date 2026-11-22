import type {
  CifrasPlataforma,
  CrearSoporte,
  CuentaParaSoporte,
  EntradaBitacoraSoporte,
  MiembroSoporte,
  SoporteCreado,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Tablero de soporte (docs/15). La API exige cuenta de soporte, permiso y 2FA. */
const base = ['soporte'] as const;

export function usePlataforma() {
  return useQuery({
    queryKey: [...base, 'plataforma'],
    queryFn: () => api<CifrasPlataforma>('/soporte/plataforma'),
  });
}

export function useBuscarCuenta() {
  return useMutation({
    mutationFn: (correo: string) =>
      api<CuentaParaSoporte>('/soporte/cuentas', { consulta: { correo } }),
  });
}

export function useBitacora() {
  return useQuery({
    queryKey: [...base, 'bitacora'],
    queryFn: () => api<EntradaBitacoraSoporte[]>('/soporte/bitacora'),
  });
}

export function useAccionesCuenta() {
  const qc = useQueryClient();
  const listo = () => void qc.invalidateQueries({ queryKey: [...base, 'bitacora'] });
  return {
    desbloquear: useMutation({
      mutationFn: (id: string) =>
        api<CuentaParaSoporte>(`/soporte/cuentas/${id}/desbloquear`, { metodo: 'POST' }),
      onSuccess: listo,
    }),
    verificacion: useMutation({
      mutationFn: (id: string) =>
        api<{ enviado: boolean }>(`/soporte/cuentas/${id}/verificacion`, { metodo: 'POST' }),
      onSuccess: listo,
    }),
  };
}

export function useEquipoSoporte() {
  return useQuery({
    queryKey: [...base, 'equipo'],
    queryFn: () => api<MiembroSoporte[]>('/soporte/equipo'),
  });
}

export function useCrearSoporte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: CrearSoporte) =>
      api<SoporteCreado>('/soporte/equipo', { metodo: 'POST', cuerpo: d }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: base }),
  });
}
