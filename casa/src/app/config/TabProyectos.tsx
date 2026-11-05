import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { cambiarEstadoProyecto, crearProyecto, leerProyectos } from '../proyectosApi';
import type { Proyectos } from '../proyectosApi';
import { guardarSeccion, pedir } from './configApi';

type AlCambiar = 'preguntar' | 'pausar' | 'segundo-plano';

/** Proyectos como contextos: cada uno con su equipo. Crear, pausar/reanudar y qué hacer al cambiar. */
export function TabProyectos() {
  const [d, setD] = useState<Proyectos | null>(null);
  const [alCambiar, setAlCambiar] = useState<AlCambiar>('preguntar');
  const [nuevo, setNuevo] = useState({ nombre: '', descripcion: '', ruta: '', crear: true });
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setD(await leerProyectos());
    const c = await pedir<{ proyectos: { alCambiar: AlCambiar } }>('/api/config');
    setAlCambiar(c.proyectos.alCambiar);
  }, []);
  useEffect(() => {
    cargar().catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    const t = setInterval(() => void leerProyectos().then(setD).catch(() => {}), 8000);
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

  const crear = (e: FormEvent) => {
    e.preventDefault();
    void accion(async () => {
      const r = await crearProyecto(nuevo);
      setNuevo({ nombre: '', descripcion: '', ruta: '', crear: true });
      return r;
    }, `Proyecto «${nuevo.nombre}» creado. Su gerente analizará el repositorio y formará el equipo.`);
  };

  if (!d) return <p className="cfg-nota">{aviso?.texto || 'Cargando…'}</p>;

  return (
    <div className="cfg-form">
      {aviso && <p className={`cfg-aviso ${aviso.tipo}`}>{aviso.texto}</p>}

      <section className="cfg-grupo">
        <h3>Proyectos</h3>
        <p className="cfg-nota">
          Cada proyecto es un contexto aparte: su propio equipo, encargos, reuniones y memoria. El seleccionado es el que ves en la casa; los demás siguen en segundo plano o pausados.
        </p>
        <ul className="cfg-lista">
          {d.proyectos.map((p) => (
            <li key={p.id} className="cfg-proyecto">
              <div>
                <b>
                  {p.nombre} {p.id === d.activo ? <span className="cfg-chip disponible">Seleccionado</span> : <span className={`cfg-chip ${p.estado === 'pausado' ? 'limite' : 'reserva'}`}>{p.estado === 'pausado' ? 'Pausado' : 'Segundo plano'}</span>}
                </b>
                <small>
                  {p.empleados} {p.empleados === 1 ? 'agente' : 'agentes'} · {p.trabajando} trabajando · {p.enCola} en cola{p.gerente ? ` · gerente: ${p.gerente}` : ''}
                </small>
                <small title={p.ruta}>{p.ruta}</small>
              </div>
              {p.id !== d.activo && (
                <button
                  type="button"
                  className="btn"
                  disabled={ocupado}
                  onClick={() => void accion(() => cambiarEstadoProyecto(p.id, p.estado === 'pausado' ? 'activo' : 'pausado'), p.estado === 'pausado' ? `«${p.nombre}» reanudado.` : `«${p.nombre}» pausado.`)}
                >
                  {p.estado === 'pausado' ? 'Reanudar' : 'Pausar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="cfg-grupo">
        <h3>Al cambiar de proyecto</h3>
        <select value={alCambiar} disabled={ocupado} onChange={(e) => void accion(() => guardarSeccion('proyectos', { alCambiar: e.target.value as AlCambiar }), 'Preferencia guardada.')}>
          <option value="preguntar">Preguntarme cada vez (si hay trabajo en curso)</option>
          <option value="segundo-plano">Dejar el anterior en segundo plano</option>
          <option value="pausar">Pausar el anterior</option>
        </select>
      </section>

      <form className="cfg-grupo" onSubmit={crear}>
        <h3>Nuevo proyecto</h3>
        <p className="cfg-nota">Empieza sin agentes: solo con su gerente, que analiza el repositorio y contrata el equipo que necesite (o te lo propone si la oficina está en modo supervisado).</p>
        <label>
          Nombre
          <input value={nuevo.nombre} maxLength={60} required onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        </label>
        <label>
          Objetivo (lo leerá el gerente)
          <textarea rows={3} maxLength={600} value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </label>
        <div className="cfg-opciones">
          <button type="button" className="cfg-opcion" aria-pressed={nuevo.crear} onClick={() => setNuevo({ ...nuevo, crear: true })}>
            <b>Carpeta nueva</b>
            <span>Crea la carpeta y un repositorio git vacío.</span>
          </button>
          <button type="button" className="cfg-opcion" aria-pressed={!nuevo.crear} onClick={() => setNuevo({ ...nuevo, crear: false })}>
            <b>Repositorio existente</b>
            <span>Indica la carpeta del proyecto en este equipo.</span>
          </button>
        </div>
        <label>
          {nuevo.crear ? 'Carpeta (opcional; por defecto, «proyectos» junto a la oficina)' : 'Carpeta del repositorio'}
          <input value={nuevo.ruta} required={!nuevo.crear} onChange={(e) => setNuevo({ ...nuevo, ruta: e.target.value })} placeholder="Ruta completa de la carpeta" spellCheck={false} />
        </label>
        <div className="cfg-acciones">
          <button type="submit" className="btn principal" disabled={ocupado || !nuevo.nombre.trim()}>
            {ocupado ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  );
}
