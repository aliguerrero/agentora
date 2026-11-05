import { useEffect, useRef, useState } from 'react';
import { cambiarProyecto, esDecision, leerProyectos } from './proyectosApi';
import type { Decision, ProyectoResumen } from './proyectosApi';

interface Props {
  onCerrar: () => void;
  onCambiado: (p: { id: string; nombre: string }) => void;
  onGestionar: () => void;
}

/**
 * Se abre al tocar el letrero LED. Cada proyecto es un contexto con su propio equipo. Si el
 * proyecto actual tiene trabajo en marcha o en cola, pregunta si pausarlo o dejarlo en segundo
 * plano (y puede recordar la elección).
 */
export function SelectorProyecto({ onCerrar, onCambiado, onGestionar }: Props) {
  const [proyectos, setProyectos] = useState<ProyectoResumen[] | null>(null);
  const [activo, setActivo] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState<{ destino: ProyectoResumen; d: Decision } | null>(null);
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const primero = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    leerProyectos()
      .then((d) => {
        setProyectos(d.proyectos);
        setActivo(d.activo);
        setTimeout(() => primero.current?.focus(), 0);
      })
      .catch((e: Error) => setError(e.message));
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const ir = async (p: ProyectoResumen, anterior?: 'pausar' | 'segundo-plano') => {
    if (p.id === activo) return onCerrar();
    setOcupado(true);
    setError('');
    try {
      const r = await cambiarProyecto(p.id, anterior, recordar);
      if (esDecision(r)) return setPregunta({ destino: p, d: r });
      onCambiado({ id: p.id, nombre: p.nombre });
      onCerrar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="cfg-fondo centro" onPointerDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="hud selector-proyecto" role="dialog" aria-modal="true" aria-label="Cambiar de proyecto">
        {pregunta ? (
          <>
            <h2>¿Qué hago con «{pregunta.d.proyecto}»?</h2>
            <p className="nota">
              Tiene {pregunta.d.trabajando} {pregunta.d.trabajando === 1 ? 'agente trabajando' : 'agentes trabajando'} y {pregunta.d.enCola}{' '}
              {pregunta.d.enCola === 1 ? 'encargo en cola' : 'encargos en cola'}. Vas a pasar a «{pregunta.destino.nombre}».
            </p>
            <div className="selector-opciones">
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void ir(pregunta.destino, 'segundo-plano')}>
                <b>Dejar en segundo plano</b>
                <span>Su equipo sigue con la cola; te llegan sus avisos.</span>
              </button>
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void ir(pregunta.destino, 'pausar')}>
                <b>Pausar</b>
                <span>No arranca trabajo nuevo; lo que está en marcha termina.</span>
              </button>
            </div>
            <label className="selector-recordar">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar mi elección
            </label>
            <button type="button" className="btn" onClick={() => setPregunta(null)}>
              Volver
            </button>
          </>
        ) : (
          <>
            <h2>¿En qué proyecto trabaja la casa?</h2>
            {!proyectos && !error && <p className="nota">Cargando…</p>}
            <ul>
              {proyectos?.map((p, i) => (
                <li key={p.id}>
                  <button ref={i === 0 ? primero : undefined} type="button" aria-current={p.id === activo} disabled={ocupado} onClick={() => void ir(p)}>
                    <b>
                      {p.nombre}
                      {p.id !== activo && <span className={`selector-estado ${p.estado}`}>{p.estado === 'pausado' ? 'Pausado' : 'En segundo plano'}</span>}
                    </b>
                    <span>
                      {p.empleados} {p.empleados === 1 ? 'agente' : 'agentes'} · {p.trabajando} trabajando · {p.enCola} en cola
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="selector-error">{error}</p>}
            <div className="cfg-fila">
              <button type="button" className="btn" onClick={onGestionar}>
                Gestionar proyectos
              </button>
              <button type="button" className="btn" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
