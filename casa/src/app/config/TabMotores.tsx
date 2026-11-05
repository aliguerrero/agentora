import { useCallback, useEffect, useState } from 'react';
import { actualizarCuotaCodex, guardarSeccion, guardarTope, hace, leerMotores } from './configApi';
import type { EstadoMotor, Motor, PanelMotores, PoliticaMotores, Ventana } from './configApi';

const NOMBRE: Record<Motor, string> = { claude: 'Claude', codex: 'Codex' };
const ESTADO: Record<EstadoMotor['estado'], string> = {
  disponible: 'Disponible',
  reserva: 'En reserva',
  limite: 'En límite',
  desconocido: 'Sin lectura vigente',
};

function Barra({ v, umbral }: { v: Ventana; umbral: number }) {
  const nivel = v.porcentaje >= 100 ? 'lleno' : v.porcentaje >= umbral ? 'alto' : 'ok';
  const reinicio = v.reinicia
    ? new Date(v.reinicia).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="cfg-barra">
      <div className="cfg-barra-cab">
        <span>{v.etiqueta}</span>
        <b>{v.porcentaje} %</b>
      </div>
      <div className="cfg-barra-pista" role="meter" aria-valuenow={v.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label={`${v.etiqueta}: ${v.porcentaje} % usado`}>
        <i className={nivel} style={{ width: `${v.porcentaje}%` }} />
        <em style={{ left: `${umbral}%` }} title={`Reserva al ${umbral} %`} />
      </div>
      {reinicio && <small>Se reinicia {reinicio}</small>}
    </div>
  );
}

function Interruptor({ activo, onCambio, etiqueta, disabled }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} className="cfg-switch" disabled={disabled} onClick={() => onCambio(!activo)}>
      <i />
    </button>
  );
}

interface TarjetaProps {
  motor: Motor;
  datos: EstadoMotor;
  umbral: number;
  onActivo: (v: boolean) => void;
  ocupado: boolean;
  extra?: React.ReactNode;
}

function TarjetaMotor({ motor, datos, umbral, onActivo, ocupado, extra }: TarjetaProps) {
  return (
    <article className={datos.activo ? 'cfg-motor' : 'cfg-motor apagado'}>
      <header>
        <div>
          <h4>{NOMBRE[motor]}</h4>
          <span className={`cfg-chip ${datos.estado}`}>{ESTADO[datos.estado]}</span>
          {!datos.instalado && <span className="cfg-chip limite">No instalado</span>}
        </div>
        <Interruptor activo={datos.activo} onCambio={onActivo} etiqueta={`${NOMBRE[motor]} activo`} disabled={ocupado} />
      </header>
      {datos.ventanas.length > 0 ? (
        datos.ventanas.map((v) => <Barra key={v.etiqueta} v={v} umbral={umbral} />)
      ) : (
        <p className="cfg-nota">Sin datos de uso todavía: aparecerán tras la próxima {motor === 'claude' ? 'ejecución de Claude' : 'consulta de cuota'}.</p>
      )}
      <p className="cfg-nota">
        Lectura {hace(datos.observado)} · {datos.fuente}
        {datos.detalle ? ` · ${datos.detalle}` : ''}
      </p>
      {datos.ruta && <p className="cfg-ruta" title={datos.ruta}>{datos.ruta}</p>}
      {extra}
    </article>
  );
}

/** Motores: modo, motores activos, relevo, uso real por ventana, cuentas de Codex y topes. */
export function TabMotores() {
  const [p, setP] = useState<PanelMotores | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [topes, setTopes] = useState<Record<string, number>>({});

  const cargar = useCallback(async () => {
    try {
      const d = await leerMotores();
      setP(d);
      setTopes(Object.fromEntries(Object.entries(d.perfiles).map(([k, v]) => [k, v.maxTurnos])));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), 15000);
    return () => clearInterval(t);
  }, [cargar]);

  const guardar = async (cambios: Partial<PoliticaMotores>) => {
    setOcupado(true);
    try {
      await guardarSeccion<PoliticaMotores>('motores', cambios);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  if (!p) return <p className="cfg-nota">{error || 'Cargando motores…'}</p>;
  const pol = p.politica;
  const ninguno = !pol.claudeActivo && !pol.codexActivo;
  const c = p.codex.cuentas;

  return (
    <div className="cfg-form">
      {error && <p className="cfg-aviso error">{error}</p>}
      {ninguno && <p className="cfg-aviso error">Los dos motores están desactivados: nadie puede trabajar.</p>}

      <section className="cfg-grupo">
        <h3>Modo</h3>
        <div className="cfg-opciones">
          <button type="button" className="cfg-opcion" aria-pressed={pol.modo === 'auto'} disabled={ocupado} onClick={() => void guardar({ modo: 'auto' })}>
            <b>Automático</b>
            <span>Cada trabajo va al motor preferido para su tipo; si se agota, continúa el acompañante.</span>
          </button>
          <button type="button" className="cfg-opcion" aria-pressed={pol.modo === 'manual'} disabled={ocupado} onClick={() => void guardar({ modo: 'manual' })}>
            <b>Manual</b>
            <span>Todo el trabajo usa el motor que elijas.</span>
          </button>
        </div>
        {pol.modo === 'manual' ? (
          <label>
            Motor fijo
            <select value={pol.manual} disabled={ocupado} onChange={(e) => void guardar({ manual: e.target.value as Motor })}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
        ) : (
          <div className="cfg-fila">
            <label>
              Programación y trabajo prioritario
              <select value={pol.programacion} disabled={ocupado} onChange={(e) => void guardar({ programacion: e.target.value as Motor })}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </label>
            <label>
              Investigación y trabajo general
              <select value={pol.general} disabled={ocupado} onChange={(e) => void guardar({ general: e.target.value as Motor })}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </label>
          </div>
        )}
        <div className="cfg-linea">
          <div>
            <b>Motor acompañante (relevo)</b>
            <span>Si un motor se queda sin cuota a mitad de un trabajo, el otro lo continúa sin repetir lo hecho.</span>
          </div>
          <Interruptor activo={pol.relevo} onCambio={(v) => void guardar({ relevo: v })} etiqueta="Relevo entre motores" disabled={ocupado} />
        </div>
      </section>

      <section className="cfg-motores">
        <TarjetaMotor motor="claude" datos={p.claude} umbral={pol.umbralReserva} ocupado={ocupado} onActivo={(v) => void guardar({ claudeActivo: v })} />
        <TarjetaMotor
          motor="codex"
          datos={p.codex}
          umbral={pol.umbralReserva}
          ocupado={ocupado}
          onActivo={(v) => void guardar({ codexActivo: v })}
          extra={
            <div className="cfg-cuentas">
              <div className="cfg-cuentas-cab">
                <b>
                  Cuentas en el equipo: {c.validas}
                  {c.total !== c.validas ? ` (+${c.total - c.validas} ilegibles)` : ''}
                </b>
                <button
                  type="button"
                  className="btn"
                  disabled={ocupado}
                  onClick={async () => {
                    setOcupado(true);
                    try {
                      setP(await actualizarCuotaCodex());
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setOcupado(false);
                    }
                  }}
                >
                  Leer cuota ahora
                </button>
              </div>
              {p.codex.consulta && !p.codex.consulta.ok && <p className="cfg-nota">Última consulta: {p.codex.consulta.error}</p>}
              <ul>
                {c.cuentas.map((x) => (
                  <li key={x.etiqueta} className={x.activa ? 'activa' : ''}>
                    <div>
                      <b>{x.etiqueta}</b>
                      {x.activa && <span className="cfg-chip disponible">En uso</span>}
                      {x.plan && <span className="cfg-chip">{x.plan}</span>}
                      <small>{x.email ?? (x.valida ? '' : 'archivo ilegible')}</small>
                    </div>
                    <small>
                      {x.ultimaCuota
                        ? `${x.ultimaCuota.ventanas.map((v) => `${v.minutos === 300 ? '5 h' : v.minutos === 10080 ? 'semana' : 'ventana'} ${v.porcentaje} %`).join(' · ')} · ${hace(x.ultimaCuota.observado)}`
                        : 'Sin lectura: aún no estuvo activa mientras la oficina medía.'}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="cfg-nota">La oficina solo observa las cuentas: el cambio de cuenta lo hace tu selector de Codex. Nunca se copian ni reescriben sus credenciales.</p>
            </div>
          }
        />
      </section>

      <section className="cfg-grupo">
        <h3>Ritmo y límites</h3>
        <label>
          Reserva al {pol.umbralReserva} % de uso
          <input type="range" min={50} max={99} value={pol.umbralReserva} disabled={ocupado} onChange={(e) => setP({ ...p, politica: { ...pol, umbralReserva: Number(e.target.value) } })} onPointerUp={(e) => void guardar({ umbralReserva: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => void guardar({ umbralReserva: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <div className="cfg-fila">
          <label>
            Agentes a la vez
            <input type="number" min={1} max={8} value={pol.simultaneos} disabled={ocupado} onChange={(e) => void guardar({ simultaneos: Number(e.target.value) })} />
          </label>
          <label>
            Minutos sin actividad para dar un trabajo por colgado
            <input type="number" min={5} max={180} value={pol.inactividadMin} disabled={ocupado} onChange={(e) => setP({ ...p, politica: { ...pol, inactividadMin: Number(e.target.value) } })} onBlur={(e) => void guardar({ inactividadMin: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section className="cfg-grupo">
        <h3>Tope de pasos por perfil</h3>
        <p className="cfg-nota">Cuántos pasos puede dar un agente por ejecución; al agotarlos, su encargo vuelve a la cola con una nota de continuación.</p>
        <div className="cfg-topes">
          {Object.entries(p.perfiles).map(([perfil, d]) => (
            <label key={perfil} title={d.descripcion}>
              {perfil}
              <span>
                <input type="number" min={10} max={500} value={topes[perfil] ?? d.maxTurnos} onChange={(e) => setTopes((t) => ({ ...t, [perfil]: Number(e.target.value) }))} />
                {topes[perfil] !== d.maxTurnos && (
                  <button
                    type="button"
                    className="btn principal"
                    disabled={ocupado}
                    onClick={async () => {
                      setOcupado(true);
                      try {
                        setP(await guardarTope(perfil, topes[perfil] ?? d.maxTurnos));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setOcupado(false);
                      }
                    }}
                  >
                    Guardar
                  </button>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
