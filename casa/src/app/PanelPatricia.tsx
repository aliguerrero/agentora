import { useEffect, useRef, useState } from 'react';
import type { Casa } from './api';
import { api } from './api';
import type { SenalAgente } from '@jules/oficina';

export function PanelPatricia({ casa, onCerrar, onEnviando, onSenales }: {
  casa: Casa;
  onCerrar: () => void;
  onEnviando: (valor: boolean) => void;
  onSenales: (eventos: SenalAgente[], proyecto: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'auto' | 'todos'>('auto');
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState<{ rol: string; texto: string }[]>([]);
  const [fallo, setFallo] = useState('');
  const ocupado = useRef(false);
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => { lista.current?.scrollTo({ top: lista.current.scrollHeight }); }, [mensajes, enviando]);
  const enviar = async () => {
    const mensaje = texto.trim();
    if (!mensaje || ocupado.current || !casa.proyecto) return;
    ocupado.current = true;
    setEnviando(true); onEnviando(true); setFallo('');
    try {
      const r = await api('/api/patricia', { method: 'POST', body: JSON.stringify({ mensaje, modo, proyecto: casa.proyecto.id }) });
      const d = await r.json() as { error?: string; motivo: string; entregados: { id: string; nombre: string }[]; errores: { id: string; error: string }[]; senales: SenalAgente[] };
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMensajes((m) => [...m, { rol: 'ali', texto: mensaje }, { rol: 'agente', texto: d.entregados.length ? `${d.motivo} Dejé el pedido en la cola de ${d.entregados.map((a) => a.nombre).join(', ')}. Lo atenderán según su disponibilidad.` : 'El pedido no pudo entregarse.' }]);
      setTexto(d.errores.length ? mensaje : '');
      if (d.errores.length) setFallo(d.errores.map((e) => `${e.id}: ${e.error}`).join('\n') + (d.entregados.length ? '\nNo reenvíes a todo el equipo: algunos ya lo recibieron.' : ''));
      onSenales(d.senales, casa.proyecto.id);
    } catch (e) { setFallo((e as Error).message); }
    finally { ocupado.current = false; setEnviando(false); onEnviando(false); }
  };
  return <aside className="hud detalle panel-orden panel-patricia" aria-label="Conversación con Patricia">
    <div className="panel-orden-cabeza"><div><h2>Patricia <span aria-hidden="true">✦</span></h2><div className="sub">Tu enlace con los agentes · {casa.proyecto?.nombre || 'Sin proyecto'}</div></div><button type="button" className="btn-cerrar" aria-label="Cerrar Patricia" onClick={onCerrar} disabled={enviando}>×</button></div>
    <div className="chat" ref={lista} role="log" aria-live="polite">
      <p className="chat-msg chat-agente">Cuéntame qué necesitas. Si mencionas un agente o departamento, se lo transmito. Si el pedido es general, el gerente decidirá cómo repartirlo. También puedes avisar a todos.</p>
      {mensajes.map((m, i) => <p key={i} className={`chat-msg chat-${m.rol}`}>{m.texto}</p>)}
      {enviando && <p className="chat-msg chat-agente pensando">Transmitiendo tu pedido…</p>}
    </div>
    <form className="patricia-form" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <label htmlFor="patricia-modo">Destinatarios</label>
      <select id="patricia-modo" value={modo} disabled={enviando} onChange={(e) => setModo(e.target.value as 'auto' | 'todos')}><option value="auto">Patricia elige</option><option value="todos">Todo el equipo de este proyecto</option></select>
      <label htmlFor="patricia-deseo">Tu pedido</label>
      <textarea id="patricia-deseo" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} rows={3} disabled={enviando || !casa.proyecto} placeholder="Quiero que el equipo…" />
      {fallo && <p className="error" role="alert">{fallo}</p>}
      {!casa.proyecto && <p className="sub">Crea o selecciona un proyecto para transmitir tu pedido.</p>}
      <button type="submit" className="btn principal" disabled={!texto.trim() || enviando || !casa.proyecto}>{enviando ? 'Transmitiendo…' : 'Transmitir mi pedido'}</button>
    </form>
  </aside>;
}
