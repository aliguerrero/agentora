import { BoxGeometry, Float32BufferAttribute, Matrix4 } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Bloque, ClaveMaterial, LadoCorte } from './arquitectura';

/** Una pieza que no es caja (cúpula, sectores del caracol…), ya en coordenadas de mundo. */
export interface PiezaMundo {
  material: ClaveMaterial;
  lado?: LadoCorte;
  geometria: BufferGeometry;
}

const ATRIBUTOS = ['position', 'normal', 'uv'];

/**
 * UV en metros desde la posición de mundo, proyectando cada cara sobre el plano de su eje
 * dominante (mapeo de caja horneado): cajas de cualquier tamaño comparten escala y la veta o
 * el moldaje siguen de una caja a la vecina. La escala del material la da `repeat`.
 */
function uvMundo(g: BufferGeometry): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] =
      ax >= ay && ax >= az
        ? [pos.getZ(i), pos.getY(i)]
        : ay >= az
          ? [pos.getX(i), pos.getZ(i)]
          : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}

/** Deja una geometría de mundo lista para fusionar: sin índice, con normal y UV en metros. */
export function prepararPieza(g: BufferGeometry): BufferGeometry {
  const lista = g.index ? g.toNonIndexed() : g;
  if (lista !== g) g.dispose();
  for (const nombre of Object.keys(lista.attributes)) {
    if (!ATRIBUTOS.includes(nombre)) lista.deleteAttribute(nombre);
  }
  if (!lista.getAttribute('normal')) lista.computeVertexNormals();
  lista.clearGroups();
  uvMundo(lista);
  return lista;
}

const cizalla = new Matrix4();
const traslado = new Matrix4();

/** La caja de un bloque en coordenadas de mundo (cizallada si trae `pendiente`). */
export function geometriaBloque(b: Bloque): BufferGeometry {
  const g = new BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
  // y += pendiente · z (local): la caja sube a lo largo de z con sus caras verticales a plomo.
  if (b.pendiente) g.applyMatrix4(cizalla.makeShear(0, 0, 0, 0, 0, b.pendiente));
  g.applyMatrix4(traslado.makeTranslation((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2));
  const lista = prepararPieza(g);
  // La veta (nogal, deck) corre a lo largo del lado más largo de la caja, también en planta.
  if (b.z1 - b.z0 > b.x1 - b.x0) {
    const nor = lista.getAttribute('normal');
    const uv = lista.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.9) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
  }
  return lista;
}

/** Una malla fusionada: todo lo que comparte material y costado de corte. */
export interface GrupoFusion {
  material: ClaveMaterial;
  lado?: LadoCorte;
  geometria: BufferGeometry;
}

/**
 * Fusiona cajas y piezas en una geometría por (material, costado): la cámara oculta cada
 * costado por separado, así que lo que se oculta junto se dibuja junto y lo que no, no. Cuesta
 * un draw call por grupo. Las geometrías intermedias se liberan.
 */
export function fusionarPorCorte(
  bloques: readonly Bloque[],
  piezas: readonly PiezaMundo[] = [],
): GrupoFusion[] {
  const grupos = new Map<
    string,
    { base: Omit<GrupoFusion, 'geometria'>; lista: BufferGeometry[] }
  >();
  const agregar = (material: ClaveMaterial, lado: LadoCorte | undefined, g: BufferGeometry) => {
    const clave = `${material}|${lado ?? ''}`;
    const grupo = grupos.get(clave) ?? { base: { material, lado }, lista: [] };
    grupo.lista.push(g);
    grupos.set(clave, grupo);
  };
  for (const b of bloques) agregar(b.material, b.lado, geometriaBloque(b));
  for (const p of piezas) agregar(p.material, p.lado, p.geometria);
  return [...grupos.values()].map(({ base, lista }) => {
    const fusion = mergeGeometries(lista);
    for (const g of lista) g.dispose();
    if (!fusion) throw new Error(`No se pudo fusionar el material "${base.material}"`);
    fusion.computeBoundingSphere();
    return { ...base, geometria: fusion };
  });
}
