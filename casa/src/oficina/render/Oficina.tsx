import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import { horaChile as aHoraChile } from '../ambiente/hora';
import { catalogoBase } from '../catalogo/base';
import { paqueteHalloween } from '../catalogo/halloween';
import { crearCatalogo, registrarPaquete } from '../catalogo/registro';
import type { PresenciaJules } from '../animacion/presencia';
import { plano, versionPlano } from '../mansion/plano';
import { decidirCalidad } from '../rendimiento/calidad';
import type { NivelCalidad } from '../rendimiento/calidad';
import { frameloopPara } from '../rendimiento/visibilidad';
import type { AgenteOficina, Catalogo, Departamento, MetricasRender, ModoEtiquetas } from '../tipos';
import { LetreroLed } from './LetreroLed';
import type { Letrero } from './LetreroLed';
import { resolverAtuendo } from '../vestuario/resolver';
import { atuendoPorRol } from '../vestuario/roles';
import type { Rig } from './animador';
import { FOV_VERTICAL } from './camara';
import type { Punto3 } from './camara';
import { Casa } from './casa/Casa';
import { Cielo } from './casa/Cielo';
import { EspejoAgua } from './casa/EspejoAgua';
import { paletaLuz } from './casa/luz';
import { CorteCasa } from './casa/CorteCasa';
import { CartelesSalas } from './casa/CartelesSalas';
import { MotoresCielo } from './casa/MotoresCielo';
import type { MotorCielo } from './casa/MotoresCielo';
import { ObrasEnCurso } from './casa/ObrasEnCurso';
import type { ObraEnCurso } from './casa/ObrasEnCurso';
import { alturaDeCorte, nivelOculto } from './casa/corte';
import { ControlesCamara } from './ControlesCamara';
import { Jules } from './Jules';
import { asignarPuestos, departamentosBase } from './layout';
import { Luces } from './Luces';
import { useMetricas } from './metricas';
import { Personas } from './Personas';
import { esEscritorio, hayWebGL, useReduceMotion } from './preferencias';
import { precalentarTexturas } from './texturas';
import { ZonasAmbiente } from './ZonasAmbiente';

export interface OficinaProps {
  agentes: AgenteOficina[];
  onSeleccionar?: (id: string | null) => void;
  seleccionadoId?: string | null;
  /** `false` detiene el render (frameloop 'never'); al volver a `true` retoma. */
  visible?: boolean;
  /** Por defecto, los 6 departamentos del prototipo. */
  departamentos?: Departamento[];
  /** Por defecto, base + Halloween. */
  catalogo?: Catalogo;
  /** Por defecto, la hora actual de America/Santiago. */
  horaChile?: Date;
  /**
   * Las sombras reales del sol solo se activan con `'alta'` y puntero fino (escritorio);
   * en el resto cada persona lleva una sombra de contacto barata.
   */
  calidad?: 'auto' | 'alta' | 'media' | 'baja';
  /** Acerca la cámara a este agente (como en el vestidor) y vuelve al soltarlo (`null`). */
  enfocadoId?: string | null;
  /**
   * Ambiente de la casa al que se entró (id de `plano.ambientes`); `null` es la casa completa.
   * Controlado si llega; si no, la oficina lo lleva sola.
   */
  ambienteId?: string | null;
  /** Avisa al tocar un ambiente (`id`) o salir tocando fuera de la casa (`null`). */
  onAmbiente?: (id: string | null) => void;
  /** Cada vez que cambia el número, la cámara vuelve a la vista general inicial (y se sale del ambiente y del enfoque). */
  vistaGeneral?: number;
  onMetricas?: (metricas: MetricasRender) => void;
  /** Qué hace Jules: cambia el orbe (escucha, piensa, habla, espera). Por defecto `reposo`. */
  presenciaJules?: PresenciaJules;
  /** Volumen de la voz de Jules (0..1) mientras `hablando`; sin él, el pulso usa un ritmo sintético. */
  nivelVozJules?: number;
  /**
   * Deriva lenta de la cámara (rad/s de pico) para que ningún plano quede quieto: el azimut se
   * mece dentro de los límites del modo actual, solo mientras el usuario no toca la cámara y
   * sin `prefers-reduced-motion`. Sin ella (o con 0) la cámara no se mueve sola.
   */
  derivaCamara?: number;
  /** Nadie sale de la sala de su departamento (para recorridos narrados): sin café ni visitas fuera de ella. */
  retenerEnSala?: boolean;
  /**
   * Entrega una vez una función que proyecta a píxeles de la escena un punto 3D (`{x, y, z}` en
   * metros) o la cabeza de un agente (por id), con la cámara de ese instante. Devuelve `null` si
   * el agente no existe; `visible` es `false` si queda detrás de la cámara. Sirve para anclar
   * HTML (tarjetas, cursores) a la escena.
   */
  onProyector?: (proyectar: Proyector) => void;
  /**
   * Con alguien enfocado, la cámara esquiva lo que le tapa la cara (muro, mueble alto u otra
   * persona): rodea por el azimut y, si no hay ángulo limpio, se acerca. Sin ella, el encuadre
   * es el de siempre.
   */
  encuadreLibre?: boolean;
  /** La cámara enfoca a Jules (cuerpo entero, en reposo en el atrio); `enfocadoId` se ignora. */
  enfocaJules?: boolean;
  /** Jules mira directo a cámara en vez de en tres cuartos. */
  julesDeFrente?: boolean;
  /** Jules se queda de pie, como personaje, en su sitio de reposo: no viaja ni se aparta de la cámara. */
  julesPresente?: boolean;
  /** Cada vez que cambia, la cámara llega de golpe a su nuevo destino (corte) en vez de viajar. */
  corteCamara?: number;
  /** Nombre sobre la cabeza (Oficina DevBox). Por defecto, solo el seleccionado. */
  etiquetas?: ModoEtiquetas;
  /** Letrero LED en la fachada con el proyecto activo (Oficina DevBox); `null` lo oculta. */
  letrero?: Letrero | null;
  /** URL del logo de la casa, en la fachada junto al letrero. */
  logo?: string | null;
  /** Motores que vuelan sobre la casa. */
  motores?: readonly MotorCielo[];
  /** Al tocar un motor en el cielo. */
  onMotor?: () => void;
  /** Salas que se están levantando, con sus andamios y el ingeniero. */
  obras?: readonly ObraEnCurso[];
}

/** Posición en píxeles dentro del lienzo y si está delante de la cámara. */
export interface PuntoPantalla {
  x: number;
  y: number;
  visible: boolean;
}
export type Proyector = (objetivo: Punto3 | string) => PuntoPantalla | null;

const ALTURA_CABEZA_PROYECTADA = 1.1;

let catalogoPorDefecto: Catalogo | undefined;
function obtenerCatalogoPorDefecto(): Catalogo {
  catalogoPorDefecto ??= registrarPaquete(crearCatalogo(catalogoBase), paqueteHalloween);
  return catalogoPorDefecto;
}

const ESTILO_FALLBACK = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: 24,
  boxSizing: 'border-box',
  textAlign: 'center',
  color: '#c9ced6',
  background: '#0b0d10',
  font: '500 15px/1.5 system-ui, sans-serif',
} as const;

/**
 * Jules en reposo es el foco del atrio de doble altura: a media altura del vacío (la mitad de
 * sus 7,5 m) y más grande que una persona, sobre el espejo de agua que lo refleja.
 */
const REPOSO_JULES = { x: plano.jules.x, y: 3.7, z: plano.jules.z };
const ESCALA_JULES = 1.45;

function Medidor(props: Parameters<typeof useMetricas>[0]) {
  useMetricas(props);
  return null;
}

/**
 * La oficina en 3D: salas por departamento, escritorios, personas animadas y Jules.
 * Si el navegador no tiene WebGL muestra un texto y avisa con `onMetricas({ webgl: false })`.
 */
export function Oficina(props: OficinaProps) {
  const [conWebGL] = useState(hayWebGL);
  const { onMetricas } = props;
  useEffect(() => {
    if (!conWebGL) onMetricas?.({ webgl: false });
  }, [conWebGL, onMetricas]);

  if (!conWebGL) {
    return (
      <div role="img" aria-label="Oficina en 3D no disponible" style={ESTILO_FALLBACK}>
        No se puede mostrar la oficina en 3D porque este navegador o dispositivo no tiene WebGL
        activado.
      </div>
    );
  }
  return <Escena {...props} />;
}

function Escena({
  agentes,
  onSeleccionar,
  seleccionadoId,
  visible = true,
  departamentos = departamentosBase,
  catalogo,
  horaChile,
  calidad = 'auto',
  enfocadoId = null,
  ambienteId,
  onAmbiente,
  vistaGeneral = 0,
  onMetricas,
  presenciaJules = 'reposo',
  nivelVozJules,
  derivaCamara = 0,
  retenerEnSala = false,
  onProyector,
  encuadreLibre = false,
  enfocaJules = false,
  julesDeFrente = false,
  julesPresente = false,
  corteCamara = 0,
  etiquetas = 'nunca',
  letrero = null,
  logo = null,
  motores,
  obras,
  onMotor,
}: OficinaProps) {
  useMemo(precalentarTexturas, []);
  const rigs = useRef(new Map<string, Rig>());

  // --- selección: controlada si llega `seleccionadoId`, interna si no ---
  const [interno, setInterno] = useState<string | null>(null);
  const seleccionado = seleccionadoId !== undefined ? seleccionadoId : interno;
  const seleccionar = useCallback(
    (id: string | null) => {
      setInterno(id);
      onSeleccionar?.(id);
    },
    [onSeleccionar],
  );

  // --- ambiente: controlado si llega `ambienteId`, interno si no ---
  const [ambienteInterno, setAmbienteInterno] = useState<string | null>(null);
  const ambienteActivoId = ambienteId !== undefined ? ambienteId : ambienteInterno;
  const ambiente = useMemo(
    () => plano.ambientes.find((a) => a.id === ambienteActivoId) ?? null,
    [ambienteActivoId],
  );
  // Punto elegido con doble toque: nuevo centro de la órbita hasta salir, cambiar de ambiente o pedir la vista general.
  const [foco, setFoco] = useState<Punto3 | null>(null);
  // Un toque en la casa: entra al ambiente (o sale si fue fuera) y suelta la selección.
  const alToque = useCallback(
    (id: string | null) => {
      if (id !== ambienteActivoId) setFoco(null);
      setAmbienteInterno(id);
      onAmbiente?.(id);
      if (seleccionado !== null) seleccionar(null);
    },
    [ambienteActivoId, onAmbiente, seleccionado, seleccionar],
  );
  const vistaAnterior = useRef(vistaGeneral);
  useEffect(() => {
    if (vistaAnterior.current === vistaGeneral) return;
    vistaAnterior.current = vistaGeneral;
    setFoco(null);
    setAmbienteInterno(null);
  }, [vistaGeneral]);

  // --- datos derivados ---
  const catalogoActivo = catalogo ?? obtenerCatalogoPorDefecto();
  const version = versionPlano();
  const puestos = useMemo(() => asignarPuestos(agentes, departamentos), [agentes, departamentos, version]);
  const atuendos = useMemo(
    () =>
      agentes.map((a, i) => resolverAtuendo(catalogoActivo, a.atuendo ?? atuendoPorRol(a.rol, i))),
    [agentes, catalogoActivo],
  );

  // --- hora y luz ---
  const [reloj, setReloj] = useState(() => new Date());
  useEffect(() => {
    if (horaChile) return;
    const id = setInterval(() => setReloj(new Date()), 60_000);
    return () => clearInterval(id);
  }, [horaChile]);
  const paleta = useMemo(() => paletaLuz(aHoraChile(horaChile ?? reloj)), [horaChile, reloj]);

  // --- calidad ---
  const reducirMovimiento = useReduceMotion();
  const [nivel, setNivel] = useState<NivelCalidad>('alta');
  const ajuste = decidirCalidad({
    modo: calidad,
    nivelActual: nivel,
    p95: 0,
    muestras: 0,
    reduceMotion: reducirMovimiento,
  });
  const vigente = useRef({ calidad, nivel, reducirMovimiento });
  vigente.current = { calidad, nivel, reducirMovimiento };
  // Sombras reales del sol: solo con calidad 'alta' pedida y un puntero fino (escritorio).
  const [escritorio] = useState(esEscritorio);
  const sombras = ajuste.sombras && calidad === 'alta' && escritorio;
  const alMuestrear = useCallback((p95: number, muestras: number) => {
    const { calidad: modo, nivel: actual, reducirMovimiento: reduce } = vigente.current;
    const decision = decidirCalidad({
      modo,
      nivelActual: actual,
      p95,
      muestras,
      reduceMotion: reduce,
    });
    if (modo !== 'auto' || decision.nivel === actual) return false;
    setNivel(decision.nivel);
    return true;
  }, []);

  // --- Jules: espera en el atrio; con alguien enfocado o seleccionado se aparta a un costado ---
  const alProyector = useRef(onProyector);
  alProyector.current = onProyector;
  const julesPos = useMemo(() => new Vector3(REPOSO_JULES.x, REPOSO_JULES.y, REPOSO_JULES.z), []);

  return (
    <Canvas
      camera={{ fov: FOV_VERTICAL, position: [0, 20, 120], near: 0.5, far: 600 }}
      dpr={[1, ajuste.dpr]}
      frameloop={frameloopPara(visible)}
      shadows={sombras ? 'soft' : false}
      gl={{ antialias: true, powerPreference: 'default' }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onCreated={({ gl, get }) => {
        // La exposición la fija la luz según la hora (`Luces`).
        gl.toneMapping = ACESFilmicToneMapping;
        alProyector.current?.((objetivo) => {
          const { camera, size } = get();
          const punto =
            typeof objetivo === 'string'
              ? rigs.current.get(objetivo)?.raiz.position
              : new Vector3(objetivo.x, objetivo.y, objetivo.z);
          if (!punto) return null;
          const v = new Vector3(
            punto.x,
            punto.y + (typeof objetivo === 'string' ? ALTURA_CABEZA_PROYECTADA : 0),
            punto.z,
          ).project(camera);
          return {
            x: ((v.x + 1) / 2) * size.width,
            y: ((1 - v.y) / 2) * size.height,
            visible: v.z < 1,
          };
        });
      }}
      onPointerMissed={() => alToque(null)}
    >
      <Cielo paleta={paleta} movimiento={ajuste.movimiento} />
      <Luces paleta={paleta} sombras={sombras} />
      {/* La arquitectura se arma de una vez: al construir o demoler una sala se rehace entera. */}
      <Casa key={version} paleta={paleta} sombras={sombras} movimiento={ajuste.movimiento} />
      <CartelesSalas departamentos={departamentos} />
      {/* Al entrar a una sala se corta lo de arriba: el cable quedaría colgando de una azotea oculta. */}
      {motores && !nivelOculto('torre', alturaDeCorte(ambiente)) && <MotoresCielo motores={motores} movimiento={reducirMovimiento ? 0 : ajuste.movimiento} onTocar={onMotor} />}
      {/* Dentro de una sala se corta lo de arriba: los andamios quedarían flotando. */}
      {obras && obras.length > 0 && !ambiente && <ObrasEnCurso obras={obras} movimiento={reducirMovimiento ? 0 : ajuste.movimiento} />}
      <EspejoAgua
        paleta={paleta}
        jules={julesPos}
        escalaJules={ESCALA_JULES}
        movimiento={ajuste.movimiento}
      />
      <Personas
        agentes={agentes}
        atuendos={atuendos}
        puestos={puestos}
        seleccionadoId={seleccionado}
        onSeleccionar={seleccionar}
        movimiento={ajuste.movimiento}
        paseos={ajuste.paseos}
        sombras={sombras}
        jules={julesPos}
        enfocadoId={enfocadoId}
        ambienteId={ambiente?.id ?? null}
        retenerEnSala={retenerEnSala}
        rigs={rigs}
        etiquetas={etiquetas}
      />
      {(letrero || logo) && <LetreroLed {...letrero} logo={logo} />}
      <Jules
        posicion={julesPos}
        apartarDeId={enfocadoId ?? seleccionado}
        enAmbiente={ambiente !== null && !enfocaJules}
        deFrente={julesDeFrente}
        presente={julesPresente}
        rigs={rigs}
        movimiento={ajuste.movimiento}
        presencia={presenciaJules}
        nivelVoz={nivelVozJules}
        reposo={REPOSO_JULES}
        escala={ESCALA_JULES}
      />
      <ZonasAmbiente onToque={alToque} onDobleToque={setFoco} />
      <CorteCasa ambiente={ambiente} rigs={rigs} />
      <ControlesCamara
        enfocadoId={enfocadoId}
        ambiente={ambiente}
        foco={foco}
        reinicio={vistaGeneral}
        rigs={rigs}
        deriva={derivaCamara}
        encuadreLibre={encuadreLibre}
        corte={corteCamara}
        jules={enfocaJules ? julesPos : null}
      />
      <Medidor agentes={agentes.length} onMetricas={onMetricas} alMuestrear={alMuestrear} />
    </Canvas>
  );
}
