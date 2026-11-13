import type {
  ActualizarTareaPersonal,
  CambiosPerfil,
  CambiosPreferencias,
  ComentarioTarea,
  CrearTareaPersonal,
  Preferencias,
  Subtarea,
  TareaPersonal,
  TareaPersonalDetalle,
  UsuarioSesion,
  Yo,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi } from './api';
import { aplicarPreferencias } from './apariencia';

/** Claves de caché de TanStack Query. */
export const claves = {
  yo: ['yo'] as const,
  tareas: ['personal', 'tareas'] as const,
  tarea: (id: string) => ['personal', 'tareas', id] as const,
  etiquetas: ['personal', 'etiquetas'] as const,
  usuariosDev: ['dev', 'usuarios'] as const,
};

/** Sesión actual: usuario, equipos y perfil en cada uno. `null` si no hay sesión. */
export function useYo() {
  return useQuery({
    queryKey: claves.yo,
    queryFn: async (): Promise<Yo | null> => {
      try {
        return await api<Yo>('/yo');
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useTareas() {
  return useQuery({
    queryKey: claves.tareas,
    queryFn: () => api<TareaPersonal[]>('/personal/tareas'),
  });
}

export function useTarea(id: string | undefined) {
  return useQuery({
    queryKey: claves.tarea(id ?? ''),
    queryFn: () => api<TareaPersonalDetalle>(`/personal/tareas/${id}`),
    enabled: !!id,
  });
}

export function useEtiquetas() {
  return useQuery({
    queryKey: claves.etiquetas,
    queryFn: () => api<string[]>('/personal/etiquetas'),
  });
}

/** Tras cualquier cambio se invalida todo lo personal (lista, detalle y etiquetas). */
function useInvalidarPersonal() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['personal'] });
}

export function useCrearTarea() {
  const invalidar = useInvalidarPersonal();
  return useMutation({
    mutationFn: (datos: Partial<CrearTareaPersonal> & { titulo: string }) =>
      api<TareaPersonalDetalle>('/personal/tareas', { metodo: 'POST', cuerpo: datos }),
    onSuccess: invalidar,
  });
}

export function useActualizarTarea() {
  const invalidar = useInvalidarPersonal();
  return useMutation({
    mutationFn: ({ id, ...cambios }: ActualizarTareaPersonal & { id: string }) =>
      api<TareaPersonalDetalle>(`/personal/tareas/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    // También al fallar: un 409 significa que la copia local quedó vieja.
    onSettled: invalidar,
  });
}

export function useEliminarTarea() {
  const invalidar = useInvalidarPersonal();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/personal/tareas/${id}`, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  });
}

export function useSubtareas(tareaId: string) {
  const invalidar = useInvalidarPersonal();
  const base = `/personal/tareas/${tareaId}/subtareas`;
  return {
    crear: useMutation({
      mutationFn: (titulo: string) => api<Subtarea>(base, { metodo: 'POST', cuerpo: { titulo } }),
      onSuccess: invalidar,
    }),
    actualizar: useMutation({
      mutationFn: ({ id, ...cambios }: { id: string; titulo?: string; hecha?: boolean }) =>
        api<Subtarea>(`${base}/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
      onSuccess: invalidar,
    }),
    eliminar: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { metodo: 'DELETE' }),
      onSuccess: invalidar,
    }),
  };
}

export function useComentarios(tareaId: string) {
  const invalidar = useInvalidarPersonal();
  const base = `/personal/tareas/${tareaId}/comentarios`;
  return {
    crear: useMutation({
      mutationFn: (texto: string) =>
        api<ComentarioTarea>(base, { metodo: 'POST', cuerpo: { texto } }),
      onSuccess: invalidar,
    }),
    eliminar: useMutation({
      mutationFn: (id: string) => api<void>(`${base}/${id}`, { metodo: 'DELETE' }),
      onSuccess: invalidar,
    }),
  };
}

/** Acceso de desarrollo: usuarios de la semilla (solo existe con DEV_LOGIN_ENABLED=true). */
export function useUsuariosDev() {
  return useQuery({
    queryKey: claves.usuariosDev,
    queryFn: () => api<(UsuarioSesion & { cargo: string })[]>('/dev/usuarios'),
    retry: false,
  });
}

export function useDevLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api<{ usuario: UsuarioSesion }>('/dev/login', { metodo: 'POST', cuerpo: { email } }),
    onSuccess: () => qc.clear(),
  });
}

export function useSalir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/salir', { metodo: 'POST' }),
    onSettled: () => qc.clear(),
  });
}

/** Guarda preferencias en el servidor y las aplica al instante en esta pestaña. */
export function useGuardarPreferencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosPreferencias) =>
      api<Preferencias>('/yo/preferencias', { metodo: 'PATCH', cuerpo: cambios }),
    onMutate: (cambios) => aplicarPreferencias(cambios),
    onSuccess: (preferencias) =>
      qc.setQueryData<Yo | null>(claves.yo, (yo) => (yo ? { ...yo, preferencias } : yo)),
  });
}

export function useGuardarPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosPerfil) =>
      api<UsuarioSesion>('/yo/perfil', { metodo: 'PATCH', cuerpo: cambios }),
    onSuccess: (usuario) =>
      qc.setQueryData<Yo | null>(claves.yo, (yo) => (yo ? { ...yo, usuario } : yo)),
  });
}
