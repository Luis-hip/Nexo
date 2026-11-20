import { MAX_BYTES_ARCHIVO, MIME_PERMITIDOS, tamanoLegible, type Archivo } from '@nexo/shared';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Banner,
  Boton,
  BotonIcono,
  Encabezado,
  EsqueletoLista,
  EstadosDatos,
  Insignia,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError, urlApi } from '@/lib/api';
import { leerBase64, useAccionesVistas, useArchivos } from '@/lib/consultasVistas';
import { fechaCorta } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from '../tareas/comunes';

const NOMBRE_TIPO: Record<Archivo['tipo'], string> = {
  pdf: 'PDF',
  imagen: 'Imagen',
  doc: 'Documento',
  hoja: 'Hoja',
  otro: 'ZIP',
};

/** EQ-19: archivos del equipo. Hasta 5 MB y solo los tipos permitidos (la BD lo vuelve a revisar). */
export function Archivos() {
  const { equipo, puede } = useEquipoActual();
  const consulta = useArchivos(equipo.id);
  const { subirArchivo, eliminarArchivo } = useAccionesVistas(equipo.id);
  const confirmar = useConfirmar();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const puedeSubir = puede('adjuntar_archivos').permitido && equipo.estado === 'activo';

  const subir = async (lista: FileList | null) => {
    setError(undefined);
    for (const f of [...(lista ?? [])]) {
      if (!(MIME_PERMITIDOS as readonly string[]).includes(f.type)) {
        setError(`«${f.name}»: ese tipo de archivo no está permitido.`);
        continue;
      }
      if (f.size > MAX_BYTES_ARCHIVO) {
        setError(`«${f.name}» pesa ${tamanoLegible(f.size)}: el máximo es 5 MB.`);
        continue;
      }
      try {
        const contenido_base64 = await leerBase64(f);
        await subirArchivo.mutateAsync({ nombre: f.name, mime: f.type, contenido_base64 });
        toast(`«${f.name}» subido.`);
      } catch (e) {
        setError(mensajeDeError(e));
      }
    }
    if (entrada.current) entrada.current.value = '';
  };

  const eliminar = async (a: Archivo) => {
    const ok = await confirmar({
      titulo: `Eliminar «${a.nombre}»`,
      mensaje: 'El archivo se borra para todo el equipo.',
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (ok) eliminarArchivo.mutate(a.id, { onError: (e) => toast(mensajeDeError(e), 'danger') });
  };

  return (
    <div className="space-y-4" data-name="NX/EQ-19-Archivos">
      <Encabezado
        titulo="Archivos"
        descripcion="PDF, imágenes, documentos y hojas de cálculo de hasta 5 MB."
        acciones={
          puedeSubir ? (
            <>
              <input
                ref={entrada}
                type="file"
                multiple
                className="sr-only"
                accept={MIME_PERMITIDOS.join(',')}
                onChange={(e) => void subir(e.target.files)}
                aria-label="Elegir archivos para subir"
              />
              <Boton
                variante="primario"
                icono={<Upload className="size-4" />}
                cargando={subirArchivo.isPending}
                onClick={() => entrada.current?.click()}
              >
                Subir archivos
              </Boton>
            </>
          ) : undefined
        }
      />
      {error && <Banner tono="danger">{error}</Banner>}
      <EstadosDatos
        consulta={consulta}
        esqueleto={<EsqueletoLista filas={4} />}
        vacio={
          <Vacio
            icono={<FileText />}
            titulo="Aún no hay archivos"
            texto="Sube aquí lo que el equipo necesita tener a mano."
          />
        }
      >
        {(lista) => (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {lista.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.nombre}</span>
                  <span className="text-xs text-muted tabular">
                    {tamanoLegible(a.tamano_bytes)} ·{' '}
                    {a.subido_por?.nombre ?? 'Alguien que ya no está'} · {fechaCorta(a.creado_en)}
                    {a.tarea && ` · ${codigoTarea(a.tarea.codigo)}`}
                  </span>
                </span>
                <Insignia>{NOMBRE_TIPO[a.tipo]}</Insignia>
                <a
                  href={urlApi(`/equipos/${equipo.id}/archivos/${a.id}/descarga`)}
                  className="grid size-9 place-items-center rounded-[8px] hover:bg-surface"
                  aria-label={`Descargar ${a.nombre}`}
                >
                  <Download className="size-4" />
                </a>
                {a.puedo_eliminar && equipo.estado === 'activo' && (
                  <BotonIcono
                    etiqueta={`Eliminar ${a.nombre}`}
                    tamano="sm"
                    onClick={() => void eliminar(a)}
                  >
                    <Trash2 className="size-4" />
                  </BotonIcono>
                )}
              </li>
            ))}
          </ul>
        )}
      </EstadosDatos>
    </div>
  );
}

/**
 * EQ-06 + EQ-19: adjuntos de una tarea, dentro de su detalle (DEC-037). Mismas reglas que la
 * página de archivos: 5 MB, tipos permitidos y el permiso `adjuntar_archivos`.
 */
export function ArchivosTarea({ tareaId }: { tareaId: string }) {
  const { equipo, puede } = useEquipoActual();
  const verArchivos = puede('ver_archivos').permitido;
  const consulta = useArchivos(equipo.id, tareaId, verArchivos);
  const { subirArchivo } = useAccionesVistas(equipo.id);
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const puedeSubir = puede('adjuntar_archivos').permitido && equipo.estado === 'activo';
  if (!verArchivos) return null;

  const subir = async (lista: FileList | null) => {
    setError(undefined);
    for (const f of [...(lista ?? [])]) {
      if (!(MIME_PERMITIDOS as readonly string[]).includes(f.type)) {
        setError(`«${f.name}»: ese tipo de archivo no está permitido.`);
        continue;
      }
      if (f.size > MAX_BYTES_ARCHIVO) {
        setError(`«${f.name}» pesa ${tamanoLegible(f.size)}: el máximo es 5 MB.`);
        continue;
      }
      try {
        const contenido_base64 = await leerBase64(f);
        await subirArchivo.mutateAsync({
          nombre: f.name,
          mime: f.type,
          contenido_base64,
          tarea_id: tareaId,
        });
        toast(`«${f.name}» adjuntado a la tarea.`);
      } catch (e) {
        setError(mensajeDeError(e));
      }
    }
    if (entrada.current) entrada.current.value = '';
  };

  const lista = consulta.data ?? [];
  return (
    <section aria-labelledby="det-archivos" data-name="NX/EQ-06-Archivos-de-la-tarea">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 id="det-archivos" className="text-sm font-semibold">
          Archivos <span className="text-muted tabular">({lista.length})</span>
        </h4>
        {puedeSubir && (
          <>
            <input
              ref={entrada}
              type="file"
              multiple
              className="sr-only"
              accept={MIME_PERMITIDOS.join(',')}
              onChange={(e) => void subir(e.target.files)}
              aria-label="Elegir archivos para adjuntar a la tarea"
            />
            <Boton
              tamano="sm"
              icono={<Upload className="size-4" />}
              cargando={subirArchivo.isPending}
              onClick={() => entrada.current?.click()}
            >
              Adjuntar
            </Boton>
          </>
        )}
      </div>
      {error && <Banner tono="danger">{error}</Banner>}
      {lista.length === 0 ? (
        <p className="text-sm text-muted">Sin archivos adjuntos.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{a.nombre}</span>
              <span className="text-xs text-muted tabular">{tamanoLegible(a.tamano_bytes)}</span>
              <a
                href={urlApi(`/equipos/${equipo.id}/archivos/${a.id}/descarga`)}
                className="grid size-8 place-items-center rounded-[8px] hover:bg-surface"
                aria-label={`Descargar ${a.nombre}`}
              >
                <Download className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
