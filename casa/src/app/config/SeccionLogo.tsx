import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { pedir } from './configApi';

interface DatosLogo {
  actual: { archivo: string; url: string; tipo: string } | null;
  galeria: { nombre: string; url: string }[];
}

const MAX_BYTES = 2 * 1024 * 1024;

const leerArchivo = (archivo: File) =>
  new Promise<string>((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });

/** Logo de la casa. Se aplica al momento, sin pasar por el botón Guardar del formulario. */
export function SeccionLogo() {
  const [datos, setDatos] = useState<DatosLogo | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pedir<DatosLogo>('/api/logo')
      .then(setDatos)
      .catch((e: Error) => setError(e.message));
  }, []);

  const ejecutar = async (accion: () => Promise<DatosLogo>) => {
    setOcupado(true);
    setError('');
    try {
      setDatos(await accion());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const enviar = (cuerpo: object) => pedir<DatosLogo>('/api/logo', { method: 'POST', body: JSON.stringify(cuerpo) });

  const alElegirArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (archivo.size > MAX_BYTES) return setError('El logo no puede pasar de 2 MB.');
    void ejecutar(async () => enviar({ imagen: await leerArchivo(archivo) }));
  };

  return (
    <section className="cfg-grupo">
      <h3>Logo de la casa</h3>
      <p className="cfg-nota">Aparece en la fachada, en el encabezado y en la pestaña del navegador. Se aplica al momento y no se incluye en el paquete para compartir.</p>
      <div className="cfg-logo">
        <div className="cfg-logo-vista">{datos?.actual ? <img src={datos.actual.url} alt="Logo actual de la casa" /> : <span>{datos ? 'Sin logo' : 'Cargando…'}</span>}</div>
        <div className="cfg-logo-acciones">
          <button type="button" className="btn" disabled={ocupado} onClick={() => selector.current?.click()}>
            {ocupado ? 'Aplicando…' : 'Subir imagen'}
          </button>
          <button type="button" className="btn" disabled={ocupado || !datos?.actual} onClick={() => void ejecutar(() => pedir<DatosLogo>('/api/logo', { method: 'DELETE' }))}>
            Quitar logo
          </button>
          <span className="cfg-nota">PNG, WebP o SVG, hasta 2 MB.</span>
        </div>
        <input ref={selector} type="file" hidden accept=".png,.webp,.svg,image/png,image/webp,image/svg+xml" onChange={alElegirArchivo} />
      </div>
      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}
      {!!datos?.galeria.length && (
        <>
          <p className="cfg-nota">O elige uno de la carpeta <code>assets/logos</code>:</p>
          <div className="cfg-logo-galeria">
            {datos.galeria.map((g) => (
              <button key={g.nombre} type="button" title={g.nombre} aria-label={`Usar ${g.nombre}`} disabled={ocupado} onClick={() => void ejecutar(() => enviar({ galeria: g.nombre }))}>
                <img src={g.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
