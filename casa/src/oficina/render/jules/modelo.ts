import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Jules, jefa de gabinete: figura procedural por bloques (mismo lenguaje que las personas) con
 * su propio look. Cada grupo de piezas se funde en una sola geometría con color por vértice,
 * así toda la figura cuesta unas pocas mallas. Medidas en metros con los pies en y = 0.
 */
export const COLORES = {
  piel: '#e2ae8e',
  pelo: '#15110f',
  blazer: '#cf6f33',
  blazerSombra: '#a85626',
  blusa: '#f4ecdc',
  pantalon: '#2a2e38',
  zapato: '#3a2a22',
  marco: '#1d1b1b',
  tableta: '#23262d',
  labio: '#8a3a44',
} as const;

/** Dónde están las articulaciones, en el sistema de la figura. */
export const HOMBRO_X = 0.31;
export const HOMBRO_Y = 1.2;
export const CUELLO_Y = 1.3;
export const CODO_Y = -0.3;

type Tupla = [number, number, number];

function pieza(g: BufferGeometry, color: string, m: Matrix4): BufferGeometry {
  const copia = g;
  copia.applyMatrix4(m);
  const n = copia.getAttribute('position').count;
  const c = new Color(color);
  const colores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colores, i * 3);
  copia.setAttribute('color', new Float32BufferAttribute(colores, 3));
  return copia;
}

const mover = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz)));

function bloque(
  [w, h, d]: Tupla,
  [x, y, z]: Tupla,
  color: string,
  radio = 0.025,
  rot: Tupla = [0, 0, 0],
  base?: Matrix4,
): BufferGeometry {
  const m = (base ?? new Matrix4()).clone().multiply(mover(x, y, z, ...rot));
  return pieza(new RoundedBoxGeometry(w, h, d, 2, radio), color, m);
}

function aro(radio: number, tubo: number, pos: Tupla, color: string): BufferGeometry {
  return pieza(new TorusGeometry(radio, tubo, 5, 18).toNonIndexed(), color, mover(...pos));
}

const fundir = (partes: BufferGeometry[]) => {
  const g = mergeGeometries(partes);
  if (!g) throw new Error('Jules: las piezas no comparten atributos');
  return g;
};

/** Piernas, zapatos, torso con blazer y blusa, y cuello (todo lo que no se mueve). */
function crearCuerpo(): BufferGeometry {
  const c = COLORES;
  const partes: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    partes.push(bloque([0.17, 0.64, 0.2], [s * 0.1, 0.39, 0], c.pantalon, 0.03));
    partes.push(bloque([0.18, 0.09, 0.3], [s * 0.1, 0.045, 0.04], c.zapato, 0.035));
  }
  partes.push(bloque([0.52, 0.14, 0.3], [0, 0.78, 0], c.blazer, 0.05));
  partes.push(bloque([0.5, 0.52, 0.28], [0, 1.0, 0], c.blazer, 0.05));
  partes.push(bloque([0.62, 0.1, 0.27], [0, 1.2, 0], c.blazer, 0.04));
  // Blusa clara en V entre las solapas, y las solapas más oscuras.
  partes.push(bloque([0.15, 0.4, 0.02], [0, 1.02, 0.14], c.blusa, 0.01));
  for (const s of [-1, 1]) {
    partes.push(
      bloque([0.1, 0.4, 0.025], [s * 0.1, 1.02, 0.148], c.blazerSombra, 0.01, [0, 0, s * 0.18]),
    );
  }
  partes.push(bloque([0.1, 0.12, 0.1], [0, CUELLO_Y - 0.03, 0], c.piel, 0.03));
  return fundir(partes);
}

/** Cabeza con melena bob, flequillo recto, lentes de marco fino y ojos. Origen en el cuello. */
function crearCabeza(): BufferGeometry {
  const c = COLORES;
  const partes: BufferGeometry[] = [];
  partes.push(bloque([0.4, 0.4, 0.38], [0, 0.22, 0], c.piel, 0.09));
  partes.push(bloque([0.45, 0.1, 0.42], [0, 0.4, -0.01], c.pelo, 0.05));
  partes.push(bloque([0.43, 0.08, 0.07], [0, 0.375, 0.185], c.pelo, 0.025));
  partes.push(bloque([0.48, 0.42, 0.14], [0, 0.15, -0.19], c.pelo, 0.05));
  for (const s of [-1, 1]) {
    partes.push(bloque([0.075, 0.36, 0.34], [s * 0.225, 0.14, -0.03], c.pelo, 0.03));
    partes.push(bloque([0.045, 0.045, 0.01], [s * 0.095, 0.245, 0.19], c.marco, 0.01));
    partes.push(aro(0.06, 0.007, [s * 0.095, 0.245, 0.198], c.marco));
    partes.push(bloque([0.07, 0.014, 0.01], [s * 0.095, 0.31, 0.19], c.pelo, 0.005));
  }
  partes.push(bloque([0.05, 0.01, 0.01], [0, 0.255, 0.2], c.marco, 0.004));
  partes.push(bloque([0.04, 0.06, 0.04], [0, 0.17, 0.2], c.piel, 0.015));
  return fundir(partes);
}

/** Brazo de la tableta: hombro, codo doblado hacia adelante y tableta en la mano. */
function crearBrazoTableta(): { brazo: BufferGeometry; pantalla: BufferGeometry } {
  const c = COLORES;
  const flexHombro = -0.2;
  const flexCodo = -1.45;
  const hombro = new Matrix4().makeRotationX(flexHombro);
  const codo = hombro
    .clone()
    .multiply(new Matrix4().makeTranslation(0, CODO_Y, 0))
    .multiply(new Matrix4().makeRotationX(flexCodo));
  const mano = codo.clone().multiply(new Matrix4().makeTranslation(0, -0.31, 0));
  const partes: BufferGeometry[] = [
    bloque([0.14, 0.3, 0.15], [0, -0.15, 0], c.blazer, 0.035, [0, 0, 0], hombro),
    bloque([0.125, 0.27, 0.135], [0, -0.135, 0], c.blazer, 0.035, [0, 0, 0], codo),
    bloque([0.1, 0.1, 0.09], [0, -0.01, 0], c.piel, 0.03, [0, 0, 0], mano),
  ];
  const tableta = mano.clone().multiply(mover(0, 0.1, 0.07, 0, 0.5, 0));
  partes.push(bloque([0.23, 0.31, 0.025], [0, 0, 0], c.tableta, 0.015, [0, 0, 0], tableta));
  // La pantalla se dibuja aparte, con material propio que brilla.
  const pantalla = new RoundedBoxGeometry(0.2, 0.27, 0.004, 1, 0.002);
  pantalla.applyMatrix4(tableta.clone().multiply(new Matrix4().makeTranslation(0, 0, 0.0135)));
  return { brazo: fundir(partes), pantalla };
}

/** Brazo libre: brazo superior, y antebrazo con mano (el codo es una articulación aparte). */
function crearBrazoLibre(): { superior: BufferGeometry; inferior: BufferGeometry } {
  const c = COLORES;
  return {
    superior: fundir([bloque([0.14, 0.3, 0.15], [0, -0.15, 0], c.blazer, 0.035)]),
    inferior: fundir([
      bloque([0.125, 0.27, 0.135], [0, -0.135, 0], c.blazer, 0.035),
      bloque([0.1, 0.1, 0.09], [0, -0.31, 0], c.piel, 0.03),
    ]),
  };
}

export interface GeometriasJules {
  cuerpo: BufferGeometry;
  cabeza: BufferGeometry;
  brazoTableta: BufferGeometry;
  pantalla: BufferGeometry;
  brazoSuperior: BufferGeometry;
  brazoInferior: BufferGeometry;
  boca: BufferGeometry;
}

let cache: GeometriasJules | null = null;

/** Geometrías de la figura, creadas una sola vez y compartidas. */
export function geometriasJules(): GeometriasJules {
  if (!cache) {
    const tableta = crearBrazoTableta();
    const libre = crearBrazoLibre();
    cache = {
      cuerpo: crearCuerpo(),
      cabeza: crearCabeza(),
      brazoTableta: tableta.brazo,
      pantalla: tableta.pantalla,
      brazoSuperior: libre.superior,
      brazoInferior: libre.inferior,
      boca: new RoundedBoxGeometry(0.085, 0.022, 0.01, 1, 0.005),
    };
  }
  return cache;
}
