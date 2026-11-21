import { MAX_BYTES_FOTO, MIME_FOTO } from '@nexo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar, Boton } from '@/components/ui';
import { api, mensajeDeError } from '@/lib/api';
import { claves } from '@/lib/consultas';
import { leerBase64 } from '@/lib/consultasVistas';
import { toast } from '@/lib/toasts';

/** ONB-02 y PF-01: subir, cambiar o quitar la foto de perfil (DEC-037). */
export function FotoPerfil({
  nombre,
  avatarUrl,
  tamano = 64,
}: {
  nombre: string;
  avatarUrl: string | null | undefined;
  tamano?: number;
}) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const guardar = useMutation({
    mutationFn: (cuerpo: { mime: string; contenido_base64: string } | null) =>
      api<{ avatar_url: string | null }>('/yo/foto', { metodo: 'PUT', cuerpo }),
    onSuccess: (r) => {
      toast(r.avatar_url ? 'Foto guardada.' : 'Foto quitada.');
      void qc.invalidateQueries({ queryKey: claves.yo });
    },
    onError: (e) => setError(mensajeDeError(e)),
  });
  const elegir = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (!(MIME_FOTO as readonly string[]).includes(f.type)) {
      return setError('La foto debe ser PNG, JPEG o WebP.');
    }
    if (f.size > MAX_BYTES_FOTO) return setError('La foto debe pesar hasta 1 MB.');
    guardar.mutate({ mime: f.type, contenido_base64: await leerBase64(f) });
    if (entrada.current) entrada.current.value = '';
  };
  return (
    <div className="flex flex-wrap items-center gap-3" data-name="NX/PF-01-Foto">
      <Avatar persona={{ nombre, avatarUrl }} tamano={tamano} />
      <input
        ref={entrada}
        type="file"
        accept={MIME_FOTO.join(',')}
        className="sr-only"
        aria-label="Elegir foto de perfil"
        onChange={(e) => void elegir(e.target.files?.[0])}
      />
      <Boton
        tamano="sm"
        icono={<Camera className="size-4" />}
        cargando={guardar.isPending}
        onClick={() => entrada.current?.click()}
      >
        {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
      </Boton>
      {avatarUrl && (
        <Boton
          tamano="sm"
          variante="texto"
          icono={<Trash2 className="size-4" />}
          onClick={() => guardar.mutate(null)}
        >
          Quitar
        </Boton>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
