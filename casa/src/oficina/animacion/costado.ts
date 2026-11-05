import { ambienteDe, cajaDe, plano } from '../mansion/plano';
import type { Lugar, PuntoXZ } from '../mansion/plano';

/** Giro (rad) de la silla, respecto de su posición de trabajo, que se tolera sin pararse: 45°. */
export const UMBRAL_GIRO_SENTADO = Math.PI / 4;
/** Holgura (m) entre quien se para al costado y cualquier mueble o muro de su ambiente. */
const HOLGURA = 0.3;
const HOLGURA_TRAYECTO = 0.15;
const RADIOS = [0.95, 1.2, 1.5] as const;
const PASOS_ANGULO = 16;
const MUESTRAS_TRAYECTO = 6;

const envolver = (angulo: number) =>
  ((((angulo + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** Cuánto (rad, ≥ 0) tendría que girar quien trabaja sentado en `lugar` para mirar a `(x, z)`. */
export function giroHacia(lugar: Lugar, x: number, z: number): number {
  return Math.abs(envolver(Math.atan2(x - lugar.x, z - lugar.z) - lugar.yaw));
}

/** ¿Pasa del umbral? Entonces conviene pararse en vez de girar la silla. */
export const debePararse = (giro: number): boolean => giro > UMBRAL_GIRO_SENTADO;

/** Distancia (m) de un punto a la caja de un mueble (0 si está dentro). */
function distanciaACaja(m: Parameters<typeof cajaDe>[0], x: number, z: number): number {
  const c = cajaDe(m);
  return Math.hypot(Math.max(0, c.x0 - x, x - c.x1), Math.max(0, c.z0 - z, z - c.z1));
}

/** ¿Está el punto libre de muebles (salvo los que contienen `lugar`, su silla) y dentro del ambiente? */
function libre(lugar: Lugar, x: number, z: number, holgura: number, margenAmbiente: number) {
  const a = ambienteDe(lugar.ambiente);
  if (x < a.x0 + margenAmbiente || x > a.x1 - margenAmbiente) return false;
  if (z < a.z0 + margenAmbiente || z > a.z1 - margenAmbiente) return false;
  for (const m of plano.muebles) {
    if (m.ambiente !== lugar.ambiente) continue;
    if (distanciaACaja(m, lugar.x, lugar.z) === 0 && m.id === lugar.silla) continue;
    if (distanciaACaja(m, x, z) < holgura) return false;
  }
  return true;
}

/**
 * Dónde se para a mirar a `(haciaX, haciaZ)` quien se levanta de su silla: un punto junto a la
 * silla, libre de muebles y con el trayecto desde el asiento despejado. Entre los válidos elige
 * el más cercano a ese punto. Escribe en `salida` y devuelve `false` si no hay ninguno (se queda
 * sentado). No crea objetos.
 */
export function costadoLibre(
  lugar: Lugar,
  haciaX: number,
  haciaZ: number,
  salida: PuntoXZ,
): boolean {
  let mejor = Infinity;
  for (const r of RADIOS) {
    for (let k = 0; k < PASOS_ANGULO; k++) {
      const ang = (k / PASOS_ANGULO) * Math.PI * 2;
      const x = lugar.x + Math.sin(ang) * r;
      const z = lugar.z + Math.cos(ang) * r;
      if (!libre(lugar, x, z, HOLGURA, HOLGURA)) continue;
      let despejado = true;
      for (let s = 1; s < MUESTRAS_TRAYECTO && despejado; s++) {
        const f = s / MUESTRAS_TRAYECTO;
        despejado = libre(
          lugar,
          lugar.x + (x - lugar.x) * f,
          lugar.z + (z - lugar.z) * f,
          HOLGURA_TRAYECTO,
          0,
        );
      }
      if (!despejado) continue;
      const d = Math.hypot(haciaX - x, haciaZ - z) + r * 0.5;
      if (d < mejor) {
        mejor = d;
        salida.x = x;
        salida.z = z;
      }
    }
  }
  return mejor < Infinity;
}
