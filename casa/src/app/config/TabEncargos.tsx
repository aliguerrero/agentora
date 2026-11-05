import { useCallback, useEffect, useState } from 'react';
import { hace, pedir } from './configApi';

interface Corrida {
  inicio?: string;
  motor?: string;
  turnos?: number;
  codigo?: number;
}
interface Tarjeta {
  empleado: string;
  nombre: string;
  archivo: string;
  estado: string;
  modificado: number;
  titulo: string;
  de: string | null;
  prioridad: string;
  continuaciones: number;
  resultado: string;
  corridas: Corrida[];
  turnos: number;
}
interface Tablero {
  tarjetas: Tarjeta[];
  hoy: { ejecuciones: number; turnos: number };
  simultaneos: { maximo: number; trabajando: number };
}

const ORDEN = ['bloqueado', 'en-curso', 'pendiente'];
const ESTADO: Record<string, [string, string]> = {
  bloqueado: ['Bloqueado', 'limite'],
  'en-curso': ['En curso', 'reserva'],
  pendiente: ['En cola', ''],
  hecho: ['Hecho', 'disponible'],
};

/** Los encargos de los agentes del proyecto seleccionado; un bloqueado se puede devolver a la cola. */
export function TabEncargos() {
  const [t, setT] = useState<Tablero | null>(null);
  const [filtro, setFiltro] = useState<'abiertos' | 'cerrados'>('abiertos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => setT(await pedir<Tablero>('/api/tablero')), []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    const i = setInterval(() => void cargar().catch(() => {}), 10000);
    return () => clearInterval(i);
  }, [cargar]);

  const reintentar = async (c: Tarjeta) => {
    setOcupado(true);
    setAviso(null);
    try {
      await pedir('/api/tablero/reintentar', { method: 'POST', body: JSON.stringify({ empleado: c.empleado, archivo: c.archivo }) });
      setAviso({ tipo: 'ok', texto: `«${c.titulo}» volvió a la cola de ${c.nombre}.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      await cargar().catch(() => {});
      setOcupado(false);
    }
  };

  if (!t) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;
  const posicion = (c: Tarjeta) => ORDEN.indexOf(c.estado);
  const abiertos = t.tarjetas.filter((c) => posicion(c) >= 0).sort((a, b) => posicion(a) - posicion(b) || b.modificado - a.modificado);
  const cerrados = t.tarjetas.filter((c) => posicion(c) < 0).sort((a, b) => b.modificado - a.modificado);
  const vista = filtro === 'abiertos' ? abiertos : cerrados;

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <section className="cfg-grupo">
        <div className="cfg-cuentas-cab">
          <h3>Encargos</h3>
          <div className="cfg-chips">
            <button type="button" className="cfg-chipbtn" aria-pressed={filtro === 'abiertos'} onClick={() => setFiltro('abiertos')}>
              Abiertos ({abiertos.length})
            </button>
            <button type="button" className="cfg-chipbtn" aria-pressed={filtro === 'cerrados'} onClick={() => setFiltro('cerrados')}>
              Terminados, 7 días ({cerrados.length})
            </button>
          </div>
        </div>
        <p className="cfg-nota">
          Trabajando {t.simultaneos.trabajando} de {t.simultaneos.maximo} · Hoy: {t.hoy.ejecuciones} ejecuciones, {t.hoy.turnos} pasos
        </p>
        {!vista.length && <p className="cfg-nota">{filtro === 'abiertos' ? 'Ningún encargo abierto.' : 'Nada terminado en los últimos 7 días.'}</p>}
        <ul className="cfg-lista">
          {vista.map((c) => {
            const clave = `${c.empleado}/${c.archivo}`;
            const [texto, color] = ESTADO[c.estado] ?? [c.estado, ''];
            return (
              <li key={clave} className="cfg-mensaje">
                <button type="button" className="cfg-mensaje-cab" onClick={() => setAbierto(abierto === clave ? null : clave)} aria-expanded={abierto === clave}>
                  <span>
                    <b>{c.titulo}</b> <span className="cfg-tenue">{c.nombre}</span>
                  </span>
                  <span className={`cfg-chip ${color}`}>{texto}</span>
                </button>
                <small>
                  {c.de ? `De ${c.de} · ` : ''}
                  {c.prioridad !== 'normal' ? `Prioridad ${c.prioridad} · ` : ''}
                  {c.corridas.length} {c.corridas.length === 1 ? 'ejecución' : 'ejecuciones'} · {c.turnos} {c.turnos === 1 ? 'paso' : 'pasos'} · {hace(new Date(c.modificado).toISOString())}
                </small>
                {abierto === clave && (
                  <div className="cfg-mensaje-cuerpo">
                    <small>Archivo: {c.archivo}</small>
                    <pre>{c.resultado || 'Sin resultado registrado todavía.'}</pre>
                  </div>
                )}
                {c.estado === 'bloqueado' && (
                  <div className="cfg-fila">
                    <button type="button" className="btn" disabled={ocupado} onClick={() => void reintentar(c)}>
                      Reintentar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
