import type { Ambiente } from '../mansion/plano';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type CajaAmbiente = Pick<Ambiente, 'x0' | 'x1' | 'z0' | 'z1' | 'y' | 'alto'>;

/** Alto (m) con que se puede tocar un ambiente sin techo (la terraza). */
const ALTO_TOQUE_SIN_TECHO = 0.6;

/** Tramo [entra, sale] (distancias a lo largo del rayo) donde atraviesa la caja, o `null`. Método de las losas. */
function tramoEnCaja(origen: Vec3, direccion: Vec3, c: CajaAmbiente): [number, number] | null {
  const ejes: [number, number, number, number][] = [
    [origen.x, direccion.x, c.x0, c.x1],
    [origen.y, direccion.y, c.y, c.y + (c.alto > 0 ? c.alto : ALTO_TOQUE_SIN_TECHO)],
    [origen.z, direccion.z, c.z0, c.z1],
  ];
  let entra = 0;
  let sale = Infinity;
  for (const [o, d, min, max] of ejes) {
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
      continue;
    }
    const t1 = (min - o) / d;
    const t2 = (max - o) / d;
    entra = Math.max(entra, Math.min(t1, t2));
    sale = Math.min(sale, Math.max(t1, t2));
    if (entra > sale) return null;
  }
  return [entra, sale];
}

const volumen = (c: CajaAmbiente) =>
  (c.x1 - c.x0) * (c.z1 - c.z0) * (c.alto > 0 ? c.alto : ALTO_TOQUE_SIN_TECHO);

/** Los solapes de menos de esto (m) son dos ambientes que se tocan, no uno dentro del otro. */
const TOLERANCIA_SOLAPE = 1e-6;

/**
 * El ambiente que está bajo un rayo de toque (origen y dirección en el mundo), o `null` si el
 * rayo no cruza ninguno. Gana el primero que el rayo atraviesa; si otro empieza dentro de ese
 * tramo (la pasarela dentro del volumen del atrio) gana el más pequeño, que es el más
 * específico. Un ambiente que el rayo toca recién después de salir del primero (la cocina bajo
 * Ventas) no cuenta: el toque fue sobre lo que se ve.
 */
export function ambienteBajoRayo<T extends CajaAmbiente>(
  origen: Vec3,
  direccion: Vec3,
  ambientes: readonly T[],
): T | null {
  const aciertos: { a: T; entra: number; sale: number }[] = [];
  for (const a of ambientes) {
    const tramo = tramoEnCaja(origen, direccion, a);
    if (tramo) aciertos.push({ a, entra: tramo[0], sale: tramo[1] });
  }
  const primero = aciertos.reduce<(typeof aciertos)[number] | null>(
    (mejor, x) => (mejor === null || x.entra < mejor.entra ? x : mejor),
    null,
  );
  if (!primero) return null;
  return aciertos
    .filter((x) => x.entra < primero.sale - TOLERANCIA_SOLAPE)
    .reduce((mejor, x) => (volumen(x.a) < volumen(mejor.a) ? x : mejor)).a;
}

/** Mitad de la tierra que se puede enfocar fuera de la casa (m desde el centro). */
const LIMITE_SUELO = 40;
/** Altura (m) a la que se enfoca el suelo. */
const Y_SUELO = 0;

/**
 * Punto del mundo al que apunta un doble toque: el centro del tramo del rayo dentro del
 * ambiente tocado (un punto del interior, no su fachada) o, fuera de la casa, el suelo. `null`
 * si el rayo no llega a ninguno (apunta al cielo).
 */
export function puntoDeEnfoque<T extends CajaAmbiente>(
  origen: Vec3,
  direccion: Vec3,
  ambientes: readonly T[],
): Vec3 | null {
  const a = ambienteBajoRayo(origen, direccion, ambientes);
  const tramo = a ? tramoEnCaja(origen, direccion, a) : null;
  const t = tramo
    ? (tramo[0] + tramo[1]) / 2
    : direccion.y < -1e-9
      ? (Y_SUELO - origen.y) / direccion.y
      : null;
  if (t === null || t <= 0) return null;
  const punto = {
    x: origen.x + direccion.x * t,
    y: origen.y + direccion.y * t,
    z: origen.z + direccion.z * t,
  };
  if (!tramo && Math.hypot(punto.x, punto.z) > LIMITE_SUELO) return null;
  return punto;
}

/** Un toque: cuándo (ms) y dónde (px de pantalla). */
export interface Toque {
  t: number;
  x: number;
  y: number;
}

/** Dos toques seguidos a menos de esto (ms) y de esto (px) son un doble toque. */
export const VENTANA_DOBLE_TOQUE = 350;
export const RADIO_DOBLE_TOQUE = 30;

export function esDobleToque(anterior: Toque | null, actual: Toque): boolean {
  return (
    anterior !== null &&
    actual.t - anterior.t <= VENTANA_DOBLE_TOQUE &&
    Math.hypot(actual.x - anterior.x, actual.y - anterior.y) <= RADIO_DOBLE_TOQUE
  );
}
