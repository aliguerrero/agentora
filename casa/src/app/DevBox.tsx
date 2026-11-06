import { useCallback, useEffect, useMemo, useState } from 'react';
import { Oficina, plano } from '@jules/oficina';
import type { MetricasRender } from '@jules/oficina';
import { aCasa, api } from './api';
import { fechaChileA, horaEnZona } from './hora';
import type { Casa, ConfigCasa, EstadoApi } from './api';
import { Leyenda } from './Leyenda';
import { ListaEquipo } from './ListaEquipo';
import { SalaReuniones } from './SalaReuniones';
import { SALA_REUNIONES } from './salas';
import { PanelAgente } from './PanelAgente';
import { PanelPatricia } from './PanelPatricia';
import type { SenalAgente } from '@jules/oficina';
import { ConfigPanel } from './config/ConfigPanel';
import { ElegirDepartamento } from './ElegirDepartamento';
import { Asistente } from './Asistente';
import { Reproductor } from './Reproductor';
import { SelectorProyecto } from './SelectorProyecto';
import type { General } from './config/configApi';
import { cargarAmbiente, guardarAmbiente } from './persistencia';
import './estilos.css';
import './devbox.css';

const idsAmbientes = plano.ambientes.map((a) => a.id);
const REFRESCO_MS = 5000;

/** La casa 3D con los empleados reales de la oficina. */
export function DevBox() {
  const [casa, setCasa] = useState<Casa | null>(null);
  const [panelPatricia, setPanelPatricia] = useState(false);
  const [patriciaEnviando, setPatriciaEnviando] = useState(false);
  const abrirPatricia = useCallback(() => { setSeleccionadoId(null); setPanelReunion(false); setPanelPatricia(true); }, []);
  const alSenales = useCallback((senales: SenalAgente[], proyecto: string) => setCasa((c) => c?.proyecto?.id === proyecto ? { ...c, senales } : c), []);
  // Cambia al cambiar de proyecto: recarga el equipo del nuevo proyecto al instante.
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [ambienteId, setAmbienteId] = useState<string | null>(() => cargarAmbiente(idsAmbientes));
  const [vista, setVista] = useState(0);
  const [visible, setVisible] = useState(!document.hidden);
  const [, setMetricas] = useState<MetricasRender>({ webgl: true });
  const alMedir = useCallback((m: MetricasRender) => setMetricas(m), []);
  // Área de configuración: botón ⚙ o enlace directo /casa#config (o #config/motores).
  const pestanaHash = () => (/^#config(?:\/(\w+))?$/.exec(window.location.hash) ? (window.location.hash.split('/')[1] ?? 'general') : null);
  const [config, setConfig] = useState<string | null>(pestanaHash);
  useEffect(() => {
    const alCambiar = () => setConfig(pestanaHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const cerrarConfig = useCallback(() => {
    setConfig(null);
    if (window.location.hash.startsWith('#config')) history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const abrirMotores = useCallback(() => setConfig('motores'), []);
  const alGuardarGeneral = useCallback((g: General) => {
    setCasa((c) => (c ? { ...c, casa: g.casa, zonaHoraria: g.zonaHoraria, ceo: g.asistente } : c));
  }, []);
  const alGuardarCasa = useCallback((cfg: ConfigCasa) => {
    setCasa((c) => (c ? { ...c, config: cfg } : c));
    // Las salas salen de esta configuración: se pide el estado de nuevo para aplicarlas ya.
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => guardarAmbiente(ambienteId), [ambienteId]);

  // Entrar a la sala de reuniones abre su panel. Salir lo cierra, salvo si hay una reunión en marcha.
  const [panelReunion, setPanelReunion] = useState(false);
  const [reunionEnCurso, setReunionEnCurso] = useState(false);
  const abrirReunion = useCallback(() => {
    setSeleccionadoId(null);
    setPanelReunion(true);
  }, []);
  useEffect(() => {
    if (ambienteId === SALA_REUNIONES) abrirReunion();
    else if (!reunionEnCurso) setPanelReunion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de sala
  }, [ambienteId]);
  const alEnCurso = useCallback((enCurso: boolean) => {
    setReunionEnCurso(enCurso);
    if (enCurso) setAmbienteId(SALA_REUNIONES);
  }, []);

  useEffect(() => {
    const alCambiar = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await api('/api/estado');
        if (r.status === 401) throw new Error('Token inválido: recarga la página.');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const datos = (await r.json()) as EstadoApi;
        if (vivo) {
          setCasa(aCasa(datos));
          setError('');
        }
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    };
    void cargar();
    const t = setInterval(() => {
      if (!document.hidden) void cargar();
    }, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [version]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSeleccionadoId(null);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // El motor de Jules calcula la luz con la hora de Santiago: se le pasa una fecha cuya hora
  // en Santiago es la hora actual en la zona configurada. Se recalcula cada minuto.
  const [minuto, setMinuto] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinuto((m) => m + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const zona = casa?.zonaHoraria;
  const cfgCasa = casa?.config ?? null;
  // Hora real de la zona configurada, o fija (Configuración › Casa).
  const horaLocal = useMemo(() => {
    if (cfgCasa?.horaModo === 'fija') return fechaChileA(cfgCasa.horaFija);
    return zona ? fechaChileA(horaEnZona(zona)) : undefined;
  }, [zona, minuto, cfgCasa?.horaModo, cfgCasa?.horaFija]);
  const [selectorProyecto, setSelectorProyecto] = useState(false);
  const letrero = useMemo(
    () => (cfgCasa?.letrero === false ? null : { texto: casa?.proyecto?.nombre ?? 'Sin proyecto', onClick: () => setSelectorProyecto(true) }),
    [cfgCasa?.letrero, casa?.proyecto?.nombre],
  );
  useEffect(() => {
    if (casa?.casa) document.title = casa.casa;
  }, [casa?.casa]);
  // Pestaña del navegador: el logo de la casa, o el icono de siempre si no tiene.
  const logo = casa?.logo ?? null;
  useEffect(() => {
    const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icono) return;
    icono.removeAttribute('type');
    icono.href = logo ?? '/devbox-logo.svg';
  }, [logo]);

  const agentes = casa?.agentes ?? [];
  const seleccionado = agentes.find((a) => a.id === seleccionadoId);
  const trabajando = agentes.filter((a) => a.estado === 'trabajando').length;
  const esperan = agentes.filter((a) => a.estado === 'esperando_decision');
  const nombreSala = (id: string | null | undefined) => {
    if (!id) return '';
    const amb = plano.ambientes.find((a) => a.id === id);
    return casa?.nombreSala[amb?.departamento ?? id] ?? amb?.nombre ?? '';
  };
  const ambiente = plano.ambientes.find((a) => a.id === ambienteId);

  const salas = useMemo(
    () => (casa ? casa.departamentos.map((d) => ({ ...d, ambiente: plano.ambientes.find((a) => a.departamento === d.id)?.id })) : []),
    [casa],
  );

  return (
    <div className="lab devbox">
      <div className="escena">
        {casa && (
          <Oficina
            agentes={agentes}
            departamentos={casa.departamentos}
            seleccionadoId={seleccionadoId}
            onSeleccionar={(id) => { setSeleccionadoId(id); if (id) setPanelPatricia(false); }}
            onMetricas={alMedir}
            visible={visible}
            ambienteId={ambienteId}
            onAmbiente={setAmbienteId}
            vistaGeneral={vista}
            presenciaJules={patriciaEnviando ? 'pensando' : panelPatricia ? 'escuchando' : esperan.length > 0 ? 'esperando_decision' : trabajando > 0 ? 'pensando' : 'reposo'}
            onPatricia={abrirPatricia}
            senales={casa.senales}
            proyectoSenales={casa.proyecto?.id}
            encuadreLibre
            horaChile={horaLocal}
            etiquetas={cfgCasa?.etiquetas ?? 'hover'}
            letrero={letrero}
            logo={logo}
            motores={casa.motores}
            obras={casa.obrasEnCurso}
            onMotor={abrirMotores}
            calidad={cfgCasa?.calidad ?? 'auto'}
            derivaCamara={cfgCasa?.deriva ? 0.05 : 0}
          />
        )}
      </div>

      <header className="hud burbuja" aria-live="polite">
        <h1>
          {logo ? <img className="burbuja-logo" src={logo} alt="" /> : <span className="orbe" aria-hidden="true" />}
          {casa?.casa ?? 'Oficina'}
        </h1>
        <p className="burbuja-resumen">
          {casa
            ? `${trabajando} trabajando · ${esperan.length} ${esperan.length === 1 ? 'espera' : 'esperan'} tu respuesta · ${agentes.length} ${agentes.length === 1 ? 'empleado' : 'empleados'}`
            : 'Cargando la oficina…'}
        </p>
        <p className="burbuja-mensaje">
          {error ? (
            <b className="error">{error}</b>
          ) : esperan[0] ? (
            <>
              <b>{esperan.length === 1 ? esperan[0].nombre : `${esperan.length} personas`}</b>
              {esperan.length === 1 ? ' tiene una pregunta para ti.' : ' tienen preguntas para ti.'}
            </>
          ) : (
            agentes.length ? `${casa?.ceo ?? 'J.A.R.V.I.S.'}: todo en marcha, nadie te necesita ahora.` : `${casa?.ceo ?? 'J.A.R.V.I.S.'}: aún no hay agentes. Crea un proyecto en ⚙ › Proyectos.`
          )}
        </p>
      </header>

      <nav className="hud salas" aria-label="Departamentos">
        <div className="salas-carril">
        <button type="button" className="sala sala-patricia" aria-pressed={panelPatricia} onClick={abrirPatricia}><i />✦ Patricia</button>
        {salas.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sala"
            aria-pressed={ambienteId === s.ambiente}
            style={{ ['--c' as string]: s.color }}
            onClick={() => {
              if (s.ambiente) setAmbienteId(s.ambiente);
              if (s.id === SALA_REUNIONES) abrirReunion();
            }}
          >
            <i />
            {s.nombre}
          </button>
        ))}
        </div>
        {casa && <ListaEquipo grupos={casa.grupos} agentes={agentes} onElegir={(id) => { setPanelPatricia(false); setSeleccionadoId(id); }} />}
      </nav>

      <Leyenda />

      {cfgCasa?.musica && (
        <Reproductor urls={cfgCasa.listaUrls} volumen={cfgCasa.volumen} aleatorio={cfgCasa.aleatorio} pausarOculta={cfgCasa.pausarOculta} />
      )}
      {selectorProyecto && (
        <SelectorProyecto
          onCerrar={() => setSelectorProyecto(false)}
          onCambiado={(p) => {
            setCasa((c) => (c ? { ...c, proyecto: p } : c));
            setSeleccionadoId(null);
            setPanelPatricia(false);
            setVersion((v) => v + 1);
          }}
          onGestionar={() => {
            setSelectorProyecto(false);
            setConfig('proyectos');
          }}
        />
      )}

      <button
        type="button"
        className="btn-config"
        aria-label={casa?.retenidos ? `Configuración: ${casa.retenidos} en cuarentena` : 'Configuración'}
        title={casa?.retenidos ? `${casa.retenidos} en cuarentena: esperan tu decisión` : 'Configuración'}
        onClick={() => setConfig(casa?.retenidos ? 'cuarentena' : 'general')}
      >
        ⚙
        {!!casa?.retenidos && <i className="btn-config-aviso">{casa.retenidos}</i>}
      </button>
      {casa && !casa.configurado && (
        <Asistente
          onTerminar={(pestana) => {
            setCasa((c) => (c ? { ...c, configurado: true } : c));
            setVersion((v) => v + 1);
            if (pestana) setConfig(pestana);
          }}
        />
      )}
      {config && <ConfigPanel inicial={config} onCerrar={cerrarConfig} onGeneral={alGuardarGeneral} onCasa={alGuardarCasa} hogar={casa} />}

      <div className="hud indicador-ambiente">
        {ambiente && (
          <span>
            <small>Dentro de</small>
            <b>{nombreSala(ambiente.id)}</b>
          </span>
        )}
        {ambiente && (
          casa && ambiente.departamento && ![SALA_REUNIONES, 'gerencia'].includes(ambiente.departamento) && ambiente.alto > 0 && casa.deptos.length > 0 && <ElegirDepartamento key={ambiente.departamento} casa={casa} sala={ambiente.departamento} onGuardado={alGuardarCasa} />
        )}
        {ambiente && (
          <button type="button" className="btn" onClick={() => setAmbienteId(null)}>
            Salir
          </button>
        )}
        {reunionEnCurso && !panelReunion && (
          <button type="button" className="btn principal" onClick={abrirReunion}>
            Ver la reunión
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAmbienteId(null);
            setVista((v) => v + 1);
          }}
        >
          Vista general
        </button>
      </div>

      {casa && <SalaReuniones casa={casa} abierta={panelReunion && !seleccionado} onCerrar={() => setPanelReunion(false)} onEnCurso={alEnCurso} />}
      {panelPatricia && casa ? <PanelPatricia key={casa.proyecto?.id} casa={casa} onCerrar={() => setPanelPatricia(false)} onEnviando={setPatriciaEnviando} onSenales={alSenales} /> : seleccionado ? (
        <PanelAgente
          key={seleccionado.id}
          agente={seleccionado}
          departamento={nombreSala(seleccionado.departamento) || 'Gerencia'}
          onCerrar={() => setSeleccionadoId(null)}
        />
      ) : panelReunion ? null : (
        <aside className="hud detalle" aria-live="polite">
          <p className="nota">Toca a un empleado o búscalo en «Agentes» para ver qué hace y hablar con él. Arrastra para girar la casa.</p>
        </aside>
      )}
    </div>
  );
}
