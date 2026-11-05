/**
 * Forma de Jules: personaje de pie o orbe en vuelo. Máquina pura (sin three) que la capa R3F
 * consulta cada cuadro; muta su estado y no crea objetos.
 *
 *   personaje ──(destino lejos)──▶ desmaterializando ──▶ viajando ──(llega)──▶ materializando ──▶ personaje
 */
export type FaseJules = 'personaje' | 'desmaterializando' | 'viajando' | 'materializando';

export interface EstadoForma {
  fase: FaseJules;
  /** 0 = orbe, 1 = personaje completo. */
  forma: number;
}

/** Duración (s) de cada transición orbe ↔ personaje. */
export const DURACION_TRANSICION = 0.4;
/** Más lejos que esto (m) del destino, Jules viaja como orbe en vez de caminar. */
export const DISTANCIA_SALTO = 2.5;
/** A menos de esto (m) del destino, el orbe se rematerializa. */
export const DISTANCIA_LLEGADA = 0.4;

export const crearForma = (): EstadoForma => ({ fase: 'personaje', forma: 1 });

/**
 * Avanza la forma `dt` segundos con el orbe a `distancia` metros de su destino. Con
 * `reducido` (prefers-reduced-motion) no hay viaje: devuelve `true` si hay que colocar a Jules
 * en el destino de golpe, y queda siempre como personaje.
 */
export function avanzarForma(
  e: EstadoForma,
  distancia: number,
  dt: number,
  reducido: boolean,
): boolean {
  if (reducido) {
    e.fase = 'personaje';
    e.forma = 1;
    return distancia > DISTANCIA_SALTO;
  }
  const paso = Math.min(Math.max(dt, 0), 0.1) / DURACION_TRANSICION;
  switch (e.fase) {
    case 'personaje':
      if (distancia > DISTANCIA_SALTO) e.fase = 'desmaterializando';
      break;
    case 'desmaterializando':
      e.forma = Math.max(0, e.forma - paso);
      if (e.forma === 0) e.fase = 'viajando';
      break;
    case 'viajando':
      if (distancia < DISTANCIA_LLEGADA) e.fase = 'materializando';
      break;
    case 'materializando':
      if (distancia > DISTANCIA_SALTO) {
        e.fase = 'desmaterializando';
        break;
      }
      e.forma = Math.min(1, e.forma + paso);
      if (e.forma === 1) e.fase = 'personaje';
      break;
  }
  return false;
}

/** Jules se desplaza (vuela) solo como orbe; de pie solo sigue con suavidad su sitio. */
export const esOrbeEnVuelo = (e: EstadoForma) => e.fase === 'viajando';
