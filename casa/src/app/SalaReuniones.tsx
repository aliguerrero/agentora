import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { actasPendientes, convocarReunion, decidirActa } from './api';
import type { ActaPendiente, Casa } from './api';

const MAX_PARTICIPANTES = 5;

interface Turno {
  clave: number;
  nombre: string;
  texto: string;
  vivo: boolean;
}

interface Props {
  casa: Casa;
  abierta: boolean;
  onCerrar: () => void;
  /** Empezó o terminó una reunión lanzada desde este panel. */
  onEnCurso: (enCurso: boolean) => void;
}

/**
 * La sala de reuniones: el titular convoca, los participantes van a la mesa y debaten por turnos, la
 * secretaría redacta el acta y el titular decide. Siempre
 * está montada: cerrar el panel no corta la reunión, y la reunión sí se corta si se pierde la conexión.
 */
export function SalaReuniones({ casa, abierta, onCerrar, onEnCurso }: Props) {
  const [tema, setTema] = useState('');
  const [rondas, setRondas] = useState(2);
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [actas, setActas] = useState<ActaPendiente[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [decidiendo, setDecidiendo] = useState(false);
  const corte = useRef<AbortController | null>(null);
  const lista = useRef<HTMLDivElement>(null);

  const traerActas = useCallback(() => {
    actasPendientes()
      .then(setActas)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (abierta) traerActas();
  }, [abierta, traerActas, casa.proyecto?.id]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [turnos]);

  // Salir de la página corta la reunión: el navegador lo avisa antes.
  useEffect(() => {
    if (!enCurso) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [enCurso]);

  // Por defecto: el gerente y los jefes.
  const porDefecto = casa.agentes.filter((a) => ['gerente', 'jefe'].includes(casa.roles[a.id] ?? '')).map((a) => a.id).slice(0, MAX_PARTICIPANTES);
  const participantes = (elegidos ?? porDefecto).filter((id) => casa.agentes.some((a) => a.id === id));

  const alternar = (id: string) => setElegidos(participantes.includes(id) ? participantes.filter((x) => x !== id) : [...participantes, id]);

  const empezar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setTurnos([]);
    setEnCurso(true);
    onEnCurso(true);
    const control = new AbortController();
    corte.current = control;
    try {
      await convocarReunion(
        { tema: tema.trim(), participantes, rondas },
        (ev) => {
          if (ev.tipo === 'turno') {
            const nombre = ev.empleado === 'acta' ? 'Secretaría · acta' : `${ev.nombre} · ronda ${ev.ronda}`;
            setTurnos((t) => [...t, { clave: t.length, nombre, texto: '', vivo: true }]);
          } else if (ev.tipo === 'texto') {
            setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, texto: x.texto + (ev.delta ?? '') } : x)));
          } else if (ev.tipo === 'intervencion') {
            setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, texto: ev.texto ?? x.texto, vivo: false } : x)));
          } else if (ev.tipo === 'fin') {
            setTurnos((t) => t.map((x) => ({ ...x, vivo: false })));
            setTema('');
          } else if (ev.tipo === 'error') {
            setError(ev.texto ?? 'La reunión falló.');
          }
        },
        control.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(`La reunión falló: ${(err as Error).message}`);
    } finally {
      corte.current = null;
      setEnCurso(false);
      onEnCurso(false);
      traerActas();
    }
  };

  const cancelar = () => {
    if (window.confirm('¿Cancelar la reunión? Se pierde lo debatido y no queda acta.')) corte.current?.abort();
  };

  const decidir = async (archivo: string, decision: 'aprobada' | 'rechazada') => {
    setDecidiendo(true);
    setError('');
    try {
      await decidirActa(archivo, decision, notas[archivo] ?? '');
      traerActas();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDecidiendo(false);
    }
  };

  if (!abierta) return null;
  const ajena = !enCurso && casa.reunion;

  return (
    <aside className="hud detalle panel-orden panel-reunion" aria-label="Sala de reuniones">
      <div className="panel-orden-cabeza">
        <div>
          <h2>Sala de reuniones</h2>
          <div className="sub">{enCurso ? tema : 'Debaten por turnos y la secretaría redacta el acta.'}</div>
        </div>
        <button type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </div>

      {error && (
        <p className="cfg-aviso error" role="alert">
          {error}
        </p>
      )}

      {turnos.length > 0 && (
        <div className="chat" ref={lista} aria-live="polite">
          {turnos.map((t) => (
            <div key={t.clave} className={t.vivo ? 'reunion-turno vivo' : 'reunion-turno'}>
              <small>{t.nombre}</small>
              <p>{t.texto || 'Tomando la palabra…'}</p>
            </div>
          ))}
        </div>
      )}

      {enCurso && (
        <button type="button" className="btn" onClick={cancelar}>
          Cancelar reunión
        </button>
      )}

      {!enCurso && actas.length > 0 && (
        <div className="reunion-actas">
          {actas.map((a) => (
            <section key={a.archivo}>
              <h3>Acta por decidir: {a.tema}</h3>
              <p className="reunion-acta">{a.acta}</p>
              <input aria-label={`Nota para ${a.tema}`} placeholder="Nota (opcional)" value={notas[a.archivo] ?? ''} onChange={(e) => setNotas({ ...notas, [a.archivo]: e.target.value })} />
              <div className="acciones">
                <button type="button" className="btn principal" disabled={decidiendo} onClick={() => void decidir(a.archivo, 'aprobada')}>
                  Aprobar
                </button>
                <button type="button" className="btn" disabled={decidiendo} onClick={() => void decidir(a.archivo, 'rechazada')}>
                  Rechazar
                </button>
              </div>
              <small className="sub">Al aprobarla, el gerente la ejecuta solo.</small>
            </section>
          ))}
        </div>
      )}

      {ajena && <p className="sub">Hay una reunión en curso sobre «{casa.reunion?.tema}», abierta en otra ventana.</p>}

      {!enCurso && !ajena && (
        <form className="reunion-form" onSubmit={(e) => void empezar(e)}>
          <label>
            Tema
            <textarea value={tema} required minLength={5} maxLength={300} rows={2} onChange={(e) => setTema(e.target.value)} />
          </label>
          <fieldset>
            <legend>
              Participantes ({participantes.length} de {MAX_PARTICIPANTES})
            </legend>
            {casa.agentes.map((a) => (
              <label key={a.id}>
                <input type="checkbox" checked={participantes.includes(a.id)} disabled={!participantes.includes(a.id) && participantes.length >= MAX_PARTICIPANTES} onChange={() => alternar(a.id)} />
                <span>
                  {a.nombre} <small>{a.rol}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Rondas
            <select value={rondas} onChange={(e) => setRondas(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button type="submit" className="btn principal" disabled={participantes.length < 2 || tema.trim().length < 5}>
            Empezar reunión
          </button>
          <small className="sub">Cada intervención y el acta gastan cuota de motor.</small>
        </form>
      )}
    </aside>
  );
}
