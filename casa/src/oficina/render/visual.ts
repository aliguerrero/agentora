import { NIVEL_Y, cajaDe, plano } from '../mansion/plano';
import type { Punto3 } from './camara';

/** Caja alineada a los ejes (metros): lo que puede tapar la vista de un agente. */
export interface Caja3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Una mirada: dónde queda la cámara respecto de su punto de mira. */
export interface Vista {
  azimut: number;
  elevacion: number;
  distancia: number;
}

/** Posición de la cámara para mirar `objetivo` con esa vista (convenio de `desplazamientoDe`). */
export function posicionDe(objetivo: Punto3, v: Vista): Punto3 {
  const horizontal = v.distancia * Math.cos(v.elevacion);
  return {
    x: objetivo.x + horizontal * Math.sin(v.azimut),
    y: objetivo.y + v.distancia * Math.sin(v.elevacion),
    z: objetivo.z + horizontal * Math.cos(v.azimut),
  };
}

/** ¿El segmento a→b atraviesa la caja? (método de las losas). */
export function segmentoCortaCaja(a: Punto3, b: Punto3, c: Caja3): boolean {
  let t0 = 0;
  let t1 = 1;
  const ejes: [number, number, number, number][] = [
    [a.x, b.x - a.x, c.x0, c.x1],
    [a.y, b.y - a.y, c.y0, c.y1],
    [a.z, b.z - a.z, c.z0, c.z1],
  ];
  for (const [origen, delta, min, max] of ejes) {
    if (Math.abs(delta) < 1e-9) {
      if (origen < min || origen > max) return false;
      continue;
    }
    let ta = (min - origen) / delta;
    let tb = (max - origen) / delta;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** ¿La cámara ve el punto sin que nada se interponga? */
export const lineaLibre = (camara: Punto3, objetivo: Punto3, cajas: Caja3[]): boolean =>
  !cajas.some((c) => segmentoCortaCaja(camara, objetivo, c));

export interface OpcionesAngulo {
  /** Mayor desvío permitido del azimut de frente (0), en radianes. */
  limiteAzimut: number;
  elevacionMin: number;
  elevacionMax: number;
  /** Distancia mínima a la que se puede acercar si ningún ángulo queda limpio. */
  distanciaMin: number;
}

const PASO_AZIMUT = (10 * Math.PI) / 180;
const PASO_ELEVACION = (12 * Math.PI) / 180;
const ACERCAR = [1, 0.75, 0.55, 0.4];

/**
 * Elige la vista más cercana a la actual desde la que se ve el objetivo sin obstáculos: prueba
 * azimuts cada vez más lejos del actual (a un lado y al otro) con la elevación actual y, si no
 * alcanza, con una algo mayor; si ninguno sirve, acerca la cámara hasta que la línea quede limpia.
 * Si nada la despeja devuelve la vista más cercana con la mínima distancia. Función pura.
 */
export function elegirVista(
  objetivo: Punto3,
  actual: Vista,
  cajas: Caja3[],
  o: OpcionesAngulo,
): Vista {
  const acota = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
  const azimutActual = acota(actual.azimut, -o.limiteAzimut, o.limiteAzimut);
  const elevaciones = [0, 1].map((k) =>
    acota(actual.elevacion + k * PASO_ELEVACION, o.elevacionMin, o.elevacionMax),
  );
  for (const factor of ACERCAR) {
    const distancia = Math.max(o.distanciaMin, actual.distancia * factor);
    const pasos = Math.ceil((2 * o.limiteAzimut) / PASO_AZIMUT);
    // Primero se rodea por el azimut con la elevación actual; solo después se sube un poco.
    for (const elevacion of elevaciones) {
      for (let n = 0; n <= pasos; n++) {
        for (const signo of n === 0 ? [1] : [1, -1]) {
          const azimut = azimutActual + signo * n * PASO_AZIMUT;
          if (Math.abs(azimut) > o.limiteAzimut + 1e-9) continue;
          const v = { azimut, elevacion, distancia };
          if (lineaLibre(posicionDe(objetivo, v), objetivo, cajas)) return v;
        }
      }
    }
  }
  return { azimut: azimutActual, elevacion: elevaciones[0]!, distancia: o.distanciaMin };
}

/** Margen (m) que se le da a cada caja: la línea no puede rozar el borde de un muro. */
const MARGEN = 0.05;
/** Alto de un nivel (los muros llegan hasta el techo de su piso). */
const ALTO_MURO = 3.6;
const ESPESOR_MURO = 0.3;
const ALTO_MUEBLE_MIN = 1.2;

/**
 * Lo fijo de la casa que tapa la vista: muros (partidos por su vano) y muebles altos. Las
 * barandas y el borde son de vidrio y no tapan; los muebles bajos quedan bajo la línea de mira.
 */
export function cajasDeLaCasa(): Caja3[] {
  const cajas: Caja3[] = [];
  for (const m of plano.muros) {
    if (m.tipo !== 'muro') continue;
    const y0 = NIVEL_Y[m.nivel];
    const tramos: [number, number][] = m.vano
      ? [
          [m.desde, m.vano.centro - m.vano.ancho / 2],
          [m.vano.centro + m.vano.ancho / 2, m.hasta],
        ]
      : [[m.desde, m.hasta]];
    for (const [a, b] of tramos) {
      if (b <= a) continue;
      const mitad = ESPESOR_MURO / 2 - MARGEN;
      cajas.push(
        m.eje === 'x'
          ? { x0: m.pos - mitad, x1: m.pos + mitad, y0, y1: y0 + ALTO_MURO, z0: a, z1: b }
          : { x0: a, x1: b, y0, y1: y0 + ALTO_MURO, z0: m.pos - mitad, z1: m.pos + mitad },
      );
    }
  }
  for (const f of plano.muebles) {
    if (f.alto < ALTO_MUEBLE_MIN) continue;
    const c = cajaDe(f);
    const y0 = (plano.ambientes.find((a) => a.id === f.ambiente)?.y ?? 0) + f.y;
    cajas.push({ x0: c.x0, x1: c.x1, y0, y1: y0 + f.alto, z0: c.z0, z1: c.z1 });
  }
  return cajas;
}

const RADIO_PERSONA = 0.28;
const ALTO_PERSONA = 1.7;

/** Caja de una persona de pie (otro agente que podría quedar delante de la cara). */
export const cajaDePersona = (p: Punto3): Caja3 => ({
  x0: p.x - RADIO_PERSONA,
  x1: p.x + RADIO_PERSONA,
  y0: p.y,
  y1: p.y + ALTO_PERSONA,
  z0: p.z - RADIO_PERSONA,
  z1: p.z + RADIO_PERSONA,
});
