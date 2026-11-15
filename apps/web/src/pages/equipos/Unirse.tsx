import { normalizarCodigoInvitacion } from '@nexo/shared';
import { AlertTriangle, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Banner, Boton, Campo, Encabezado, Entrada, Esqueleto, Tarjeta } from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import { useAceptarInvitacion, useVistaInvitacion } from '@/lib/consultasEquipo';
import { toast } from '@/lib/toasts';

/**
 * PER-07 / AUTH-08 / AUTH-09: unirse con código o enlace. Muestra una vista previa (equipo,
 * líder, rol) antes de confirmar. Las invitaciones inválidas, caducadas o usadas explican
 * el motivo (AUTH-10) y el equipo lleno, su tope (FALT-06).
 */
export function Unirse() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const buscado = sp.get('codigo') ?? '';
  const [codigo, setCodigo] = useState(buscado);
  const vista = useVistaInvitacion(buscado);
  const aceptar = useAceptarInvitacion();
  const inv = vista.data;
  const lleno =
    !!inv && inv.rol_destino === 'integrante' && inv.miembros_activos >= inv.max_miembros;

  const unirme = () => {
    if (!inv || aceptar.isPending) return;
    aceptar.mutate(inv.codigo, {
      onSuccess: ({ equipo_id, rol }) => {
        toast(`Te uniste a ${inv.equipo.nombre} como ${rol}.`);
        nav(`/app/e/${equipo_id}`);
      },
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-5" data-name="NX/PER-07-Unirse">
      <Encabezado
        titulo="Unirme a un equipo"
        descripcion="Usa el código o el enlace que te compartió el líder."
      />
      <Tarjeta className="space-y-4 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            aceptar.reset();
            setSp({ codigo: normalizarCodigoInvitacion(codigo) }, { replace: true });
          }}
          className="space-y-3"
        >
          <Campo
            etiqueta="Código o enlace"
            error={vista.isError && buscado ? mensajeDeError(vista.error) : undefined}
            ayuda="Por ejemplo NX4-821Q."
          >
            <Entrada
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoFocus
              placeholder="NX4-821Q o enlace de invitación"
              autoCapitalize="characters"
              maxLength={200}
            />
          </Campo>
          <Boton type="submit" bloque disabled={!codigo.trim()} cargando={vista.isFetching}>
            Buscar equipo
          </Boton>
        </form>

        {buscado && vista.isPending && <Esqueleto className="h-32" />}

        {inv && (
          <div
            className="anim-fade space-y-3 rounded-[12px] border border-brand/30 bg-brand/5 p-4"
            data-name={
              inv.rol_destino === 'invitado'
                ? 'NX/AUTH-09-Invitacion-invitado'
                : 'NX/AUTH-08-Invitacion-integrante'
            }
          >
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-[12px] bg-brand/15 text-lg font-semibold text-brand">
                {inv.equipo.nombre.replace('Equipo ', '').charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{inv.equipo.nombre}</p>
                <p className="text-sm text-muted">
                  Líder: {inv.lider ?? 'sin líder'} ·{' '}
                  <span className="tabular">
                    {inv.miembros_activos} de {inv.max_miembros} miembros
                  </span>
                </p>
              </div>
            </div>
            {inv.ya_miembro ? (
              <Banner
                tono="info"
                accion={
                  <Link
                    to={`/app/e/${inv.equipo.id}`}
                    className="text-sm font-medium text-brand underline"
                  >
                    Abrir equipo
                  </Link>
                }
              >
                Ya perteneces a este equipo.
              </Banner>
            ) : lleno ? (
              <Banner tono="warn" icono={<Users />}>
                <span data-name="NX/FALT-06-Equipo-lleno">
                  <strong>El equipo está lleno.</strong> Ya tiene sus {inv.max_miembros} miembros.
                  Pide al líder que libere un lugar o que te invite como invitado.
                </span>
              </Banner>
            ) : (
              <>
                <p className="text-sm">
                  Te unirás como{' '}
                  <strong>
                    {inv.rol_destino === 'invitado'
                      ? `invitado (acceso por ${inv.duracion_invitado_dias ?? 7} días)`
                      : 'integrante'}
                  </strong>
                  .
                </p>
                {inv.rol_destino === 'invitado' && (
                  <p className="text-sm text-muted">
                    Podrás ver y comentar las tareas que el equipo comparta contigo.
                  </p>
                )}
                {aceptar.isError && (
                  <Banner tono="danger" icono={<AlertTriangle />}>
                    {aceptar.error instanceof ErrorApi &&
                    aceptar.error.codigo === 'equipo_lleno' ? (
                      <span data-name="NX/FALT-06-Equipo-lleno">
                        <strong>{mensajeDeError(aceptar.error)}</strong> Alguien ocupó el último
                        lugar. Pide al líder que libere uno.
                      </span>
                    ) : (
                      mensajeDeError(aceptar.error)
                    )}
                  </Banner>
                )}
                <Boton variante="primario" bloque onClick={unirme} cargando={aceptar.isPending}>
                  Confirmar y unirme
                </Boton>
              </>
            )}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

/** `/invitacion/:codigo`: el enlace que comparte el líder lleva a la vista previa (pide sesión). */
export function EnlaceInvitacion() {
  const { codigo = '' } = useParams();
  return <Navigate to={`/app/equipos/unirse?codigo=${encodeURIComponent(codigo)}`} replace />;
}
