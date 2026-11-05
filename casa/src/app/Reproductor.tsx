import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

export interface Pista {
  nombre: string;
  url: string;
}

interface Props {
  /** URLs directas de la configuración (además de la carpeta musica/). */
  urls: string[];
  volumen: number;
  aleatorio: boolean;
  pausarOculta: boolean;
}

const CLAVE = 'oficina-musica-pista';
const leerIndice = () => {
  try {
    return Number(localStorage.getItem(CLAVE)) || 0;
  } catch {
    return 0;
  }
};
const guardarIndice = (n: number) => {
  try {
    localStorage.setItem(CLAVE, String(n));
  } catch {
    /* sin almacenamiento: no se recuerda la pista */
  }
};

const nombreDeUrl = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname.split('/').pop() || u).replace(/\.[^.]+$/, '');
  } catch {
    return u;
  }
};

/**
 * Música de fondo de la casa. El navegador no deja sonar audio sin un toque previo, así que
 * empieza en pausa hasta que el titular pulsa ▶. Se pausa sola con la pestaña oculta (si así
 * se configuró) y retoma al volver solo si estaba sonando.
 */
export function Reproductor({ urls, volumen, aleatorio, pausarOculta }: Props) {
  const [archivos, setArchivos] = useState<Pista[]>([]);
  const [indice, setIndice] = useState(leerIndice);
  const [sonando, setSonando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pausadaPorOcultar = useRef(false);

  useEffect(() => {
    api('/api/musica')
      .then((r) => (r.ok ? r.json() : { pistas: [] }))
      .then((d: { pistas: Pista[] }) => setArchivos(d.pistas ?? []))
      .catch(() => setArchivos([]));
  }, []);

  const lista = useMemo<Pista[]>(() => [...archivos, ...urls.map((u) => ({ nombre: nombreDeUrl(u), url: u }))], [archivos, urls]);
  const actual = lista.length ? lista[((indice % lista.length) + lista.length) % lista.length] : undefined;

  const ir = useCallback(
    (paso: 1 | -1) => {
      if (!lista.length) return;
      setError('');
      setIndice((i) => {
        let n = aleatorio && lista.length > 1 ? Math.floor(Math.random() * lista.length) : i + paso;
        if (aleatorio && lista.length > 1 && n === i) n = (i + 1) % lista.length;
        const fin = ((n % lista.length) + lista.length) % lista.length;
        guardarIndice(fin);
        return fin;
      });
    },
    [lista.length, aleatorio],
  );

  useEffect(() => {
    if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volumen / 100));
  }, [volumen, actual?.url]);

  // Al cambiar de pista, sigue sonando si ya sonaba.
  useEffect(() => {
    const a = audio.current;
    if (!a || !actual) return;
    if (sonando) a.play().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.url]);

  useEffect(() => {
    if (!pausarOculta) return;
    const alCambiar = () => {
      const a = audio.current;
      if (!a) return;
      if (document.hidden && !a.paused) {
        pausadaPorOcultar.current = true;
        a.pause();
      } else if (!document.hidden && pausadaPorOcultar.current) {
        pausadaPorOcultar.current = false;
        a.play().catch(() => setSonando(false));
      }
    };
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, [pausarOculta]);

  const alternar = () => {
    const a = audio.current;
    if (!a || !actual) return;
    if (a.paused) {
      setError('');
      a.play().catch((e: Error) => setError(e.message));
    } else a.pause();
  };

  if (!lista.length) {
    return (
      <div className="hud musica vacia" title="Pon archivos de audio en la carpeta musica/ de la oficina o agrega URLs en Configuración › Casa">
        ♪ Sin pistas
      </div>
    );
  }

  return (
    <div className={abierto ? 'hud musica abierta' : 'hud musica'}>
      <audio
        ref={audio}
        src={actual?.url}
        preload="metadata"
        onPlay={() => setSonando(true)}
        onPause={() => {
          if (!pausadaPorOcultar.current) setSonando(false);
        }}
        onEnded={() => ir(1)}
        onError={() => {
          setError('No se pudo reproducir esta pista');
          if (lista.length > 1 && sonando) setTimeout(() => ir(1), 1500);
        }}
      />
      <button type="button" className="musica-btn" onClick={() => ir(-1)} aria-label="Pista anterior">
        ⏮
      </button>
      <button type="button" className="musica-btn principal" onClick={alternar} aria-label={sonando ? 'Pausar música' : 'Reproducir música'}>
        {sonando ? '⏸' : '▶'}
      </button>
      <button type="button" className="musica-btn" onClick={() => ir(1)} aria-label="Pista siguiente">
        ⏭
      </button>
      <button type="button" className="musica-titulo" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} title={error || actual?.nombre}>
        <span className={sonando ? 'eq on' : 'eq'} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="musica-nombre">{error || actual?.nombre}</span>
      </button>
      {abierto && (
        <ol className="musica-lista">
          {lista.map((p, i) => (
            <li key={p.url}>
              <button
                type="button"
                aria-current={p.url === actual?.url}
                onClick={() => {
                  setIndice(i);
                  guardarIndice(i);
                  setError('');
                  const a = audio.current;
                  if (a) setTimeout(() => a.play().catch((e: Error) => setError(e.message)), 0);
                }}
              >
                {p.nombre}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
