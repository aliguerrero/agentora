import { BufferAttribute } from 'three';
import type { BufferGeometry, Material, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Familia, Estilo } from './flota';

export interface ParteFija {
  geometria: BufferGeometry;
  estilo: Estilo;
  /** Matriz de mundo de la pieza. */
  matriz: Matrix4;
}

export interface Fusion {
  geometria: BufferGeometry;
  material: Material;
}

const ATRIBUTOS = ['position', 'normal', 'uv'];

/**
 * Fusiona piezas estáticas en una sola geometría por familia: el decorado entero se dibuja
 * con un draw call por material, no por pieza. Cada pieza hornea su matriz de mundo y su
 * color (por vértice) en la copia; las geometrías originales no se tocan.
 */
export function fusionar(partes: readonly ParteFija[]): Fusion[] {
  const grupos = new Map<Familia, BufferGeometry[]>();
  for (const { geometria, estilo, matriz } of partes) {
    const copia = geometria.index ? geometria.toNonIndexed() : geometria.clone();
    copia.applyMatrix4(matriz);
    copia.clearGroups();
    for (const nombre of Object.keys(copia.attributes)) {
      if (!ATRIBUTOS.includes(nombre)) copia.deleteAttribute(nombre);
    }
    const { familia, color } = estilo;
    if (familia.fusion) {
      const n = copia.getAttribute('position').count;
      const colores = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colores[i * 3] = color ? color.r : 1;
        colores[i * 3 + 1] = color ? color.g : 1;
        colores[i * 3 + 2] = color ? color.b : 1;
      }
      copia.setAttribute('color', new BufferAttribute(colores, 3));
    }
    const lista = grupos.get(familia) ?? [];
    lista.push(copia);
    grupos.set(familia, lista);
  }
  return [...grupos].map(([familia, copias]) => {
    const geometria = mergeGeometries(copias);
    for (const copia of copias) copia.dispose();
    if (!geometria) throw new Error(`No se pudo fusionar la familia "${familia.clave}"`);
    return { geometria, material: familia.fusion ?? familia.material };
  });
}
