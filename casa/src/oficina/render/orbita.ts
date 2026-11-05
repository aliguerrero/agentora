import { extensionCasa } from '../mansion/plano';
import type { Ambiente } from '../mansion/plano';
import type { Encuadre } from './camara';

const GRADOS = Math.PI / 180;

/** Región del mundo (m) donde puede estar el punto de mira de la cámara. */
export interface CajaObjetivo {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Lo que el usuario puede hacer con la órbita en un momento dado. Ángulos en radianes. */
export interface LimitesOrbita {
  /** Giro máximo a cada lado del frente (z+); `Infinity` es la vuelta completa. */
  azimutMax: number;
  /** Elevación sobre el horizonte: la mínima evita ir bajo el terreno, la máxima el cenital. */
  elevacionMin: number;
  elevacionMax: number;
  /** Metros entre la cámara y su punto de mira. */
  distanciaMin: number;
  distanciaMax: number;
  /** El paneo no saca el punto de mira de esta caja. */
  caja: CajaObjetivo;
}

/** Elevación con que arranca la vista general (de frente, desde z+). */
export const ELEVACION_GRADOS = 14;
export const ELEVACION_INICIAL = ELEVACION_GRADOS * GRADOS;

const GENERAL = {
  elevacionMin: 5 * GRADOS,
  elevacionMax: 65 * GRADOS,
  distanciaMin: 3,
  /** Cuánto más lejos que la vista general se puede alejar (factor). */
  alejamiento: 1.15,
  /** Dónde puede mirar el paneo: la casa, el jardín y un poco más. */
  caja: { x0: -20, x1: 20, y0: 0, y1: 16, z0: -6, z1: 10 } as CajaObjetivo,
};

/** Dentro de un ambiente la órbita es corta: no se pasa a los muros vecinos. */
const AMBIENTE = {
  azimutMax: 40 * GRADOS,
  elevacionMin: 8 * GRADOS,
  elevacionMax: 45 * GRADOS,
  distanciaMin: 3,
  alejamiento: 1.5,
  /** Cuánto se puede panear más allá del ambiente (m). */
  holgura: 1.5,
};

export const AZIMUT_AMBIENTE = AMBIENTE.azimutMax;
export const ELEVACION_AMBIENTE_MIN = AMBIENTE.elevacionMin;
export const ELEVACION_AMBIENTE_MAX = AMBIENTE.elevacionMax;
export const ELEVACION_GENERAL_MIN = GENERAL.elevacionMin;
export const ELEVACION_GENERAL_MAX = GENERAL.elevacionMax;

/**
 * Límites de la órbita: la vuelta completa de 360° alrededor de la casa, o la órbita corta
 * alrededor de un ambiente (`encuadre` es el suyo; `casa`, el de la vista general).
 */
export function limitesOrbita(
  ambiente: Pick<Ambiente, 'x0' | 'x1' | 'z0' | 'z1' | 'y' | 'alto'> | null,
  casa: Encuadre,
  encuadre: Encuadre | null,
): LimitesOrbita {
  if (!ambiente || !encuadre) {
    return {
      azimutMax: Infinity,
      elevacionMin: GENERAL.elevacionMin,
      elevacionMax: GENERAL.elevacionMax,
      distanciaMin: GENERAL.distanciaMin,
      distanciaMax: casa.distancia * GENERAL.alejamiento,
      caja: {
        ...GENERAL.caja,
        x0: Math.min(GENERAL.caja.x0, extensionCasa().x0 - 2),
        x1: Math.max(GENERAL.caja.x1, extensionCasa().x1 + 2),
      },
    };
  }
  const h = AMBIENTE.holgura;
  return {
    azimutMax: AMBIENTE.azimutMax,
    elevacionMin: AMBIENTE.elevacionMin,
    elevacionMax: AMBIENTE.elevacionMax,
    distanciaMin: AMBIENTE.distanciaMin,
    distanciaMax: encuadre.distancia * AMBIENTE.alejamiento,
    caja: {
      x0: ambiente.x0 - h,
      x1: ambiente.x1 + h,
      y0: ambiente.y,
      y1: ambiente.y + Math.max(ambiente.alto, 2.5),
      z0: ambiente.z0 - h,
      z1: ambiente.z1 + h,
    },
  };
}

/** Deja `p` dentro de `caja`; devuelve cuánto lo movió en cada eje (todo 0 si ya estaba dentro). */
export function acotarObjetivo(
  p: { x: number; y: number; z: number },
  caja: CajaObjetivo,
  desvio: { x: number; y: number; z: number },
): void {
  const x = Math.min(caja.x1, Math.max(caja.x0, p.x));
  const y = Math.min(caja.y1, Math.max(caja.y0, p.y));
  const z = Math.min(caja.z1, Math.max(caja.z0, p.z));
  desvio.x = x - p.x;
  desvio.y = y - p.y;
  desvio.z = z - p.z;
  p.x = x;
  p.y = y;
  p.z = z;
}
