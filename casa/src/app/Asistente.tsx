import { useEffect, useMemo, useState } from 'react';
import { crearProyecto } from './proyectosApi';
import { guardarSeccion, leerConfig, leerMotores } from './config/configApi';
import type { General, PanelMotores, PoliticaMotores } from './config/configApi';
import './config/config.css';

interface Props {
  /** Termina el asistente; `pestana` abre esa pestaña de Configuración al cerrar. */
  onTerminar: (pestana?: string) => void;
}

const PASOS = ['Bienvenida', 'Región', 'Autonomía', 'Motores', 'Primer proyecto', 'Listo'];

/** Primer arranque: identidad, región, autonomía, motores y primer proyecto. Todo se puede cambiar luego. */
export function Asistente({ onTerminar }: Props) {
  const [paso, setPaso] = useState(0);
  const [g, setG] = useState<General | null>(null);
  const [motores, setMotores] = useState<PanelMotores | null>(null);
  const [proyecto, setProyecto] = useState({ nombre: '', descripcion: '', ruta: '', crear: true });
  const [creado, setCreado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    leerConfig()
      .then((c) => {
        const navegador = Intl.DateTimeFormat().resolvedOptions();
        setG({ ...c.general, titular: c.general.titular === 'Titular' ? '' : c.general.titular, titularCorto: c.general.titularCorto === 'Titular' ? '' : c.general.titularCorto, zonaHoraria: navegador.timeZone || c.general.zonaHoraria, locale: navigator.language || c.general.locale });
      })
      .catch((e: Error) => setError(e.message));
    leerMotores().then(setMotores).catch(() => setMotores(null));
  }, []);

  const zonas = useMemo(() => (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [], []);
  if (!g) return <div className="cfg-fondo centro"><div className="hud asistente"><p className="cfg-nota">{error || 'Preparando…'}</p></div></div>;
  const c = <K extends keyof General>(k: K, v: General[K]) => setG({ ...g, [k]: v });

  /** Ejecuta un paso y avanza solo si salió bien. */
  const avanzar = async (fn?: () => Promise<unknown>) => {
    setOcupado(true);
    setError('');
    try {
      if (fn) await fn();
      setPaso((p) => p + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const guardarGeneral = () => {
    const { configurado: _c, ...resto } = g;
    return guardarSeccion<General>('general', { ...resto, titularCorto: g.titularCorto || g.titular.split(/\s+/)[0] || 'Titular' });
  };
  const motor = async (cambios: Partial<PoliticaMotores>) => {
    await guardarSeccion<PoliticaMotores>('motores', cambios);
    setMotores(await leerMotores());
  };
  const terminar = async (pestana?: string) => {
    setOcupado(true);
    try {
      await guardarSeccion<General>('general', { configurado: true });
      onTerminar(pestana);
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  };
  const sinMotor = motores && !motores.claude.instalado && !motores.codex.instalado;

  return (
    <div className="cfg-fondo centro">
      <div className="hud asistente cfg" role="dialog" aria-modal="true" aria-label="Configuración inicial">
        <ol className="asistente-pasos" aria-label={`Paso ${paso + 1} de ${PASOS.length}`}>
          {PASOS.map((p, i) => (
            <li key={p} className={i === paso ? 'actual' : i < paso ? 'hecho' : ''} aria-current={i === paso ? 'step' : undefined}>
              {p}
            </li>
          ))}
        </ol>
        {error && <p className="cfg-aviso error">{error}</p>}

        {paso === 0 && (
          <div className="cfg-grupo">
            <h2>Te damos la bienvenida a tu oficina</h2>
            <p className="cfg-nota">Agentes de IA que trabajan en tus proyectos desde esta casa. Son unos pasos y todo se puede cambiar después en ⚙.</p>
            <label>
              Tu nombre
              <input autoFocus value={g.titular} maxLength={80} onChange={(e) => c('titular', e.target.value)} placeholder="Nombre y apellido" />
            </label>
            <label>
              Cómo quieres que te llamen los agentes
              <input value={g.titularCorto} maxLength={30} onChange={(e) => c('titularCorto', e.target.value)} placeholder={g.titular.split(/\s+/)[0] || 'Nombre'} />
            </label>
            <div className="cfg-fila">
              <label>
                Nombre de la casa
                <input value={g.casa} maxLength={60} onChange={(e) => c('casa', e.target.value)} />
              </label>
              <label>
                Nombre del asistente
                <input value={g.asistente} maxLength={40} onChange={(e) => c('asistente', e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {paso === 1 && (
          <div className="cfg-grupo">
            <h2>¿Dónde estás?</h2>
            <p className="cfg-nota">La zona horaria decide la luz de la casa y las horas en que los agentes no molestan a tu equipo.</p>
            <label>
              Zona horaria
              <input list="asistente-zonas" value={g.zonaHoraria} onChange={(e) => c('zonaHoraria', e.target.value)} />
              <datalist id="asistente-zonas">
                {zonas.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </label>
            <div className="cfg-fila">
              <label>
                País (opcional)
                <input value={g.pais} maxLength={60} onChange={(e) => c('pais', e.target.value)} />
              </label>
              <label>
                Formato de fechas
                <input value={g.locale} maxLength={20} onChange={(e) => c('locale', e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="cfg-grupo">
            <h2>¿Cuánta autonomía les das?</h2>
            <div className="cfg-opciones">
              <button type="button" className="cfg-opcion" aria-pressed={g.autonomia === 'autonoma'} onClick={() => c('autonomia', 'autonoma')}>
                <b>Autónoma</b>
                <span>El gerente forma el equipo y decide. Solo te escalan lo vetado.</span>
              </button>
              <button type="button" className="cfg-opcion" aria-pressed={g.autonomia === 'supervisada'} onClick={() => c('autonomia', 'supervisada')}>
                <b>Supervisada</b>
                <span>El gerente te propone el equipo y espera tu respuesta antes de contratar.</span>
              </button>
            </div>
            <p className="cfg-nota">Si es tu primera vez, empieza en supervisada. En cualquier modo, los agentes no pueden hacer `git push` hasta que lo permitas.</p>
          </div>
        )}

        {paso === 3 && (
          <div className="cfg-grupo">
            <h2>Motores</h2>
            <p className="cfg-nota">Los agentes trabajan con Claude Code o Codex, usando la cuota de tu propia suscripción.</p>
            {!motores && <p className="cfg-nota">Revisando este equipo…</p>}
            {motores &&
              (['claude', 'codex'] as const).map((m) => {
                const d = motores[m];
                const campo = m === 'claude' ? 'claudeActivo' : 'codexActivo';
                return (
                  <div className="cfg-linea" key={m}>
                    <div>
                      <b>{m === 'claude' ? 'Claude Code' : 'Codex'}</b>
                      <span>{d.instalado ? 'Instalado en este equipo.' : `No instalado: ${m === 'claude' ? 'claude.com/claude-code' : 'openai.com/codex'}`}</span>
                    </div>
                    <button type="button" role="switch" aria-checked={d.activo} aria-label={`${m} activo`} className="cfg-switch" disabled={!d.instalado} onClick={() => void motor({ [campo]: !d.activo })}>
                      <i />
                    </button>
                  </div>
                );
              })}
            {sinMotor && <p className="cfg-aviso error">No hay ningún motor instalado. Puedes seguir, pero los agentes no podrán trabajar hasta que instales uno y reinicies la oficina.</p>}
            {motores?.claude.instalado && motores.codex.instalado && <p className="cfg-nota">Con los dos, si uno se queda sin cuota el otro continúa el trabajo.</p>}
          </div>
        )}

        {paso === 4 && (
          <div className="cfg-grupo">
            <h2>Tu primer proyecto</h2>
            <p className="cfg-nota">
              Nace con un solo agente, su gerente, que analiza el repositorio y {g.autonomia === 'autonoma' ? 'forma el equipo por su cuenta' : 'te propone el equipo'}. <b>Empieza a trabajar al crearlo y gasta cuota de tu motor.</b>
            </p>
            <label>
              Nombre
              <input value={proyecto.nombre} maxLength={60} onChange={(e) => setProyecto({ ...proyecto, nombre: e.target.value })} />
            </label>
            <label>
              Objetivo (lo leerá el gerente)
              <textarea rows={3} maxLength={600} value={proyecto.descripcion} onChange={(e) => setProyecto({ ...proyecto, descripcion: e.target.value })} />
            </label>
            <div className="cfg-opciones">
              <button type="button" className="cfg-opcion" aria-pressed={proyecto.crear} onClick={() => setProyecto({ ...proyecto, crear: true })}>
                <b>Carpeta nueva</b>
                <span>Crea la carpeta y un repositorio git vacío.</span>
              </button>
              <button type="button" className="cfg-opcion" aria-pressed={!proyecto.crear} onClick={() => setProyecto({ ...proyecto, crear: false })}>
                <b>Repositorio existente</b>
                <span>Indica la carpeta en este equipo.</span>
              </button>
            </div>
            <label>
              {proyecto.crear ? 'Carpeta (opcional)' : 'Carpeta del repositorio'}
              <input value={proyecto.ruta} onChange={(e) => setProyecto({ ...proyecto, ruta: e.target.value })} spellCheck={false} />
            </label>
          </div>
        )}

        {paso === 5 && (
          <div className="cfg-grupo">
            <h2>Todo listo{g.titularCorto ? `, ${g.titularCorto}` : ''}</h2>
            <p className="cfg-nota">{creado ? `«${creado}» ya tiene a su gerente.` : 'Crea tu primer proyecto cuando quieras en ⚙ › Proyectos.'} Toca a un agente para hablar con él. Esto es opcional y puedes hacerlo cuando quieras:</p>
            <div className="asistente-extras">
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void terminar('telegram')}>
                <b>Avisos en el teléfono</b>
                <span>Conecta un bot de Telegram.</span>
              </button>
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void terminar('equipo')}>
                <b>Tu equipo</b>
                <span>Añade a las personas con las que trabajan los agentes.</span>
              </button>
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void terminar('conexiones')}>
                <b>Conexiones</b>
                <span>GitHub, Jira y otras herramientas.</span>
              </button>
              <button type="button" className="cfg-opcion" disabled={ocupado} onClick={() => void terminar('permisos')}>
                <b>Permisos</b>
                <span>Revisa qué puede hacer cada agente.</span>
              </button>
            </div>
          </div>
        )}

        <div className="cfg-acciones asistente-acciones">
          {paso > 0 && paso < 5 && (
            <button type="button" className="btn" disabled={ocupado} onClick={() => { setError(''); setPaso(paso - 1); }}>
              Atrás
            </button>
          )}
          {paso === 0 && (
            <button type="button" className="btn principal" disabled={ocupado || g.titular.trim().length < 2 || !g.casa.trim() || !g.asistente.trim()} onClick={() => void avanzar(guardarGeneral)}>
              Continuar
            </button>
          )}
          {(paso === 1 || paso === 2) && (
            <button type="button" className="btn principal" disabled={ocupado} onClick={() => void avanzar(guardarGeneral)}>
              Continuar
            </button>
          )}
          {paso === 3 && (
            <button type="button" className="btn principal" disabled={ocupado} onClick={() => void avanzar()}>
              Continuar
            </button>
          )}
          {paso === 4 && (
            <>
              <button type="button" className="btn" disabled={ocupado} onClick={() => void avanzar()}>
                Lo haré después
              </button>
              <button
                type="button"
                className="btn principal"
                disabled={ocupado || !proyecto.nombre.trim() || (!proyecto.crear && !proyecto.ruta.trim())}
                onClick={() =>
                  void avanzar(async () => {
                    await crearProyecto(proyecto);
                    setCreado(proyecto.nombre);
                  })
                }
              >
                {ocupado ? 'Creando…' : 'Crear proyecto'}
              </button>
            </>
          )}
          {paso === 5 && (
            <button type="button" className="btn principal" disabled={ocupado} onClick={() => void terminar()}>
              Entrar a la oficina
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
