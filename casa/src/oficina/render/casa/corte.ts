import { ESPESOR_LOSA, NIVEL_Y } from '../../mansion/plano';
import type { Ambiente, Nivel } from '../../mansion/plano';
import type { LadoCorte } from './arquitectura';

/**
 * Corte de casa de muñecas que se adapta al ángulo. Lógica pura:
 * - Un costado de la casa se oculta cuando la cámara está de ese lado (los muros y vuelos que
 *   quedarían entre ella y el interior), con histéresis para que no parpadee en el borde.
 * - Dentro de un ambiente se oculta además todo lo que queda sobre su cielo.
 * `CorteCasa.tsx` aplica estas reglas a las mallas que llevan `userData.ladoCorte` y
 * `userData.nivelCorte`.
 */

export const LADOS: readonly LadoCorte[] = ['norte', 'sur', 'este', 'oeste'];

/** Normal exterior de cada costado en planta (x, z). */
const NORMAL: Record<LadoCorte, readonly [number, number]> = {
  norte: [0, -1],
  sur: [0, 1],
  este: [1, 0],
  oeste: [-1, 0],
};

/**
 * Coseno del ángulo entre la normal del muro y la dirección hacia la cámara. Se oculta al
 * pasar `UMBRAL_OCULTAR` (a ~24° del frente de ese costado ya queda delante del interior) y
 * vuelve a mostrarse bajo `UMBRAL_MOSTRAR` (~17°): entre los dos mantiene lo que tenía.
 */
export const UMBRAL_OCULTAR = 0.4;
export const UMBRAL_MOSTRAR = 0.3;

export type LadosOcultos = Record<LadoCorte, boolean>;

export const sinLadosOcultos = (): LadosOcultos => ({
  norte: false,
  sur: false,
  este: false,
  oeste: false,
});

/**
 * Actualiza qué costados están ocultos según dónde está la cámara respecto de su punto de
 * mira en planta (`dx`, `dz`). Devuelve si algo cambió. Justo sobre el punto no hay dirección:
 * no cambia nada.
 */
export function actualizarLadosOcultos(oculto: LadosOcultos, dx: number, dz: number): boolean {
  const largo = Math.hypot(dx, dz);
  if (largo < 1e-6) return false;
  let cambio = false;
  for (const lado of LADOS) {
    const [nx, nz] = NORMAL[lado];
    const coseno = (nx * dx + nz * dz) / largo;
    const nuevo = oculto[lado] ? coseno > UMBRAL_MOSTRAR : coseno > UMBRAL_OCULTAR;
    if (nuevo !== oculto[lado]) {
      oculto[lado] = nuevo;
      cambio = true;
    }
  }
  return cambio;
}

/** Sin corte de altura: todo se ve. */
export const SIN_CORTE = 1000;
/** Holgura bajo el cielo del ambiente: los listones del cielo cuelgan 9 cm bajo la losa. */
const HOLGURA_CIELO = 0.1;

/**
 * Altura (m) desde la que se oculta todo cuando se entra a `ambiente`: su cielo, menos la
 * holgura de los listones. Sin ambiente, o en uno sin techo (la terraza), no hay corte.
 */
export function alturaDeCorte(ambiente: Pick<Ambiente, 'y' | 'alto'> | null): number {
  if (!ambiente || ambiente.alto <= 0) return SIN_CORTE;
  return ambiente.y + ambiente.alto - HOLGURA_CIELO;
}

/** ¿Una malla de ese nivel queda sobre el corte? Compara con la base de su losa. */
export function nivelOculto(nivel: Nivel, corte: number): boolean {
  return NIVEL_Y[nivel] - ESPESOR_LOSA >= corte;
}

/** ¿Algo parado en `y` (los pies de una persona) queda sobre el corte? */
export function sobreElCorte(y: number, corte: number): boolean {
  return y >= corte;
}
