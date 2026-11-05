import type { Group, Vector3 } from 'three';
import type { Azar } from '../azar';
import { calcularPose, crearPose } from '../animacion/articulaciones';
import type { EntradaPose, Pose, PosturaCuerpo } from '../animacion/articulaciones';
import { caraPorEstado, estaParpadeando, planParpadeo } from '../animacion/expresion';
import type { PlanParpadeo } from '../animacion/expresion';
import { ajusteIdle, ajusteNeutro, nuevoIdle } from '../animacion/idle';
import type { AjusteIdle, Idle } from '../animacion/idle';
import {
  JULES,
  SEGUNDOS_GESTO,
  GIRO_SILLA_ENFOCADO,
  GIRO_SILLA_SALA,
  yawObjetivoAtento,
} from '../animacion/atencion';
import type { AtencionPersona } from '../animacion/atencion';
import { costadoLibre, debePararse, giroHacia } from '../animacion/costado';
import type { Interaccion } from '../animacion/interacciones';
import { avanzarMaquina, crearMaquina } from '../animacion/maquina';
import type { Maquina } from '../animacion/maquina';
import { frecuenciaPaso } from '../animacion/marcha';
import { atencionOrbe, calcularMirada, LIMITE_YAW, suavizar } from '../animacion/mirada';
import type { Mirada, Vec3 } from '../animacion/mirada';
import { perfilDeRol } from '../animacion/personalidad';
import type { PerfilIdle } from '../animacion/personalidad';
import {
  alturaNav,
  avanzarNav,
  destinoNav,
  llegoANodo,
  NODO_ASIENTO,
  NODO_PASILLO,
  NODO_SALIDA,
  NODO_VISITA,
} from '../animacion/ruta';
import type { Nav, Nodo, PuntoXZ } from '../animacion/ruta';
import { crearRuta, escribirVisita, quitarVisita } from '../mansion/rutas';
import type { AgenteOficina } from '../tipos';
import type { Puesto } from './layout';
import type { Parte } from './Pieza';
import { celdaIcono, celdasCara } from './texturas';

/** Piezas de una persona que el animador mueve; las registra `Persona` al montarse. */
export interface Rig {
  raiz: Group;
  pelvis: Group;
  columna: Group;
  torso: Group;
  cabeza: Group;
  piernas: readonly [{ cadera: Group; rodilla: Group }, { cadera: Group; rodilla: Group }];
  brazos: readonly [{ hombro: Group; codo: Group }, { hombro: Group; codo: Group }];
  taza: Parte;
  /** Hoja de papel en la mano izquierda (la muestran los idles de lectura). */
  hoja: Parte;
  /** Teléfono en la mano derecha. */
  telefono: Parte;
  /** Plano de la cara (su `celda` cambia con el parpadeo); `null` con cabeza de calabaza. */
  cara: Parte | null;
  /** Globo de estado: se muestra con `ancla.visible` y elige su `celda`. */
  icono: Parte;
  /** Aro bajo quien espera una decisión o está seleccionado; vive en coordenadas del mundo. */
  anillo: Group;
  /** Todas las piezas visibles del esqueleto, para dibujarlas instanciadas. */
  partes: readonly Parte[];
  /** Cara de un disfraz (vampiro, calavera, momia): no cambia con el estado. */
  caraFija: string | null;
  /** Lleva una taza equipada (pieza `taza`). */
  tazaEquipada: boolean;
  /** Altura del globo de estado sobre la cabeza. */
  alturaIcono: number;
}

interface BrazoSuave {
  hombro: number;
  abduccion: number;
  codo: number;
}

/** Estado de simulación de una persona (posición, postura, reloj de idle y parpadeo). */
export interface Sim {
  x: number;
  z: number;
  /** Altura del piso bajo la persona: sube y baja por las escaleras. */
  y: number;
  yaw: number;
  /** 0 = de pie, 1 = sentado. */
  sit: number;
  /** 0..1: cuánto de la marcha se aplica (rampa al empezar y terminar de caminar). */
  marcha: number;
  fase: number;
  /** Desfase propio para que nadie respire, teclee o gire en fase con otro. */
  fasePropia: number;
  maquina: Maquina;
  /** Nodo de la cadena de ruta al que va (ver `animacion/ruta.ts`). */
  meta: number;
  nav: Nav;
  /** Ruta del puesto, armada al crear la persona (`mansion/rutas.ts`); el bucle solo la lee. */
  cadena: Nodo[];
  /** Puesto para el que se armó la cadena y si termina en el aro de luz: si cambian, se rehace. */
  claveRuta: string;
  aLaLuz: boolean;
  /** Los nodos de visita de la cadena apuntan a un colega, mientras dura la visita y el regreso. */
  tramoVisita: boolean;
  /** Dónde quiere estar ahora, escrito cada cuadro. */
  destino: PuntoXZ;
  rol: string;
  perfil: PerfilIdle;
  /** 0..1: cuánto sigue con la mirada al orbe de Jules (solo si espera una decisión). */
  atencionOrbe: number;
  idle: Idle;
  idleDesde: number;
  plan: PlanParpadeo;
  planDesde: number;
  estadoVisto: AgenteOficina['estado'];
  caraFijaVista: string | null;
  cara: string;
  mirYaw: number;
  mirPitch: number;
  columna: number;
  brazos: [BrazoSuave, BrazoSuave];
  ajuste: AjusteIdle;
  /**
   * Cómo atiende al enfoque: `aqui` donde está (sentado gira el torso), o `costado` (se pone de
   * pie y da un paso al lado libre de su silla). Se decide al empezar el enfoque.
   */
  modoAtento: 'ninguno' | 'aqui' | 'costado';
  /** Punto de pie junto a su silla, del modo `costado`. */
  costado: PuntoXZ;
  /** Ya está donde va a atender (el gesto del enfoque espera a esto). */
  atentoListo: boolean;
}

/** Con quién está y qué hace con esa persona; lo rellena `Personas` antes de cada persona. */
export interface Relacion {
  interaccion: Interaccion | null;
  socio: Sim | null;
  puestoSocio: Puesto | null;
  /** Atención al enfoque de la cámara (`animacion/atencion.ts`); `null` si no aplica. */
  atencion: AtencionPersona | null;
  /** Rol `sala`: la simulación de quien mira (el enfocado). */
  foco: Sim | null;
}

export interface ContextoFrame {
  t: number;
  dt: number;
  /** 1 normal, 0,35 con `prefers-reduced-motion`. */
  movimiento: number;
  paseos: boolean;
  azar: Azar;
  /** Posición de Jules y de la cámara en el mundo (hacia quien miran). */
  jules: Vector3;
  camara: Vector3;
  /** Nadie sale de su sala: sin paseos al café, y quien está fuera vuelve a su lugar a paso ligero. */
  retenerEnSala?: boolean;
}

/** Velocidad de paseo (m/s). */
export const VELOCIDAD_PASEO = 1.15;
/** Largo de la pierna de la cadera al suelo (m), para que el pie de apoyo no deslice. */
const LARGO_PIERNA = 0.6;
const UMBRAL_LLEGADA = 0.03;
/** Cuánto baja la raíz del cuerpo al sentarse (m): la pelvis queda a `0,62 - BAJA_SENTADO`. */
export const BAJA_SENTADO = 0.17;
const DISTANCIA_MIRA_JULES = 13;
/** Retardo (s) de la cabeza al seguir su objetivo. */
const TAU_MIRADA = 0.25;
const IDLE_QUIETO: Idle = { variante: 'respirar', duracion: 1, fase: 0 };
/** Idles que fuerzan la pausa y las interacciones (no los sortea el azar). */
const IDLE_LUZ: Idle = { variante: 'probar_luz', duracion: 1, fase: 0 };
const IDLE_TELEFONO: Idle = { variante: 'telefono', duracion: 1, fase: 0 };
const IDLE_SENALAR: Idle = { variante: 'senalar', duracion: 1, fase: 0 };
const IDLE_ASENTIR: Idle = { variante: 'asentir', duracion: 1, fase: 0 };
/** Progreso de un idle forzado: en el centro de su envolvente (peso pleno). */
const PLENO = 0.5;
/** Quien camina en círculo hablando por teléfono: radio (m) y velocidad angular (rad/s). */
const RADIO_CIRCULO = 0.5;
const GIRO_CIRCULO = 2.6;
/** Un turno de palabra en una conversación (s). */
const TURNO = 2.6;
/** El colega sentado mira al visitante cuando éste está a menos de esto (m). */
const DISTANCIA_RECIBE = 2;
/** Altura (m sobre el piso) de la pantalla que mira quien trabaja sentado. */
const PANTALLA_Y = 1.0;
const BRAZO_DE_PIE: BrazoSuave = { hombro: 0, abduccion: 0.05, codo: 0.15 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function lerpAngulo(a: number, b: number, k: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

const limitar = (valor: number, limite: number) => Math.max(-limite, Math.min(limite, valor));

/** Nodo de la cadena de ruta al que lleva cada objetivo de la máquina de estados. */
function nodoDe(objetivo: 'asiento' | 'de_pie' | 'cafe', cadena: readonly Nodo[]): number {
  if (objetivo === 'asiento') return NODO_ASIENTO;
  return objetivo === 'de_pie' ? NODO_SALIDA : cadena.length - 1;
}

/** ¿Pausa en el aro de luz? Su perfil lo pide y su ambiente lo tiene; si no, va al café. */
const vaALaLuz = (puesto: Puesto, perfil: PerfilIdle): boolean =>
  perfil.destinoPaseo === 'luz' && puesto.luz !== null;

function rutaDelPuesto(puesto: Puesto, aLaLuz: boolean): Nodo[] {
  return crearRuta(puesto.lugar, aLaLuz && puesto.luz ? puesto.luz : puesto.cafe, aLaLuz);
}

/** Crea la simulación de una persona: sentada en su puesto, o de pie si espera una decisión. */
export function crearSim(agente: AgenteOficina, puesto: Puesto, t: number, azar: Azar): Sim {
  const espera = agente.estado === 'esperando_decision';
  const inicio = espera ? puesto.parado : puesto.asiento;
  const caraEstado = caraPorEstado(agente.estado, azar);
  const perfil = perfilDeRol(agente.rol);
  const aLaLuz = vaALaLuz(puesto, perfil);
  return {
    x: inicio.x,
    z: inicio.z,
    y: puesto.y,
    yaw: espera ? Math.PI / 4 : puesto.yawSentado,
    sit: espera || !puesto.sentado ? 0 : 1,
    marcha: 0,
    fase: 0,
    fasePropia: azar() * Math.PI * 2,
    maquina: crearMaquina(t, azar),
    meta: espera ? NODO_SALIDA : NODO_ASIENTO,
    nav: { nodo: espera ? NODO_SALIDA : NODO_ASIENTO, hacia: -1 },
    cadena: rutaDelPuesto(puesto, aLaLuz),
    claveRuta: puesto.clave,
    aLaLuz,
    tramoVisita: false,
    destino: { x: inicio.x, z: inicio.z },
    rol: agente.rol,
    perfil,
    atencionOrbe: 0,
    idle: nuevoIdle(azar, perfil.pesos),
    idleDesde: t - azar() * 3,
    plan: planParpadeo(azar),
    planDesde: t - azar() * 3,
    estadoVisto: agente.estado,
    caraFijaVista: null,
    cara: caraEstado,
    mirYaw: 0,
    mirPitch: 0,
    columna: 0,
    brazos: [{ ...BRAZO_DE_PIE }, { ...BRAZO_DE_PIE }],
    ajuste: ajusteNeutro(),
    modoAtento: 'ninguno',
    costado: { x: 0, z: 0 },
    atentoListo: true,
  };
}

// Objetos reutilizados entre llamadas: el bucle no crea vectores ni entradas por cuadro.
const cabezaMundo: Vec3 = { x: 0, y: 0, z: 0 };
const objetivoSocio: Vec3 = { x: 0, y: 0, z: 0 };
const entradaMirada = { posCabeza: cabezaMundo, yawCuerpo: 0, objetivo: cabezaMundo as Vec3 };
const entradaPose: EntradaPose = { fase: 0, postura: 'de_pie', velocidad: 0, t: 0 };
const pose = crearPose();
const poseDePie = crearPose();
const poseSentada = crearPose();
const piernasMezcla = crearPose().piernas;
const miradaHaciaObjetivo: Mirada = { yaw: 0, pitch: 0 };
const miradaAlOrbe: Mirada = { yaw: 0, pitch: 0 };
const puntoCirculo: PuntoXZ = { x: 0, z: 0 };
const puntoAqui: PuntoXZ = { x: 0, z: 0 };

/** Mezcla las piernas de dos poses (de pie → sentado) según `peso`, en `salida`. */
function mezclarPiernas(de: Pose, a: Pose, peso: number, salida: Pose['piernas']): Pose['piernas'] {
  for (let i = 0; i < 2; i++) {
    const lado = i as 0 | 1;
    salida[lado].cadera = lerp(de.piernas[lado].cadera, a.piernas[lado].cadera, peso);
    salida[lado].rodilla = lerp(de.piernas[lado].rodilla, a.piernas[lado].rodilla, peso);
  }
  return salida;
}

/** Altura de la cabeza de una persona (m) que pisa el piso `y`, según cuánto esté sentada. */
const alturaCabeza = (y: number, sit: number) => y - BAJA_SENTADO * sit + 0.62 + 0.83;

/**
 * Un cuadro de una persona: máquina de estados → ruta e interacciones → movimiento → pose
 * (ángulos de `calcularPose`) → transformaciones del rig. Solo asigna números (incluidas las
 * celdas de atlas de la cara y el globo); no dibuja texturas ni crea objetos de three.
 * Sin `c.paseos` (prefers-reduced-motion) no hay paseos, interacciones ni idles: solo
 * respiración y parpadeo.
 */
export function actualizarPersona(
  sim: Sim,
  rig: Rig,
  agente: AgenteOficina,
  puesto: Puesto,
  enfocado: boolean,
  seleccionado: boolean,
  c: ContextoFrame,
  relacion: Relacion,
): void {
  const { t, dt } = c;
  const k = Math.min(1, dt * 6);
  const tm = t * c.movimiento + sim.fasePropia;

  if (sim.rol !== agente.rol) {
    sim.rol = agente.rol;
    sim.perfil = perfilDeRol(agente.rol);
  }
  const perfil = sim.perfil;
  const aLaLuz = vaALaLuz(puesto, perfil);
  if (sim.claveRuta !== puesto.clave || sim.aLaLuz !== aLaLuz) {
    // Cambió su lugar o su destino de pausa: se rehace la ruta (rara vez; no es del bucle normal).
    sim.cadena = rutaDelPuesto(puesto, aLaLuz);
    sim.claveRuta = puesto.clave;
    sim.aLaLuz = aLaLuz;
    sim.tramoVisita = false;
    sim.nav.nodo = Math.min(sim.nav.nodo, sim.cadena.length - 1);
    sim.nav.hacia = sim.nav.hacia >= sim.cadena.length ? -1 : sim.nav.hacia;
  }

  // --- interacción vigente (nunca con prefers-reduced-motion) ---
  const inter = c.paseos ? relacion.interaccion : null;
  const socio = relacion.socio;
  const conversando = inter?.tipo === 'conversa' && socio !== null;
  const visita = inter?.tipo === 'visita' && socio !== null ? inter : null;
  const mostrando = visita?.fase === 'mostrar';
  const yendoAVisitar = visita !== null && visita.fase !== 'volver';
  // --- atención al enfoque: quien lo es (o comparte su sala) se detiene y mira ---
  const atencion = relacion.atencion;
  const rolAtencion = atencion?.rol ?? 'ninguno';
  const atento = rolAtencion === 'enfocado' || rolAtencion === 'sala';
  if (rolAtencion !== 'enfocado') {
    sim.modoAtento = 'ninguno';
    sim.atentoListo = true;
  } else if (sim.modoAtento === 'ninguno') {
    // Al empezar el enfoque: si la cámara pide girar la silla más de 45°, se para al costado.
    const sentadoAhora = puesto.sentado && sim.sit > 0.5;
    const pide = sentadoAhora && debePararse(giroHacia(puesto.lugar, c.camara.x, c.camara.z));
    sim.modoAtento =
      pide && costadoLibre(puesto.lugar, c.camara.x, c.camara.z, sim.costado) ? 'costado' : 'aqui';
    sim.atentoListo = sim.modoAtento === 'aqui';
  }
  const alCostado = sim.modoAtento === 'costado';
  const retener = conversando || inter?.tipo === 'visita' || atento;

  // --- ruta: los nodos de visita apuntan al colega mientras dura la visita y el regreso ---
  if (visita && !sim.tramoVisita && sim.nav.nodo <= NODO_PASILLO && relacion.puestoSocio) {
    escribirVisita(sim.cadena, relacion.puestoSocio.lugar);
    sim.tramoVisita = true;
  } else if (sim.tramoVisita && !visita && sim.nav.nodo <= NODO_PASILLO) {
    quitarVisita(sim.cadena);
    sim.tramoVisita = false;
  }

  // --- decisión: máquina de estados y movimiento ---
  const enDestino = llegoANodo(
    sim.nav,
    sim.meta,
    sim.cadena[sim.meta] ?? puesto.asiento,
    sim.x,
    sim.z,
    UMBRAL_LLEGADA,
  );
  const { maquina, salida } = avanzarMaquina(
    sim.maquina,
    {
      t,
      estado: agente.estado,
      actividad: agente.actividad,
      reduceMotion: !c.paseos,
      enfocado,
      enDestino,
      retener,
      ritmo: rolAtencion === 'ambiente' ? 0.5 : 1,
      sinPaseo: c.retenerEnSala === true,
    },
    c.azar,
  );
  sim.maquina = maquina;
  const ultimo = sim.cadena.length - 1;
  sim.meta = yendoAVisitar ? NODO_VISITA : nodoDe(salida.objetivo, sim.cadena);
  // Quien atiende al enfoque se queda donde está; al soltarlo retoma la ruta desde ahí.
  if (!atento) avanzarNav(sim.nav, sim.cadena, sim.meta, sim.x, sim.z, UMBRAL_LLEGADA);

  const enPausa = salida.paseando && salida.postura === 'de_pie';
  const quieto = sim.nav.hacia < 0 && sim.nav.nodo === sim.meta;
  let destino = destinoNav(sim.nav, sim.cadena) ?? puesto.asiento;
  if (atento) {
    puntoAqui.x = alCostado ? sim.costado.x : sim.x;
    puntoAqui.z = alCostado ? sim.costado.z : sim.z;
    destino = puntoAqui;
  }
  if (quieto) {
    if (conversando && inter && enPausa) destino = inter;
    else if (enPausa && perfil.pausa === 'telefono_circulo' && sim.meta === ultimo) {
      const angulo = tm * GIRO_CIRCULO;
      puntoCirculo.x = puesto.cafe.x + Math.cos(angulo) * RADIO_CIRCULO;
      puntoCirculo.z = puesto.cafe.z + Math.sin(angulo) * RADIO_CIRCULO;
      destino = puntoCirculo;
    }
  }
  sim.destino.x = destino.x;
  sim.destino.z = destino.z;
  const dx = destino.x - sim.x;
  const dz = destino.z - sim.z;
  const distancia = Math.hypot(dx, dz);

  const sentadoEnSuSitio = quieto && sim.meta === NODO_ASIENTO && distancia <= UMBRAL_LLEGADA;
  let yawDeseado = salida.sentarse ? puesto.yawSentado : Math.PI / 4;
  if (salida.paseando && salida.postura === 'de_pie') {
    yawDeseado = Math.PI / 4 + Math.sin(tm * 0.4) * 0.5;
    if (perfil.pausa === 'probar_luz') yawDeseado = 0.35;
  }
  // Retenido en su sala, quien estaba fuera vuelve al doble de ritmo.
  const velocidad = VELOCIDAD_PASEO * c.movimiento * (c.retenerEnSala ? 2 : 1);
  const caminaAhora = distancia > UMBRAL_LLEGADA && sim.sit < 0.08;
  if (caminaAhora) {
    const paso = Math.min(distancia, dt * velocidad + 0.0001);
    sim.x += (dx / distancia) * paso;
    sim.z += (dz / distancia) * paso;
    yawDeseado = Math.atan2(dx, dz);
    sim.fase += frecuenciaPaso(velocidad, LARGO_PIERNA) * dt;
  } else if (quieto && socio && (conversando || mostrando)) {
    // Quieto frente al otro: de cara a quien conversa, o a la pantalla que va a señalar.
    const haciaX = mostrando ? socio.x + Math.sin(socio.yaw) * 0.75 : socio.x;
    const haciaZ = mostrando ? socio.z + Math.cos(socio.yaw) * 0.75 : socio.z;
    yawDeseado = Math.atan2(haciaX - sim.x, haciaZ - sim.z);
  }
  if (atento && !caminaAhora && atencion) {
    // De cara a la cámara (el enfocado) o a quien presentan (el resto de la sala).
    const aJules = rolAtencion === 'sala' && atencion.objetivo === JULES;
    const aFoco = rolAtencion === 'sala' && !aJules && relacion.foco !== null;
    const haciaX = aJules ? c.jules.x : aFoco ? (relacion.foco?.x ?? 0) : c.camara.x;
    const haciaZ = aJules ? c.jules.z : aFoco ? (relacion.foco?.z ?? 0) : c.camara.z;
    yawDeseado = yawObjetivoAtento(
      sim.sit > 0.5 && !alCostado,
      puesto.yawSentado,
      rolAtencion === 'enfocado' ? GIRO_SILLA_ENFOCADO : GIRO_SILLA_SALA,
      sim.x,
      sim.z,
      haciaX,
      haciaZ,
    );
  }
  sim.marcha = lerp(sim.marcha, caminaAhora ? 1 : 0, Math.min(1, dt * 8));
  sim.sit = lerp(
    sim.sit,
    salida.sentarse && puesto.sentado && sentadoEnSuSitio && !alCostado ? 1 : 0,
    Math.min(1, dt * 3),
  );
  sim.yaw = lerpAngulo(sim.yaw, yawDeseado, k);
  // La altura del piso sigue la ruta (en una escalera sube o baja con la distancia recorrida);
  // si la meta cambió a mitad de tramo, alcanza el nodo a la velocidad del paseo, sin saltos.
  const dy = alturaNav(sim.nav, sim.cadena, sim.x, sim.z) - sim.y;
  const tope = dt * velocidad * 1.5 + 0.0001;
  sim.y += Math.abs(dy) <= tope ? dy : Math.sign(dy) * tope;
  if (alCostado) {
    sim.atentoListo = !caminaAhora && sim.sit < 0.1 && Math.hypot(dx, dz) <= UMBRAL_LLEGADA;
  }
  rig.raiz.position.set(sim.x, sim.y - BAJA_SENTADO * sim.sit, sim.z);
  rig.raiz.rotation.y = sim.yaw;

  // --- pose: ángulos de la lógica pura ---
  const caminando = sim.marcha > 0.03 && sim.sit < 0.5;
  const tazaVisible = enPausa || (salida.paseando && salida.postura === 'volviendo');
  const conTaza = tazaVisible && perfil.pausa === 'cafe';
  // En una conversación se alternan los turnos: quien habla gesticula, quien escucha asiente.
  const turnoPropio =
    conversando && inter
      ? (Math.floor((t - inter.inicio) / TURNO) % 2 === 0) === inter.primerTurno
      : false;
  // Gesto de quien es enfocado: una vez por enfoque (sin gestos amplios con reduced-motion).
  const gestoActivo =
    c.paseos &&
    rolAtencion === 'enfocado' &&
    atencion !== null &&
    atencion.gesto !== 'ninguno' &&
    t - atencion.gestoDesde < SEGUNDOS_GESTO;
  const asintiendo = gestoActivo && atencion?.gesto === 'asentir';
  const saludando =
    !caminando &&
    ((!salida.sentarse &&
      !salida.paseando &&
      (agente.estado === 'esperando_decision' || enfocado)) ||
      (gestoActivo && atencion?.gesto === 'saludo' && sim.sit < 0.5));
  const postura: PosturaCuerpo = caminando ? 'caminando' : sim.sit > 0.5 ? 'sentado' : 'de_pie';
  entradaPose.fase = sim.fase;
  entradaPose.postura = postura;
  entradaPose.velocidad = sim.marcha;
  entradaPose.actividad = turnoPropio && !caminando ? 'hablando' : salida.actividad;
  entradaPose.t = tm;
  entradaPose.llevaTaza = conTaza && !turnoPropio;
  entradaPose.saludando = saludando;
  calcularPose(entradaPose, pose);

  let piernas = pose.piernas;
  if (!caminando && sim.sit > 0.02 && sim.sit < 0.98) {
    entradaPose.postura = 'de_pie';
    calcularPose(entradaPose, poseDePie);
    entradaPose.postura = 'sentado';
    calcularPose(entradaPose, poseSentada);
    piernas = mezclarPiernas(poseDePie, poseSentada, sim.sit, piernasMezcla);
  }
  rig.pelvis.position.y = 0.62 + pose.pelvisY;
  for (let i = 0; i < 2; i++) {
    const pierna = piernas[i as 0 | 1];
    const articulacion = rig.piernas[i as 0 | 1];
    articulacion.cadera.rotation.x = pierna.cadera;
    articulacion.rodilla.rotation.x = pierna.rodilla;
  }

  // --- idle: de personalidad (libre y sentado), de pausa o de interacción ---
  if (c.paseos && t - sim.idleDesde > sim.idle.duracion) {
    sim.idle = nuevoIdle(c.azar, perfil.pesos);
    sim.idleDesde = t;
  }
  const ajuste = sim.ajuste;
  if (!c.paseos || caminando || saludando) {
    ajusteIdle(IDLE_QUIETO, 0, tm, ajuste);
  } else if (asintiendo && atencion) {
    ajusteIdle(IDLE_ASENTIR, (t - atencion.gestoDesde) / SEGUNDOS_GESTO, tm, ajuste);
  } else if (atento) {
    // Atento: solo respira y parpadea.
    ajusteIdle(IDLE_QUIETO, 0, tm, ajuste);
  } else if (conversando) {
    ajusteIdle(turnoPropio ? IDLE_QUIETO : IDLE_ASENTIR, PLENO, tm, ajuste);
  } else if (mostrando && quieto) {
    ajusteIdle(IDLE_SENALAR, PLENO, tm, ajuste);
  } else if (enPausa && perfil.pausa !== 'cafe') {
    ajusteIdle(perfil.pausa === 'probar_luz' ? IDLE_LUZ : IDLE_TELEFONO, PLENO, tm, ajuste);
  } else if (agente.estado === 'libre' && !conTaza && (!inter || inter.tipo === 'ninguna')) {
    ajusteIdle(sim.idle, (t - sim.idleDesde) / sim.idle.duracion, tm, ajuste);
  } else {
    ajusteIdle(IDLE_QUIETO, 0, tm, ajuste);
  }
  sim.columna = lerp(sim.columna, pose.columna + ajuste.columna, k);
  rig.columna.rotation.x = sim.columna;

  // --- brazos: del objetivo de la pose (o del idle) al ángulo suavizado ---
  for (let i = 0; i < 2; i++) {
    const lado = i as 0 | 1;
    const objetivoBrazo = pose.brazos[lado];
    const suave = sim.brazos[lado];
    const mezcla = ajuste.mezcla[lado];
    suave.hombro = lerp(suave.hombro, lerp(objetivoBrazo.hombro, ajuste.hombro[lado], mezcla), k);
    suave.codo = lerp(suave.codo, lerp(objetivoBrazo.codo, ajuste.codo[lado], mezcla), k);
    suave.abduccion = lerp(suave.abduccion, objetivoBrazo.abduccion, k);
    const brazo = rig.brazos[lado];
    brazo.hombro.rotation.x = suave.hombro;
    brazo.hombro.rotation.z = (lado === 0 ? -1 : 1) * suave.abduccion;
    brazo.codo.rotation.x = -(suave.codo + objetivoBrazo.muneca);
  }
  rig.taza.ancla.visible = rig.tazaEquipada || conTaza || ajuste.prop === 'taza';
  rig.hoja.ancla.visible = ajuste.prop === 'hoja';
  rig.telefono.ancla.visible = ajuste.prop === 'telefono';

  // --- respiración ---
  const respiro = Math.sin(tm * 1.7);
  rig.torso.scale.set(1 + respiro * 0.008, 1 + respiro * 0.012, 1 + respiro * 0.012);

  // --- mirada: al otro en una interacción; si no, hacia Jules o la cámara ---
  cabezaMundo.x = sim.x;
  cabezaMundo.y = alturaCabeza(sim.y, sim.sit);
  cabezaMundo.z = sim.z;
  const esperandoDePie = agente.estado === 'esperando_decision' && sim.sit < 0.5;
  const jx = c.jules.x - sim.x;
  const jy = c.jules.y - cabezaMundo.y;
  const jz = c.jules.z - sim.z;
  const distanciaJules2 = jx * jx + jy * jy + jz * jz;
  // Quien espera una decisión mira al usuario; solo sigue al orbe cuando pasa cerca.
  sim.atencionOrbe = atencionOrbe(
    sim.atencionOrbe,
    esperandoDePie && c.paseos && !atento ? Math.sqrt(distanciaJules2) : Infinity,
    dt,
  );
  const cercaDeJules =
    !esperandoDePie && distanciaJules2 < DISTANCIA_MIRA_JULES * DISTANCIA_MIRA_JULES;

  let miraAlOtro = false;
  if (socio && (conversando || mostrando || inter?.tipo === 'recibe')) {
    const haciaPantalla = mostrando;
    const recibe =
      inter?.tipo === 'recibe' &&
      Math.hypot(socio.x - sim.x, socio.z - sim.z) < DISTANCIA_RECIBE &&
      socio.sit < 0.5;
    if (conversando || haciaPantalla || recibe) {
      objetivoSocio.x = haciaPantalla ? socio.x + Math.sin(socio.yaw) * 0.75 : socio.x;
      objetivoSocio.z = haciaPantalla ? socio.z + Math.cos(socio.yaw) * 0.75 : socio.z;
      objetivoSocio.y = haciaPantalla ? socio.y + 1.1 : alturaCabeza(socio.y, socio.sit);
      miraAlOtro = true;
    }
  }
  // Atención al enfoque: el enfocado mira a cámara; su sala, a él o a Jules; sin enfoque, quien
  // está sentado en el ambiente de la cámara mira su pantalla, no la pared.
  let objetivoMirada: Vec3 = miraAlOtro ? objetivoSocio : cercaDeJules ? c.jules : c.camara;
  let mirandoAtencion = false;
  if (atento && atencion) {
    mirandoAtencion = true;
    if (rolAtencion === 'enfocado') objetivoMirada = c.camara;
    else if (atencion.objetivo === JULES || !relacion.foco) objetivoMirada = c.jules;
    else {
      objetivoSocio.x = relacion.foco.x;
      objetivoSocio.z = relacion.foco.z;
      objetivoSocio.y = alturaCabeza(relacion.foco.y, relacion.foco.sit);
      objetivoMirada = objetivoSocio;
    }
  } else if (rolAtencion === 'ambiente' && sim.sit > 0.5 && !miraAlOtro) {
    mirandoAtencion = true;
    objetivoSocio.x = puesto.escritorio.x;
    objetivoSocio.z = puesto.escritorio.z;
    objetivoSocio.y = sim.y + PANTALLA_Y;
    objetivoMirada = objetivoSocio;
  }
  entradaMirada.yawCuerpo = sim.yaw;
  entradaMirada.objetivo = objetivoMirada;
  const mirada = calcularMirada(entradaMirada, miradaHaciaObjetivo);
  let miradaYaw = mirada.yaw;
  let miradaPitch = mirada.pitch;
  if (sim.atencionOrbe > 0 && !atento) {
    entradaMirada.objetivo = c.jules;
    calcularMirada(entradaMirada, miradaAlOrbe);
    miradaYaw = lerp(miradaYaw, miradaAlOrbe.yaw, sim.atencionOrbe);
    miradaPitch = lerp(miradaPitch, miradaAlOrbe.pitch, sim.atencionOrbe);
  }
  const trabajandoSentado = agente.estado === 'trabajando' && sim.sit > 0.5;
  // Trabajando mira sobre todo su pantalla: solo echa un vistazo hacia Jules (o recibe a quien llega).
  const peso = trabajandoSentado && !miraAlOtro && !mirandoAtencion ? 0.3 : 1;
  let yawObjetivo = miradaYaw * peso + ajuste.cabezaYaw + pose.cabezaYaw;
  let pitchObjetivo = miradaPitch * peso + ajuste.cabezaPitch + pose.cabezaPitch;
  if (trabajandoSentado && !miraAlOtro && !mirandoAtencion) {
    yawObjetivo += Math.sin(tm * 0.7) * 0.12;
    pitchObjetivo -= 0.1 + Math.sin(tm * 2.3) * 0.04;
  }
  sim.mirYaw = suavizar(sim.mirYaw, limitar(yawObjetivo, LIMITE_YAW), dt, TAU_MIRADA);
  sim.mirPitch = suavizar(sim.mirPitch, pitchObjetivo, dt, TAU_MIRADA);
  rig.cabeza.rotation.y = sim.mirYaw;
  // calcularMirada: pitch positivo = arriba; en three rotation.x positivo inclina hacia abajo.
  rig.cabeza.rotation.x = -sim.mirPitch;

  // --- cara: estilo según estado, parpadeo entre dos celdas del atlas de caras ---
  if (sim.estadoVisto !== agente.estado || sim.caraFijaVista !== rig.caraFija) {
    sim.estadoVisto = agente.estado;
    sim.caraFijaVista = rig.caraFija;
    sim.cara = caraPorEstado(agente.estado, c.azar);
  }
  if (rig.cara) {
    let transcurrido = t - sim.planDesde;
    if (transcurrido > sim.plan.espera + 0.6) {
      sim.plan = planParpadeo(c.azar);
      sim.planDesde = t;
      transcurrido = 0;
    }
    const estilo = rig.caraFija ?? sim.cara;
    const celdas = celdasCara(estilo);
    rig.cara.celda = estaParpadeando(sim.plan, transcurrido) ? celdas[1] : celdas[0];
  }

  // --- globo de estado y aro ---
  if (agente.estado === 'libre') {
    rig.icono.ancla.visible = false;
  } else {
    rig.icono.celda = celdaIcono(agente.estado);
    rig.icono.ancla.visible = true;
    rig.icono.ancla.position.y = rig.alturaIcono + Math.sin(tm * 3) * 0.03;
  }
  const conAro = agente.estado === 'esperando_decision' || seleccionado;
  rig.anillo.visible = conAro;
  if (conAro) {
    rig.anillo.position.set(sim.x, sim.y + 0.01, sim.z);
    rig.anillo.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
  }
}
