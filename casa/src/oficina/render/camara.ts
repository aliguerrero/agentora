import { ESPESOR_LOSA, extensionCasa } from '../mansion/plano';
import type { Ambiente } from '../mansion/plano';
import {
  AZIMUT_AMBIENTE,
  ELEVACION_AMBIENTE_MAX,
  ELEVACION_AMBIENTE_MIN,
  ELEVACION_GENERAL_MAX,
  ELEVACION_GENERAL_MIN,
  ELEVACION_INICIAL,
} from './orbita';

export interface Punto3 {
  x: number;
  y: number;
  z: number;
}

/** Lente larga: FOV vertical de la casa de muñecas, en grados. */
export const FOV_VERTICAL = 28;
const TAN_MEDIO_FOV = Math.tan((FOV_VERTICAL * Math.PI) / 360);

/** Caja que debe caber entera en pantalla. */
interface Caja3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** La casa entera: 32 m de ancho, del terreno cortado (y -4) a la cima de la torre, y la piscina al frente. */
const CAJA_CASA: Caja3 = { x0: -16, x1: 16, y0: -4, y1: 15.5, z0: -4, z1: 10 };
const MARGEN_CASA = 0.9;
const MARGEN_AMBIENTE = 0.95;
/** Alto con que se encuadra un ambiente sin techo (la terraza). */
const ALTO_SIN_TECHO = 2.5;

/** Una vista: dónde está la cámara, a qué mira y a cuántos metros. */
export interface Encuadre {
  posicion: Punto3;
  objetivo: Punto3;
  distancia: number;
}

/**
 * Cámara de frente y elevada que mira el centro de `caja` desde la distancia justa para que
 * sus 8 esquinas queden dentro de la pantalla (con `margen` = fracción útil del medio-ancho
 * y medio-alto). Cerrada: no itera; cada esquina pide una distancia mínima y gana la mayor.
 */
function encuadrarCaja(caja: Caja3, ancho: number, alto: number, margen: number): Encuadre {
  const objetivo = {
    x: (caja.x0 + caja.x1) / 2,
    y: (caja.y0 + caja.y1) / 2,
    z: (caja.z0 + caja.z1) / 2,
  };
  const tanV = TAN_MEDIO_FOV * margen;
  const tanH = tanV * (ancho / alto);
  const seno = Math.sin(ELEVACION_INICIAL);
  const coseno = Math.cos(ELEVACION_INICIAL);
  let distancia = 0;
  for (const x of [caja.x0, caja.x1]) {
    for (const y of [caja.y0, caja.y1]) {
      for (const z of [caja.z0, caja.z1]) {
        const dy = y - objetivo.y;
        const dz = z - objetivo.z;
        // Ejes de la cámara: adelante = (0, -seno, -coseno); arriba = (0, coseno, -seno).
        const lateral = Math.abs(x - objetivo.x);
        const vertical = Math.abs(dy * coseno - dz * seno);
        const profundidad = -dy * seno - dz * coseno;
        distancia = Math.max(
          distancia,
          lateral / tanH - profundidad,
          vertical / tanV - profundidad,
        );
      }
    }
  }
  return {
    posicion: {
      x: objetivo.x,
      y: objetivo.y + distancia * seno,
      z: objetivo.z + distancia * coseno,
    },
    objetivo,
    distancia,
  };
}

/** La casa completa de frente. En retrato el ancho manda y la casa se ve entera. */
export function encuadreCasa(ancho: number, alto: number): Encuadre {
  return encuadrarCaja({ ...CAJA_CASA, ...extensionCasa() }, ancho, alto, MARGEN_CASA);
}

/** Ambiente visto de frente desde fuera del corte, llenando la pantalla. */
export function encuadreAmbiente(
  a: Pick<Ambiente, 'x0' | 'x1' | 'z0' | 'z1' | 'y' | 'alto'>,
  ancho: number,
  alto: number,
): Encuadre {
  return encuadrarCaja(
    {
      x0: a.x0,
      x1: a.x1,
      y0: a.y - ESPESOR_LOSA,
      y1: a.y + (a.alto > 0 ? a.alto : ALTO_SIN_TECHO),
      z0: a.z0,
      z1: a.z1,
    },
    ancho,
    alto,
    MARGEN_AMBIENTE,
  );
}

/** Cámara en reposo: `avanzarCamara` muta este estado; no crea objetos. */
export interface EstadoCamara extends Punto3 {
  /** Hay una transición en curso (o una persona enfocada que seguir). */
  activo: boolean;
  /** Metros entre la cámara y su punto de mira. */
  distancia: number;
  /** Dirección de la cámara vista desde su punto de mira: 0 mira desde el frente (z+), π/2 desde el este. */
  azimut: number;
  /** Elevación de la cámara sobre el horizonte. */
  elevacion: number;
  /** Último destino atendido (persona, punto, ambiente o casa); si cambia, arranca otra transición. */
  clave: object | null;
  /** Pide volver también a la dirección inicial (vista general), no solo al encuadre. */
  reorientar: boolean;
}

export interface EntradaCamara {
  dt: number;
  casa: Encuadre;
  /** Ambiente activo, o `null` para la casa completa. */
  ambiente: Encuadre | null;
  /** Punto elegido con doble toque (la misma referencia mientras valga), o `null`. */
  foco: Punto3 | null;
  /** Posición de la persona enfocada (la misma referencia cada cuadro), o `null`. */
  enfocado: Punto3 | null;
  /** Movimiento reducido: llega al destino en un solo paso. */
  instantaneo?: boolean;
  /** Vista elegida para la persona enfocada (ángulo y distancia que dejan su cara a la vista). */
  vista?: { azimut: number; elevacion: number; distancia: number } | null;
}

/** Distancia (m) a la que la cámara mira a una persona enfocada. */
export const DISTANCIA_PERSONA = 5;
/** Distancia (m) a la que se acerca la cámara a un punto enfocado con doble toque. */
export const DISTANCIA_FOCO = 12;
/** Altura sobre los pies a la que apunta la cámara (la cabeza). */
const ALTURA_CABEZA = 1.1;
/** Rapidez de la transición (1/s). */
const VELOCIDAD = 2.5;
/** Metros de diferencia bajo los cuales la transición se da por terminada. */
const TOLERANCIA = 0.02;
const TOLERANCIA_ANGULO = 0.005;

const VUELTA = 2 * Math.PI;
/** El ángulo equivalente en (-π, π]: así el giro elige siempre el camino corto. */
export function normalizarAngulo(a: number): number {
  const r = a % VUELTA;
  return r > Math.PI ? r - VUELTA : r <= -Math.PI ? r + VUELTA : r;
}
const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Lee la órbita actual de la cámara (su posición respecto del punto de mira) al estado. */
export function leerOrbita(e: EstadoCamara, dx: number, dy: number, dz: number): void {
  const d = Math.hypot(dx, dy, dz) || 1;
  e.distancia = d;
  e.elevacion = Math.asin(dy / d);
  if (Math.hypot(dx, dz) > 1e-6) e.azimut = Math.atan2(dx, dz);
}

/** Posición de la cámara (relativa al punto de mira) que describe el estado. */
export function desplazamientoDe(e: EstadoCamara, salida: Punto3): Punto3 {
  const horizontal = e.distancia * Math.cos(e.elevacion);
  salida.x = horizontal * Math.sin(e.azimut);
  salida.y = e.distancia * Math.sin(e.elevacion);
  salida.z = horizontal * Math.cos(e.azimut);
  return salida;
}

/**
 * Un paso de la cámara hacia su destino con un lerp suave: persona enfocada > punto enfocado >
 * ambiente activo > casa completa. Mueve el punto de mira, la distancia y la dirección. La
 * dirección solo cambia para entrar en los límites del modo (dentro de un ambiente la órbita es
 * corta, así que quien miraba desde atrás da la vuelta) o al pedir `reorientar`; fuera de eso
 * la órbita sigue siendo del usuario. Al llegar se desactiva; con una persona enfocada sigue
 * activa para seguirla. Devuelve si movió el estado en este paso (también en el último), para
 * que quien llama aplique la posición.
 */
export function avanzarCamara(e: EstadoCamara, entrada: EntradaCamara): boolean {
  const { enfocado, foco, ambiente, casa } = entrada;
  const clave = enfocado ?? foco ?? ambiente ?? casa;
  if (clave !== e.clave || e.reorientar) {
    e.clave = clave;
    e.activo = true;
  }
  if (!e.activo) return false;
  const destino = ambiente ?? casa;
  const objetivo = enfocado ?? foco;
  const tx = objetivo ? objetivo.x : destino.objetivo.x;
  const ty = enfocado ? enfocado.y + ALTURA_CABEZA : objetivo ? objetivo.y : destino.objetivo.y;
  const tz = objetivo ? objetivo.z : destino.objetivo.z;
  const vista = enfocado ? entrada.vista : null;
  const td = vista
    ? vista.distancia
    : enfocado
      ? DISTANCIA_PERSONA
      : foco
        ? Math.min(e.distancia, DISTANCIA_FOCO)
        : destino.distancia;
  const enAmbiente = ambiente !== null && enfocado === null;
  const limiteAzimut = enAmbiente ? AZIMUT_AMBIENTE : Infinity;
  const ta = vista
    ? vista.azimut
    : e.reorientar
      ? 0
      : acotar(normalizarAngulo(e.azimut), -limiteAzimut, limiteAzimut);
  const te = vista
    ? vista.elevacion
    : e.reorientar
      ? ELEVACION_INICIAL
      : acotar(
          e.elevacion,
          enAmbiente ? ELEVACION_AMBIENTE_MIN : ELEVACION_GENERAL_MIN,
          enAmbiente ? ELEVACION_AMBIENTE_MAX : ELEVACION_GENERAL_MAX,
        );
  const k = entrada.instantaneo ? 1 : Math.min(1, entrada.dt * VELOCIDAD);
  e.x += (tx - e.x) * k;
  e.y += (ty - e.y) * k;
  e.z += (tz - e.z) * k;
  e.distancia += (td - e.distancia) * k;
  e.azimut += normalizarAngulo(ta - e.azimut) * k;
  e.elevacion += (te - e.elevacion) * k;
  if (enfocado) return true;
  e.activo =
    Math.hypot(tx - e.x, ty - e.y, tz - e.z) >= TOLERANCIA ||
    Math.abs(td - e.distancia) >= TOLERANCIA ||
    Math.abs(normalizarAngulo(ta - e.azimut)) >= TOLERANCIA_ANGULO ||
    Math.abs(te - e.elevacion) >= TOLERANCIA_ANGULO;
  if (!e.activo) e.reorientar = false;
  return true;
}

/** Frecuencia (rad/s) con que la deriva invierte su sentido: con velocidad v, barre ±v/0,5 rad. */
export const FRECUENCIA_DERIVA = 0.5;

/**
 * Azimut tras `dt` segundos de deriva lenta y senoidal (`velocidad` en rad/s de pico): la
 * cámara se mece alrededor de su dirección sin pararse. Con `velocidad` 0 no cambia nada, y si
 * el modo limita el azimut (`limite` finito, p. ej. `AZIMUT_AMBIENTE`) nunca lo sobrepasa.
 */
export function derivarAzimut(
  azimut: number,
  t: number,
  dt: number,
  velocidad: number,
  limite: number,
): number {
  if (!(velocidad > 0)) return azimut;
  const siguiente = azimut + velocidad * Math.cos(FRECUENCIA_DERIVA * t) * dt;
  return Number.isFinite(limite) ? acotar(siguiente, -limite, limite) : siguiente;
}

/** Posición del orbe en pantalla (-1..1 a cada lado del centro): tercio derecho, arriba. */
const ORBE_NDC_X = 0.62;
const ORBE_NDC_Y = 0.4;
/** A qué profundidad del sujeto queda el orbe: más lejos lo metería detrás de paredes y pantallas. */
const ORBE_PROFUNDIDAD = 1;

/**
 * Dónde flota Jules mientras la cámara mira `objetivo` (una persona enfocada o el punto de mira
 * dentro de un ambiente): en el tercio derecho y alto del encuadre, a la profundidad del
 * objetivo, nunca sobre la línea cámara→objetivo ni en el centro del plano. Se calcula con
 * el campo de visión real (`fovVertical` en grados y `aspecto` ancho/alto), así que vale desde
 * cualquier ángulo de órbita y de zoom.
 */
export function puntoOrbeEncuadre(
  objetivo: Punto3,
  camara: Punto3,
  fovVertical: number,
  aspecto: number,
): Punto3 {
  const dx = objetivo.x - camara.x;
  const dy = objetivo.y - camara.y;
  const dz = objetivo.z - camara.z;
  const distancia = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / distancia;
  const fy = dy / distancia;
  const fz = dz / distancia;
  // derecha = adelante × arriba(0,1,0), normalizada; arriba de pantalla = derecha × adelante.
  const horizontal = Math.hypot(fx, fz) || 1;
  const rx = -fz / horizontal;
  const rz = fx / horizontal;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const profundo = distancia * ORBE_PROFUNDIDAD;
  const medioAlto = profundo * Math.tan((fovVertical * Math.PI) / 360);
  const lateral = ORBE_NDC_X * medioAlto * aspecto;
  const vertical = ORBE_NDC_Y * medioAlto;
  return {
    x: camara.x + fx * profundo + rx * lateral + ux * vertical,
    y: camara.y + fy * profundo + uy * vertical,
    z: camara.z + fz * profundo + rz * lateral + uz * vertical,
  };
}
