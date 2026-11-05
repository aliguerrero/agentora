import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AgenteOficina, EstadoAgente } from '@jules/oficina';
import { conversar, historial } from './api';
import type { MensajeChat } from './api';

const TITULO: Record<EstadoAgente, string> = {
  trabajando: 'Trabajando',
  esperando_decision: 'Espera tu respuesta',
  libre: 'Libre',
};

const SUGERENCIAS = ['¿En qué estás ahora?', '¿Qué te bloquea?', 'Resume tu último informe'];

interface Props {
  agente: AgenteOficina;
  departamento: string;
  onCerrar: () => void;
}

/** Panel del empleado tocado: puesto, estado y conversación real con él (/api/chat). */
export function PanelAgente({ agente, departamento, onCerrar }: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [actividad, setActividad] = useState('');
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    setMensajes([]);
    historial(agente.id)
      .then((h) => vivo && setMensajes(h.mensajes.slice(-12)))
      .catch(() => vivo && setMensajes([]));
    return () => {
      vivo = false;
    };
  }, [agente.id]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes, parcial, actividad]);

  const enviar = async (orden: string) => {
    const mensaje = orden.trim();
    if (!mensaje || enviando) return;
    setTexto('');
    setEnviando(true);
    setParcial('');
    setActividad('Pensando…');
    setMensajes((m) => [...m, { rol: 'ali', texto: mensaje }]);
    try {
      const final = await conversar(agente.id, mensaje, (p, act) => {
        setParcial(p);
        if (act) setActividad(act);
      });
      setMensajes((m) => [...m, { rol: 'agente', texto: final || '(sin respuesta)' }]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'error', texto: `No se pudo enviar: ${(e as Error).message}` }]);
    } finally {
      setEnviando(false);
      setParcial('');
      setActividad('');
    }
  };

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    void enviar(texto);
  };

  return (
    <aside className="hud detalle panel-orden" aria-label={`Panel de ${agente.nombre}`}>
      <div className="panel-orden-cabeza">
        <div>
          <h2>{agente.nombre}</h2>
          <div className="sub">
            {agente.rol}
            {departamento ? ` · ${departamento}` : ''}
          </div>
        </div>
        <button type="button" className="btn-cerrar" onClick={onCerrar} aria-label="Cerrar panel">
          ×
        </button>
      </div>
      <div className={`estado estado-${agente.estado}`} aria-live="polite">
        <strong>{TITULO[agente.estado]}</strong>
        <span>{agente.tarea}</span>
      </div>
      {agente.estado === 'esperando_decision' && <p className="sub">Contéstale aquí abajo: su pregunta queda respondida con lo que le digas.</p>}
      <div className="chat" ref={lista} aria-live="polite">
        {mensajes.length === 0 && !enviando && (
          <p className="chat-vacio">Sin conversación todavía. Escríbele una orden o una pregunta.</p>
        )}
        {mensajes.map((m, i) => (
          <p key={i} className={`chat-msg chat-${m.rol}`}>
            {m.texto}
          </p>
        ))}
        {enviando && (
          <p className={parcial ? 'chat-msg chat-agente' : 'chat-msg chat-agente pensando'}>
            {parcial || actividad || '…'}
          </p>
        )}
      </div>
      <form className="orden-form" onSubmit={alEnviar}>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escríbele a ${agente.nombre.split(' ')[0]}…`}
          aria-label={`Mensaje para ${agente.nombre}`}
          autoComplete="off"
          disabled={enviando}
        />
        <button type="submit" className="btn principal" disabled={!texto.trim() || enviando}>
          Enviar
        </button>
      </form>
      <div className="chips" role="group" aria-label="Preguntas rápidas">
        {SUGERENCIAS.map((s) => (
          <button key={s} type="button" className="chip" disabled={enviando} onClick={() => void enviar(s)}>
            {s}
          </button>
        ))}
      </div>
    </aside>
  );
}
