import { useId, useState } from 'react';
import { pedir } from './configApi';

interface Props {
  etiqueta: string;
  valor: string;
  requerido?: boolean;
  onCambio: (ruta: string) => void;
}

/** Ruta de una carpeta: se escribe o se busca con el explorador, que abre el servidor en este equipo. */
export function CampoCarpeta({ etiqueta, valor, requerido, onCambio }: Props) {
  const id = useId();
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  // Por el túnel el explorador se abriría en el equipo de la oficina, no en este dispositivo.
  const enEsteEquipo = ['127.0.0.1', 'localhost'].includes(window.location.hostname);

  const buscar = async () => {
    setBuscando(true);
    setError('');
    try {
      const { ruta } = await pedir<{ ruta: string }>('/api/sistema/elegir-carpeta', { method: 'POST' });
      if (ruta) onCambio(ruta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="cfg-carpeta">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="cfg-nombre-fila">
        <input id={id} value={valor} required={requerido} onChange={(e) => onCambio(e.target.value)} placeholder="Ruta completa de la carpeta" spellCheck={false} />
        {enEsteEquipo && (
          <button type="button" className="btn" disabled={buscando} onClick={() => void buscar()}>
            {buscando ? 'Abierto…' : 'Buscar…'}
          </button>
        )}
      </div>
      {buscando && <p className="cfg-nota">Elige la carpeta en la ventana del explorador. Si no la ves, mira en la barra de tareas.</p>}
      {!enEsteEquipo && <p className="cfg-nota">Desde otro dispositivo, escribe la ruta tal como existe en el equipo de la oficina.</p>}
      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
