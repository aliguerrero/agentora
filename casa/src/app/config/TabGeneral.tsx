import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { guardarSeccion } from './configApi';
import type { General } from './configApi';

const zonas = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

interface Props {
  general: General;
  onGuardado: (g: General) => void;
}

/** Nombre de la casa, titular, asistente, idioma, zona horaria y nivel de autonomía. */
export function TabGeneral({ general, onGuardado }: Props) {
  const [f, setF] = useState<General>(general);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiado = useMemo(() => JSON.stringify(f) !== JSON.stringify(general), [f, general]);
  const campo = <K extends keyof General>(k: K) => (v: General[K]) => setF((x) => ({ ...x, [k]: v }));
  const ejemplo = useMemo(() => {
    try {
      return new Date().toLocaleString(f.locale, { timeZone: f.zonaHoraria, dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return 'formato no válido';
    }
  }, [f.locale, f.zonaHoraria]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      const { configurado: _c, ...resto } = f;
      const g = await guardarSeccion<General>('general', { ...resto, configurado: true });
      setF(g);
      onGuardado(g);
      setEstado({ tipo: 'ok', texto: 'Guardado.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="cfg-form" onSubmit={guardar}>
      <section className="cfg-grupo">
        <h3>Identidad</h3>
        <label>
          Nombre de la casa
          <input value={f.casa} maxLength={60} onChange={(e) => campo('casa')(e.target.value)} required />
        </label>
        <div className="cfg-fila">
          <label>
            Titular (CEO)
            <input value={f.titular} maxLength={80} onChange={(e) => campo('titular')(e.target.value)} required />
          </label>
          <label>
            Cómo te llaman los agentes
            <input value={f.titularCorto} maxLength={30} onChange={(e) => campo('titularCorto')(e.target.value)} required />
          </label>
        </div>
        <label>
          Nombre del asistente
          <input value={f.asistente} maxLength={40} onChange={(e) => campo('asistente')(e.target.value)} required />
        </label>
      </section>

      <section className="cfg-grupo">
        <h3>Región</h3>
        <div className="cfg-fila">
          <label>
            Idioma
            <select value={f.idioma} onChange={(e) => campo('idioma')(e.target.value as General['idioma'])}>
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
            </select>
          </label>
          <label>
            País
            <input value={f.pais} maxLength={60} onChange={(e) => campo('pais')(e.target.value)} />
          </label>
        </div>
        <div className="cfg-fila">
          <label>
            Zona horaria
            <input list="cfg-zonas" value={f.zonaHoraria} onChange={(e) => campo('zonaHoraria')(e.target.value)} required />
            <datalist id="cfg-zonas">
              {zonas.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
          <label>
            Formato (locale)
            <input value={f.locale} maxLength={20} onChange={(e) => campo('locale')(e.target.value)} placeholder="es-VE" />
          </label>
          <label className="cfg-corto">
            Moneda
            <input value={f.moneda} maxLength={3} onChange={(e) => campo('moneda')(e.target.value.toUpperCase())} />
          </label>
        </div>
        <p className="cfg-nota">Así verás fechas y horas: {ejemplo} — la luz de la casa sigue esta zona horaria.</p>
      </section>

      <section className="cfg-grupo">
        <h3>Autonomía</h3>
        <div className="cfg-opciones" role="radiogroup" aria-label="Autonomía">
          <button type="button" className="cfg-opcion" aria-pressed={f.autonomia === 'autonoma'} onClick={() => campo('autonomia')('autonoma')}>
            <b>100 % autónoma</b>
            <span>El equipo decide y ejecuta; solo te escala lo vetado.</span>
          </button>
          <button type="button" className="cfg-opcion" aria-pressed={f.autonomia === 'supervisada'} onClick={() => campo('autonomia')('supervisada')}>
            <b>Supervisada</b>
            <span>Lo marcado como «pide permiso» espera tu aprobación.</span>
          </button>
        </div>
        <p className="cfg-nota">Los permisos por capacidad llegan en la fase de permisos; hoy se guarda tu preferencia.</p>
      </section>

      <div className="cfg-acciones">
        {estado && <span className={`cfg-aviso ${estado.tipo}`}>{estado.texto}</span>}
        <button type="button" className="btn" disabled={!cambiado || guardando} onClick={() => setF(general)}>
          Descartar
        </button>
        <button type="submit" className="btn principal" disabled={!cambiado || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
