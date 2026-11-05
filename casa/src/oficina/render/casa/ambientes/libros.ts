/**
 * Lomos de libros para un estante: anchos, alturas y colores variados en tandas, con huecos
 * libres donde va un objeto (jarrón, figura).
 * Lógica pura y determinista por semilla: la misma biblioteca en cada carga.
 */

export interface Estante {
  /** Extremos del estante en x (coordenadas locales del librero). */
  x0: number;
  x1: number;
  /** Altura libre entre la balda y la siguiente. */
  alto: number;
  /** Fondo útil del estante. */
  fondo: number;
}

export interface Libro {
  /** Centro del lomo en x; se apoya en la balda (y = 0) y sobresale hacia el frente. */
  x: number;
  ancho: number;
  alto: number;
  fondo: number;
  color: string;
}

export interface Hueco {
  x0: number;
  x1: number;
}

/** Tapas de biblioteca: cueros, telas y papeles en tonos profundos, con algún claro. */
const COLORES = [
  '#6e1f1c', // burdeos
  '#8c2f22', // óxido
  '#1f3a2e', // verde inglés
  '#2c4a3a', // musgo
  '#1d2a44', // azul marino
  '#33466b', // azul pizarra
  '#b8892f', // ocre
  '#c9a35a', // mostaza claro
  '#e7dcc6', // crudo
  '#d2c3a4', // lino
  '#17181a', // negro
  '#5a3a26', // cuero
  '#7a5230', // tabaco
  '#a14b2d', // terracota
  '#3f6b6b', // petróleo
];

function generador(semilla: number) {
  let s = (Math.abs(Math.floor(semilla)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SEPARACION = 0.002;

/**
 * Llena un estante de izquierda a derecha en tandas: cada tanda es una serie de lomos de una
 * misma altura aproximada; entre tandas, con cierta probabilidad, queda un hueco libre.
 */
export function colocarLibros(e: Estante, semilla: number): { libros: Libro[]; huecos: Hueco[] } {
  const azar = generador(semilla * 7919 + 13);
  const libros: Libro[] = [];
  const huecos: Hueco[] = [];
  let x = e.x0 + 0.01;
  const fin = e.x1 - 0.01;
  while (x < fin - 0.03) {
    // Hueco para un objeto: entre 0,14 y 0,26 m, a veces.
    if (libros.length > 0 && azar() < 0.22) {
      const largo = 0.14 + azar() * 0.12;
      if (x + largo <= fin) {
        huecos.push({ x0: x, x1: x + largo });
        x += largo + SEPARACION;
        continue;
      }
    }
    const altoTanda = e.alto * (0.62 + azar() * 0.3);
    const cuantos = 4 + Math.floor(azar() * 14);
    for (let i = 0; i < cuantos && x < fin - 0.02; i++) {
      const ancho = Math.min(0.018 + azar() * 0.045, fin - x);
      if (ancho < 0.015) break;
      const alto = Math.min(e.alto - 0.02, altoTanda * (0.88 + azar() * 0.16));
      const fondo = Math.min(e.fondo, e.fondo * (0.7 + azar() * 0.28));
      const color = COLORES[Math.floor(azar() * COLORES.length)] as string;
      libros.push({ x: x + ancho / 2, ancho, alto, fondo, color });
      x += ancho + SEPARACION;
    }
    x += 0.004;
  }
  return { libros, huecos };
}
