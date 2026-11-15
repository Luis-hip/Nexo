import { esquemaCrearEquipo, MAX_MIEMBROS_EQUIPO } from '@nexo/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AreaTexto,
  Banner,
  Boton,
  Campo,
  Encabezado,
  Entrada,
  Radios,
  Selector,
  Tarjeta,
  cx,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useCrearEquipo } from '@/lib/consultasEquipo';
import { toast } from '@/lib/toasts';

const PASOS = ['Datos', 'Sprints', 'Miembros', 'Confirmar'] as const;

/**
 * PER-06: crear equipo en 4 pasos (docs/03, 2.1.1): nombre y descripción, duración del sprint,
 * límite de miembros y confirmación. Quien lo crea queda como líder.
 */
export function CrearEquipo() {
  const nav = useNavigate();
  const crear = useCrearEquipo();
  const [paso, setPaso] = useState(1);
  const [v, setV] = useState({
    nombre: '',
    descripcion: '',
    duracion: 2 as 1 | 2 | 3,
    max: MAX_MIEMBROS_EQUIPO,
  });
  const [error, setError] = useState('');

  /** Valida con el mismo esquema que el servidor; devuelve los datos o `null`. */
  const validar = () => {
    const r = esquemaCrearEquipo.safeParse({
      nombre: v.nombre,
      descripcion: v.descripcion,
      duracion_sprint_semanas: v.duracion,
      max_miembros: v.max,
    });
    if (r.success) return r.data;
    const campo = r.error.issues[0]?.path[0];
    setError(r.error.issues[0]?.message ?? 'Revisa los datos.');
    setPaso(campo === 'max_miembros' ? 3 : 1);
    return null;
  };
  const siguiente = () => {
    if (validar()) {
      setError('');
      setPaso(paso + 1);
    }
  };
  const enviar = () => {
    const datos = validar();
    if (!datos || crear.isPending) return;
    crear.mutate(datos, {
      onSuccess: ({ id }) => {
        toast(`Creaste «${datos.nombre}». Ahora eres su líder.`);
        nav(`/app/e/${id}/equipo`);
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5" data-name="NX/PER-06-Crear-equipo">
      <Encabezado titulo="Crear equipo" descripcion={`Paso ${paso} de 4 · ${PASOS[paso - 1]}`} />
      <div className="flex gap-2" aria-hidden>
        {PASOS.map((p, i) => (
          <span
            key={p}
            className={cx('h-1.5 flex-1 rounded-full', i < paso ? 'bg-brand' : 'bg-line')}
          />
        ))}
      </div>
      <Tarjeta className="space-y-4 p-5">
        {paso === 1 && (
          <>
            <Campo etiqueta="Nombre del equipo" error={error}>
              <Entrada
                value={v.nombre}
                onChange={(e) => {
                  setV({ ...v, nombre: e.target.value });
                  setError('');
                }}
                autoFocus
                maxLength={60}
                placeholder="Por ejemplo: Equipo de Redes"
              />
            </Campo>
            <Campo etiqueta="Descripción" opcional>
              <AreaTexto
                value={v.descripcion}
                onChange={(e) => setV({ ...v, descripcion: e.target.value })}
                rows={2}
                maxLength={280}
              />
            </Campo>
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-[14px] bg-brand/12 text-xl font-semibold text-brand">
                {v.nombre.trim().replace('Equipo ', '').charAt(0).toUpperCase() || 'N'}
              </span>
              <p className="text-sm text-muted">El avatar usa la inicial del nombre.</p>
            </div>
          </>
        )}
        {paso === 2 && (
          <Radios
            nombre="duracion"
            etiqueta="Duración del sprint"
            horizontal
            valor={String(v.duracion) as '1' | '2' | '3'}
            onChange={(x) => setV({ ...v, duracion: Number(x) as 1 | 2 | 3 })}
            opciones={[
              { valor: '1', etiqueta: '1 semana' },
              { valor: '2', etiqueta: '2 semanas', descripcion: 'Recomendado' },
              { valor: '3', etiqueta: '3 semanas' },
            ]}
          />
        )}
        {paso === 3 && (
          <>
            <Campo
              etiqueta="Límite de miembros"
              error={error}
              ayuda={`Cuenta al líder y a los integrantes; los invitados no cuentan. Máximo ${MAX_MIEMBROS_EQUIPO}.`}
            >
              <Selector value={v.max} onChange={(e) => setV({ ...v, max: Number(e.target.value) })}>
                {Array.from({ length: MAX_MIEMBROS_EQUIPO }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'miembro (solo tú)' : 'miembros'}
                  </option>
                ))}
              </Selector>
            </Campo>
            <p className="text-sm text-muted">
              Podrás invitar con un enlace o un código cuando el equipo esté creado, desde Equipo.
            </p>
          </>
        )}
        {paso === 4 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Revisa y confirma</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Nombre</dt>
              <dd className="font-medium break-words">{v.nombre.trim()}</dd>
              <dt className="text-muted">Descripción</dt>
              <dd>{v.descripcion.trim() || 'Sin descripción'}</dd>
              <dt className="text-muted">Sprint</dt>
              <dd>
                {v.duracion} {v.duracion === 1 ? 'semana' : 'semanas'}
              </dd>
              <dt className="text-muted">Miembros</dt>
              <dd>Hasta {v.max}, contándote a ti</dd>
              <dt className="text-muted">Tu rol</dt>
              <dd>Líder</dd>
            </dl>
            <p className="text-sm text-muted">
              Tus tareas personales siguen siendo privadas: nada se comparte con el equipo.
            </p>
            {crear.isError && (
              <Banner tono="danger">
                No se pudo crear el equipo. {mensajeDeError(crear.error)}
              </Banner>
            )}
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-line pt-4">
          <Boton onClick={() => (paso === 1 ? nav(-1) : setPaso(paso - 1))}>
            {paso === 1 ? 'Cancelar' : 'Atrás'}
          </Boton>
          {paso < 4 ? (
            <Boton variante="primario" onClick={siguiente}>
              Continuar
            </Boton>
          ) : (
            <Boton variante="primario" onClick={enviar} cargando={crear.isPending}>
              Crear equipo
            </Boton>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
