import { BoxGeometry, MeshBasicMaterial } from 'three';
import type { BufferGeometry, ColorRepresentation, Material, Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const geometrias = new Map<string, BufferGeometry>();
const materiales = new Map<string, Material>();

/** Geometría compartida por clave: se crea una vez y se reutiliza en toda la escena. */
export function geometria<G extends BufferGeometry>(clave: string, crear: () => G): G {
  let existente = geometrias.get(clave);
  if (!existente) {
    existente = crear();
    geometrias.set(clave, existente);
  }
  return existente as G;
}

/** Material compartido por clave. */
export function material<M extends Material>(clave: string, crear: () => M): M {
  let existente = materiales.get(clave);
  if (!existente) {
    existente = crear();
    materiales.set(clave, existente);
  }
  return existente as M;
}

export const caja = (ancho: number, alto: number, fondo: number) =>
  geometria(`caja:${ancho}:${alto}:${fondo}`, () => new BoxGeometry(ancho, alto, fondo));

export const cajaRedonda = (
  ancho: number,
  alto: number,
  fondo: number,
  segmentos: number,
  radio: number,
) =>
  geometria(
    `cajaR:${ancho}:${alto}:${fondo}:${segmentos}:${radio}`,
    () => new RoundedBoxGeometry(ancho, alto, fondo, segmentos, radio),
  );

export const materialBasico = (color: ColorRepresentation) =>
  material(`basico:${String(color)}`, () => new MeshBasicMaterial({ color, toneMapped: false }));

/**
 * Deja de recalcular la matriz local de un árbol que no se mueve. Se usa como `ref` de
 * grupos estáticos (decorado, peinados, accesorios): la matriz se calcula una sola vez.
 */
export function congelar(raiz: Object3D | null): void {
  raiz?.traverse((objeto) => {
    objeto.updateMatrix();
    objeto.matrixAutoUpdate = false;
  });
}
