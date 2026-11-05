import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { Casa, ConfigCasa } from '../api';
import { guardarSeccion } from './configApi';
import { SeccionLogo } from './SeccionLogo';
import { PlanoSalas } from './PlanoSalas';
import { SeccionObras } from './SeccionObras';

interface Props {
  casa: ConfigCasa;
  hogar: Casa | null;
  onGuardado: (c: ConfigCasa) => void;
}

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/**
 * Etiquetas, letrero LED, hora y calidad de la casa, y música de fondo: se guardan con el botón.
 * El logo y las salas se aplican al momento por su cuenta, así que el formulario no los toca.
 */
export function TabCasa({ casa, hogar, onGuardado }: Props) {
  const [f, setF] = useState<ConfigCasa>(casa);
  const [urls, setUrls] = useState(casa.listaUrls.join('\n'));
  const [musica, setMusica] = useState<{ carpeta: string; pistas: { nombre: string }[] } | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api('/api/musica')
      .then((r) => r.json())
      .then(setMusica)
      .catch(() => setMusica(null));
  }, []);

  const listaUrls = useMemo(() => urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean), [urls]);
  const { salas: _salasForm, ...resto } = f;
  const actual = { ...resto, listaUrls };
  const { salas: _salasGuardadas, ...guardada } = casa;
  const cambiado = JSON.stringify(actual) !== JSON.stringify(guardada);
  const campo = <K extends keyof ConfigCasa>(k: K, v: ConfigCasa[K]) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      const c = await guardarSeccion<ConfigCasa>('casa', actual);
      setF(c);
      setUrls(c.listaUrls.join('\n'));
      onGuardado(c);
      setEstado({ tipo: 'ok', texto: 'Guardado.' });
    } catch (err) {
      setEstado({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const opcion = <K extends keyof ConfigCasa>(k: K, v: ConfigCasa[K], titulo: string, texto: string) => (
    <button type="button" className="cfg-opcion" aria-pressed={f[k] === v} onClick={() => campo(k, v)}>
      <b>{titulo}</b>
      <span>{texto}</span>
    </button>
  );
  const interruptor = (k: 'letrero' | 'motoresCielo' | 'deriva' | 'musica' | 'aleatorio' | 'pausarOculta', titulo: string, texto: string) => (
    <div className="cfg-linea">
      <div>
        <b>{titulo}</b>
        <span>{texto}</span>
      </div>
      <button type="button" role="switch" aria-checked={f[k]} aria-label={titulo} className="cfg-switch" onClick={() => campo(k, !f[k])}>
        <i />
      </button>
    </div>
  );

  return (
    <form className="cfg-form" onSubmit={guardar}>
      <section className="cfg-grupo">
        <h3>Nombres de los agentes</h3>
        <div className="cfg-opciones tres">
          {opcion('etiquetas', 'siempre', 'Siempre', 'Nombre sobre la cabeza; nombre y cargo al pasar el mouse.')}
          {opcion('etiquetas', 'hover', 'Al pasar el mouse', 'Nombre y cargo solo al pasar el mouse.')}
          {opcion('etiquetas', 'nunca', 'Nunca', 'Solo al seleccionar a alguien.')}
        </div>
      </section>

      <SeccionLogo />

      <section className="cfg-grupo">
        <h3>Fachada y cámara</h3>
        {interruptor('letrero', 'Letrero LED', 'Muestra en la fachada el proyecto activo; tócalo para cambiar de proyecto.')}
        {interruptor('motoresCielo', 'Motores en el cielo', 'Vuelan sobre la casa, unidos por un cable. Los pulsos muestran los trabajos en marcha de cada motor.')}
        {interruptor('deriva', 'Cámara en movimiento suave', 'La vista se mece despacio cuando no la tocas (no con «reducir movimiento»).')}
        <div className="cfg-fila">
          <label>
            Hora de la casa
            <select value={f.horaModo} onChange={(e) => campo('horaModo', e.target.value as ConfigCasa['horaModo'])}>
              <option value="real">Real (zona horaria de General)</option>
              <option value="fija">Fija</option>
            </select>
          </label>
          <label>
            Calidad gráfica
            <select value={f.calidad} onChange={(e) => campo('calidad', e.target.value as ConfigCasa['calidad'])}>
              <option value="auto">Automática</option>
              <option value="alta">Alta (sombras reales)</option>
              <option value="media">Media</option>
              <option value="baja">Baja (equipos lentos)</option>
            </select>
          </label>
        </div>
        {f.horaModo === 'fija' && (
          <label>
            Siempre a las {hhmm(f.horaFija)}
            <input type="range" min={0} max={23.5} step={0.5} value={f.horaFija} onChange={(e) => campo('horaFija', Number(e.target.value))} />
          </label>
        )}
      </section>

      {hogar && <PlanoSalas casa={hogar} onGuardado={onGuardado} />}
      {hogar && <SeccionObras casa={hogar} onGuardado={onGuardado} />}

      <section className="cfg-grupo">
        <h3>Música de fondo</h3>
        {interruptor('musica', 'Reproductor', 'Muestra el reproductor en la casa. El navegador pide un toque en ▶ antes de sonar.')}
        {f.musica && (
          <>
            <label>
              Volumen: {f.volumen} %
              <input type="range" min={0} max={100} value={f.volumen} onChange={(e) => campo('volumen', Number(e.target.value))} />
            </label>
            {interruptor('aleatorio', 'Orden aleatorio', 'Mezcla la lista de reproducción.')}
            {interruptor('pausarOculta', 'Pausar al cambiar de pestaña', 'Se detiene si la casa no está a la vista y sigue al volver.')}
            <p className="cfg-nota">
              {musica ? (
                <>
                  Carpeta: <code>{musica.carpeta}</code> · {musica.pistas.length} {musica.pistas.length === 1 ? 'pista' : 'pistas'} (mp3, ogg, m4a, wav, flac, webm).
                </>
              ) : (
                'No se pudo leer la carpeta de música.'
              )}
            </p>
            <label>
              Además, URLs directas a archivos de audio (una por línea)
              <textarea rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://ejemplo.com/musica/tema.mp3" spellCheck={false} />
            </label>
          </>
        )}
      </section>

      <div className="cfg-acciones">
        {estado && <span className={`cfg-aviso ${estado.tipo}`}>{estado.texto}</span>}
        <button
          type="button"
          className="btn"
          disabled={!cambiado || guardando}
          onClick={() => {
            setF(casa);
            setUrls(casa.listaUrls.join('\n'));
          }}
        >
          Descartar
        </button>
        <button type="submit" className="btn principal" disabled={!cambiado || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
