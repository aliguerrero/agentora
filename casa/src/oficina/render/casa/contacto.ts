import { ESPESOR_LOSA, NIVEL_Y } from '../../mansion/plano';
import { HUELLA, VUELO } from './arquitectura';

/**
 * Sombras de contacto pintadas por fuera de la casa, para darle peso sin mapas de sombra:
 *
 * - En el suelo, al pie de los muros de los costados y del fondo: una franja oscura que se
 *   desvanece hacia afuera y llega hasta donde vuelan las losas (su sombra suave).
 * - En los muros de los costados, bajo cada losa en voladizo: el cielo del vuelo oscurece el
 *   muro justo debajo.
 *
 * Son cuadriláteros con opacidad por vértice (alta en la arista, cero lejos de ella). Lógica
 * pura: la capa R3F los fusiona en una sola malla.
 */

export interface Cuadro {
  /** Las cuatro esquinas en orden (x, y, z), con la cara visible hacia `normal`. */
  esquinas: [number, number, number][];
  /** Opacidad de cada esquina, en el mismo orden. */
  alfa: [number, number, number, number];
}

/** Sobre el pasto y la piedra (y = 0), apenas encima para no pelear con ellos. */
const Y_SUELO = 0.006;
/** Ancho de la sombra en el suelo: hasta un poco más allá del vuelo de las losas. */
export const ANCHO_SUELO = VUELO + 0.8;
/** Alto de la sombra bajo cada losa en voladizo, sobre el muro. */
export const ALTO_MURO = 1.1;
/** Opacidad en la arista. */
export const ALFA_SUELO = 0.38;
export const ALFA_MURO = 0.3;

/** Losas que vuelan sobre los costados: la cara inferior de cada una. */
const CARAS_VUELO = [NIVEL_Y.piso2, NIVEL_Y.piso3, NIVEL_Y.torre].map((y) => y - ESPESOR_LOSA);

export function sombrasExteriores(): Cuadro[] {
  const { x0, x1, z0, z1 } = HUELLA;
  const a = ALFA_SUELO;
  const s = ANCHO_SUELO;
  const y = Y_SUELO;
  const cuadros: Cuadro[] = [
    // Suelo junto al costado este y al oeste (a lo largo de z), y junto al fondo (a lo largo de x).
    {
      esquinas: [
        [x1, y, z1],
        [x1 + s, y, z1],
        [x1 + s, y, z0],
        [x1, y, z0],
      ],
      alfa: [a, 0, 0, a],
    },
    {
      esquinas: [
        [x0 - s, y, z1],
        [x0, y, z1],
        [x0, y, z0],
        [x0 - s, y, z0],
      ],
      alfa: [0, a, a, 0],
    },
    {
      esquinas: [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z0 - s],
        [x0, y, z0 - s],
      ],
      alfa: [a, a, 0, 0],
    },
  ];
  for (const techo of CARAS_VUELO) {
    const abajo = techo - ALTO_MURO;
    const m = ALFA_MURO;
    // Muro este (cara hacia +x) y oeste (cara hacia -x), bajo el cielo del vuelo.
    cuadros.push({
      esquinas: [
        [x1 + 0.004, abajo, z1],
        [x1 + 0.004, abajo, z0],
        [x1 + 0.004, techo, z0],
        [x1 + 0.004, techo, z1],
      ],
      alfa: [0, 0, m, m],
    });
    cuadros.push({
      esquinas: [
        [x0 - 0.004, abajo, z0],
        [x0 - 0.004, abajo, z1],
        [x0 - 0.004, techo, z1],
        [x0 - 0.004, techo, z0],
      ],
      alfa: [0, 0, m, m],
    });
  }
  return cuadros;
}
