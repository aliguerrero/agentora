import { useCallback, useEffect, useState } from 'react';
import { guardarSeccion, hace, pedir } from './configApi';

interface Politica {
  activo: boolean;
  aprobador: 'cualquiera' | 'gerente' | 'titular';
  maxPorDia: number;
  silencioDesde: number;
  silencioHasta: number;
}
interface Mensaje {
  id: string;
  de: string;
  deNombre: string;
  para: string;
  paraNombre: string;
  canal: 'correo' | 'telegram';
  asunto: string;
  mensaje: string;
  motivo: string;
  porque: string;
  estado: 'pendiente-aprobacion' | 'programado' | 'enviado' | 'rechazado' | 'fallido';
  creado: string;
  enviarDesde?: string;
  enviado?: string;
  aprobadoPor?: string;
  rechazadoPor?: string;
  error?: string;
  puedoDecidir: boolean;
}

const ESTADO: Record<Mensaje['estado'], [string, string]> = {
  'pendiente-aprobacion': ['Espera aprobación', 'reserva'],
  programado: ['Programado', ''],
  enviado: ['Enviado', 'disponible'],
  rechazado: ['Rechazado', 'limite'],
  fallido: ['Falló', 'limite'],
};
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Política de contacto de los agentes con el equipo humano y su bandeja de salida. */
export function TabContacto() {
  const [pol, setPol] = useState<Politica | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [filtro, setFiltro] = useState<'pendientes' | 'todos'>('pendientes');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const d = await pedir<{ politica: Politica; mensajes: Mensaje[] }>('/api/contacto');
    setPol(d.politica);
    setMensajes(d.mensajes);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    const t = setInterval(() => void cargar().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [cargar]);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: ok });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };
  const guardar = (c: Partial<Politica>) => accion(() => guardarSeccion('contacto', c), 'Política guardada.');

  if (!pol) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  const pendientes = mensajes.filter((m) => m.estado === 'pendiente-aprobacion' || m.estado === 'programado');
  const vista = filtro === 'pendientes' ? pendientes : mensajes;

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <section className="cfg-grupo">
        <h3>Política</h3>
        <div className="cfg-linea">
          <div>
            <b>Los agentes pueden escribir sin pedir permiso</b>
            <span>
              {pol.activo
                ? 'Activa: a las personas con «contacto directo» les escriben sin esperar; al resto, con aprobación.'
                : 'Desactivada: todo mensaje a una persona espera aprobación antes de salir.'}
            </span>
          </div>
          <button type="button" role="switch" aria-checked={pol.activo} aria-label="Contacto sin permiso" className="cfg-switch" disabled={ocupado} onClick={() => void guardar({ activo: !pol.activo })}>
            <i />
          </button>
        </div>
        <label>
          Quién aprueba los mensajes que necesitan permiso
          <select value={pol.aprobador} disabled={ocupado} onChange={(e) => void guardar({ aprobador: e.target.value as Politica['aprobador'] })}>
            <option value="cualquiera">El gerente del proyecto o yo, quien decida primero</option>
            <option value="gerente">El gerente del proyecto (yo solo si él escribe el mensaje)</option>
            <option value="titular">Solo yo</option>
          </select>
        </label>
        <div className="cfg-fila">
          <label>
            Máximo de mensajes por persona y día
            <input type="number" min={1} max={50} value={pol.maxPorDia} disabled={ocupado} onChange={(e) => setPol({ ...pol, maxPorDia: Number(e.target.value) })} onBlur={(e) => void guardar({ maxPorDia: Number(e.target.value) })} />
          </label>
          <label>
            Silencio desde
            <select value={pol.silencioDesde} disabled={ocupado} onChange={(e) => void guardar({ silencioDesde: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </label>
          <label>
            hasta
            <select value={pol.silencioHasta} disabled={ocupado} onChange={(e) => void guardar({ silencioHasta: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="cfg-nota">
          El silencio se aplica en la zona horaria de cada persona (o la de la oficina si no tiene). Lo que llegue en silencio o supere el tope se envía después; no se pierde. Siempre: firma de agente de IA, revisión de instrucciones escondidas y bloqueo de secretos. Cada persona tiene además su propia regla en la pestaña Equipo.
        </p>
      </section>

      <section className="cfg-grupo">
        <div className="cfg-cuentas-cab">
          <h3>Bandeja de salida</h3>
          <div className="cfg-chips">
            <button type="button" className="cfg-chipbtn" aria-pressed={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')}>
              Pendientes ({pendientes.length})
            </button>
            <button type="button" className="cfg-chipbtn" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>
              Todos ({mensajes.length})
            </button>
          </div>
        </div>
        {!vista.length && <p className="cfg-nota">{filtro === 'pendientes' ? 'Nada pendiente.' : 'Los agentes aún no han escrito a nadie.'}</p>}
        <ul className="cfg-lista">
          {vista.map((m) => (
            <li key={m.id} className="cfg-mensaje">
              <button type="button" className="cfg-mensaje-cab" onClick={() => setAbierto(abierto === m.id ? null : m.id)} aria-expanded={abierto === m.id}>
                <span>
                  <b>
                    {m.deNombre} → {m.paraNombre}
                  </b>{' '}
                  <span className="cfg-tenue">
                    por {m.canal} · {m.asunto}
                  </span>
                </span>
                <span className={`cfg-chip ${ESTADO[m.estado][1]}`}>{ESTADO[m.estado][0]}</span>
              </button>
              <small>
                {m.estado === 'programado' && m.enviarDesde ? `Sale ${Date.parse(m.enviarDesde) > Date.now() + 60e3 ? `el ${new Date(m.enviarDesde).toLocaleString()}` : 'en breve'} · ` : ''}
                {m.estado === 'enviado' && m.enviado ? `Enviado ${hace(m.enviado)} · ` : ''}
                {m.aprobadoPor ? `Aprobó: ${m.aprobadoPor} · ` : ''}
                {m.rechazadoPor ? `Rechazó: ${m.rechazadoPor} · ` : ''}
                {m.error ? `Error: ${m.error} · ` : ''}
                Pedido {hace(m.creado)}
              </small>
              {abierto === m.id && (
                <div className="cfg-mensaje-cuerpo">
                  <small>
                    <b>Motivo:</b> {m.motivo} · <b>Por qué espera:</b> {m.porque}
                  </small>
                  <pre>{m.mensaje}</pre>
                </div>
              )}
              {m.puedoDecidir && (
                <div className="cfg-fila">
                  <button type="button" className="btn principal" disabled={ocupado} onClick={() => void accion(() => pedir(`/api/contacto/${m.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'aprobar' }) }), 'Aprobado: se enviará respetando su horario.')}>
                    Aprobar
                  </button>
                  <button type="button" className="btn" disabled={ocupado} onClick={() => void accion(() => pedir(`/api/contacto/${m.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'rechazar' }) }), 'Rechazado: no se enviará.')}>
                    Rechazar
                  </button>
                  {abierto !== m.id && (
                    <button type="button" className="btn" onClick={() => setAbierto(m.id)}>
                      Leer mensaje
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
