import type { PuntoXZ } from '../mansion/plano';

/**
 * Navegación por una cadena de nodos. Cada puesto tiene una cadena de largo variable (la arma
 * `mansion/rutas.ts` al crear la persona: lugar → salida → pasillo → … → escalera → café). Los
 * nodos llevan `y`, así que la cadena puede cambiar de piso. El bucle por cuadro no crea
 * objetos: solo lee los nodos y dice a qué nodo va cada uno.
 */

export type { PuntoXZ };

/** Un punto de la ruta: posición en planta y altura del piso (o del peldaño) en ese punto. */
export interface Nodo extends PuntoXZ {
  y: number;
}

/** El lugar de trabajo. */
export const NODO_ASIENTO = 0;
/** Punto libre al levantarse: ahí espera de pie quien aguarda una decisión. */
export const NODO_SALIDA = 1;
/** Sobre el pasillo del ambiente. */
export const NODO_PASILLO = 2;
/**
 * Los nodos 3 y 4 empiezan sobre el pasillo (no añaden recorrido). Una visita los reescribe
 * para llegar al colega, y `NODO_VISITA` es la meta de quien visita.
 */
export const NODO_VISITA = 4;

/** Umbral de llegada a un nodo intermedio (m); el nodo final usa uno más fino. */
export const UMBRAL_NODO = 0.08;

/** Por dónde va una persona: último nodo alcanzado y nodo al que se dirige (-1 = quieta ahí). */
export interface Nav {
  nodo: number;
  hacia: number;
}

/** Si está quieta a más de esto de su último nodo (p. ej. en `parado`), vuelve a él antes de seguir. */
const LEJOS_DEL_NODO = 0.15;

/**
 * Un paso de navegación hacia el nodo `meta`: al llegar al nodo al que iba elige el siguiente.
 * Si la meta cambió de sentido a mitad de tramo, o parte desde un tramo suelto, vuelve primero
 * al último nodo, de modo que nunca corta esquinas por encima de los muebles.
 */
export function avanzarNav(
  nav: Nav,
  cadena: readonly PuntoXZ[],
  meta: number,
  x: number,
  z: number,
  umbralFinal: number,
): void {
  if (nav.hacia >= 0) {
    const punto = cadena[nav.hacia];
    const umbral = nav.hacia === meta ? umbralFinal : UMBRAL_NODO;
    if (punto && Math.hypot(punto.x - x, punto.z - z) <= umbral) {
      nav.nodo = nav.hacia;
      nav.hacia = -1;
    }
  }
  if (nav.hacia < 0) {
    if (nav.nodo !== meta) {
      const actual = cadena[nav.nodo];
      const lejos = actual && Math.hypot(actual.x - x, actual.z - z) > LEJOS_DEL_NODO;
      nav.hacia = lejos ? nav.nodo : nav.nodo + Math.sign(meta - nav.nodo);
    }
  } else if (
    nav.hacia !== nav.nodo &&
    Math.sign(nav.hacia - nav.nodo) !== Math.sign(meta - nav.nodo)
  ) {
    nav.hacia = nav.nodo;
  }
}

/** Punto al que camina ahora: el nodo al que va, o el último si ya está en la meta. */
export function destinoNav<T extends PuntoXZ>(nav: Nav, cadena: readonly T[]): T | undefined {
  return cadena[nav.hacia >= 0 ? nav.hacia : nav.nodo];
}

/**
 * Altura del piso bajo una persona que va de `nav.nodo` a `nav.hacia`: la `y` del tramo se
 * interpola linealmente con la distancia horizontal recorrida (en una escalera, sube o baja
 * peldaño a peldaño). Quieta, o en un tramo plano, es la `y` del nodo.
 */
export function alturaNav(nav: Nav, cadena: readonly Nodo[], x: number, z: number): number {
  const de = cadena[nav.nodo];
  const a = cadena[nav.hacia >= 0 ? nav.hacia : nav.nodo];
  if (!de || !a) return de?.y ?? a?.y ?? 0;
  if (de.y === a.y) return de.y;
  const largo = Math.hypot(a.x - de.x, a.z - de.z);
  if (largo < 1e-6) return a.y;
  const avance = 1 - Math.hypot(a.x - x, a.z - z) / largo;
  return de.y + (a.y - de.y) * Math.min(1, Math.max(0, avance));
}

/** ¿Está quieta en el nodo `meta` y encima de su punto final `final`? */
export function llegoANodo(
  nav: Nav,
  meta: number,
  final: PuntoXZ,
  x: number,
  z: number,
  umbral: number,
): boolean {
  return nav.hacia < 0 && nav.nodo === meta && Math.hypot(final.x - x, final.z - z) <= umbral;
}
