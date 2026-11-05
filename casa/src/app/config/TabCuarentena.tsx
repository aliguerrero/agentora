import { useCallback, useEffect, useState } from 'react';
import { hace, pedir } from './configApi';

interface Retenido {
  id: string;
  tipo: string;
  de: string;
  deNombre: string;
  para: string;
  paraNombre: string;
  titulo: string;
  hallazgos: string[];
  contenido: string;
  huella: string;
  modificado: string;
}

const TIPO: Record<string, string> = { encargo: 'Encargo', permiso: 'Pedido de permiso', respuesta: 'Respuesta' };

/** Lo que un agente o una persona envió con señales de manipulación: no llega a nadie hasta que el titular decida. */
export function TabCuarentena() {
  const [lista, setLista] = useState<Retenido[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setLista((await pedir<{ retenidos: Retenido[] }>('/api/cuarentena')).retenidos);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    const t = setInterval(() => void cargar().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [cargar]);

  const decidir = async (r: Retenido, accion: 'liberar' | 'descartar') => {
    setOcupado(true);
    setAviso(null);
    try {
      // La huella prueba que se decide sobre lo que está en pantalla.
      await pedir(`/api/cuarentena/${encodeURIComponent(r.id)}`, { method: 'POST', body: JSON.stringify({ accion, huella: r.huella }) });
      setAviso({ tipo: 'ok', texto: accion === 'liberar' ? `Liberado: se entregó a ${r.paraNombre}.` : 'Descartado: no se entregó a nadie.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      await cargar().catch(() => {});
      setOcupado(false);
    }
  };

  if (!lista) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}
      <section className="cfg-grupo">
        <h3>Retenido ({lista.length})</h3>
        <p className="cfg-nota">Tiene señales de instrucciones ocultas o intentos de manipular al agente. No llega a nadie hasta que decidas. Libéralo solo si reconoces el contenido.</p>
        {!lista.length && <p className="cfg-nota">Nada retenido.</p>}
        <ul className="cfg-lista">
          {lista.map((r) => (
            <li key={r.id} className="cfg-mensaje">
              <b>
                {TIPO[r.tipo] || r.tipo}: {r.titulo}
              </b>
              <small>
                {r.deNombre} → {r.paraNombre} · {hace(r.modificado)}
              </small>
              <small>
                <b>Señales:</b> {r.hallazgos.join(', ')}
              </small>
              <div className="cfg-mensaje-cuerpo">
                <pre>{r.contenido}</pre>
              </div>
              <div className="cfg-fila">
                <button type="button" className="btn" disabled={ocupado} onClick={() => void decidir(r, 'descartar')}>
                  Descartar
                </button>
                <button type="button" className="btn" disabled={ocupado} onClick={() => void decidir(r, 'liberar')}>
                  Liberar y entregar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
