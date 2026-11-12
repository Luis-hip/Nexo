/** Máximo de miembros activos (líder + integrantes) por equipo. Lo hace cumplir la BD (NX001). */
export const MAX_MIEMBROS_EQUIPO = 8;

/** Códigos SQLSTATE propios que lanza la base de datos y su mensaje para el usuario. */
export const ERRORES_BD = {
  NX001: 'El equipo ya tiene el máximo de miembros activos.',
  NX002: 'El líder saliente no puede votar en la elección.',
  NX003: 'Ya usaste tus 3 votos en esta retrospectiva.',
} as const;

export type CodigoErrorBd = keyof typeof ERRORES_BD;
