import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Nivel } from '../../../mansion/plano';
import type { ClaveMaterial } from '../arquitectura';
import { prepararPieza } from '../geometria';

/**
 * El taller donde se arma el mobiliario: cada pieza (caja, cilindro, forma extruida…) se
 * transforma a coordenadas de mundo al agregarla y, al final, todas se fusionan en una
 * geometría por material (y por lado y nivel cuando son revestimientos de un muro exterior,
 * para que la cámara pueda ocultarlos por separado). Así el mobiliario entero cuesta un draw
 * call por material. Sin DOM: corre igual en las pruebas.
 */

/** Materiales del mobiliario: los de la casa más los propios de los ambientes. */
export type ClaveAmbiente =
  | ClaveMaterial
  /** Estándar mate con color por vértice: telas, lomos, cerámica mate, plantas, alfombras. */
  | 'tinte'
  /** Estándar satinado con color por vértice: cerámica esmaltada, botellas, plásticos. */
  | 'tinte-brillo'
  /** Sin sombreado con color por vértice: neón, ampolletas, leds, brasas. */
  | 'emisivo'
  /** Aditivo radial con color por vértice: resplandores pintados (neón, bóveda, fuego). */
  | 'halo'
  /** Llamas de la chimenea (textura que sube y parpadea). */
  | 'fuego'
  /** Pantallas con código que avanza. */
  | 'codigo'
  /** Pantallas con gráficos, pipeline y ondas de audio. */
  | 'datos'
  /** Láminas impresas: carta estelar, cartas náuticas, cuadros abstractos. */
  | 'lamina'
  /** Espejo del gimnasio (metal pulido con reflejos pintados). */
  | 'espejo-gym'
  /** Cuero y tapices satinados con color por vértice (sillones, taburetes, cojines de máquina). */
  | 'piel';

export type Lado = 'norte' | 'sur' | 'este' | 'oeste';

/** Revestimiento pegado a un muro exterior: se oculta junto con ese muro. */
export interface Etiqueta {
  lado: Lado;
  nivel: Nivel;
}

/** Región de una textura atlas (0..1). */
export interface Rect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface Opciones {
  /** Rotación local (radianes, orden YXZ). */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Color por vértice (hex). Solo lo leen los materiales con color por vértice. */
  color?: string;
  /** Región del atlas: la UV propia de la geometría se lleva a ella. Sin región, UV en metros. */
  rect?: Rect;
}

export interface Fusionada {
  clave: ClaveAmbiente;
  etiqueta: Etiqueta | null;
  geometria: BufferGeometry;
}

const ATRIBUTOS = ['position', 'normal', 'uv'];
const plantillas = new Map<string, BufferGeometry>();

/** Geometría base compartida por clave (formas extruidas, planos): se crea una vez. */
export function plantilla(clave: string, crear: () => BufferGeometry): BufferGeometry {
  let g = plantillas.get(clave);
  if (!g) {
    g = crear();
    plantillas.set(clave, g);
  }
  return g;
}

const blanco = { r: 1, g: 1, b: 1 };

function rgb(hex: string | undefined) {
  if (!hex) return blanco;
  const n = parseInt(hex.slice(1), 16);
  // Lineal: los materiales leen el color por vértice en espacio lineal.
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return { r: lin((n >> 16) & 255), g: lin((n >> 8) & 255), b: lin(n & 255) };
}

const posicion = new Vector3();
const giro = new Quaternion();
const euler = new Euler();
const escala = new Vector3();
const local = new Matrix4();

export class Taller {
  private base = new Matrix4();
  private readonly pila: Matrix4[] = [];
  private readonly grupos = new Map<
    string,
    { clave: ClaveAmbiente; etiqueta: Etiqueta | null; partes: BufferGeometry[] }
  >();
  /** Caja de mundo de lo dibujado por cada dueño (para comprobar huellas). */
  readonly cajas = new Map<string, Box3>();
  /** Quién es dueño de lo que se agrega ahora (id de mueble), o `null`. */
  dueno: string | null = null;
  /** Etiqueta de corte de lo que se agrega ahora (revestimientos de muros exteriores). */
  etiqueta: Etiqueta | null = null;

  /** Dibuja `fn` con el origen trasladado a (x, y, z) y girado `ry` en torno a y. */
  en(x: number, y: number, z: number, ry: number, fn: () => void, rx = 0, rz = 0): void {
    this.pila.push(this.base.clone());
    posicion.set(x, y, z);
    giro.setFromEuler(euler.set(rx, ry, rz, 'YXZ'));
    escala.set(1, 1, 1);
    this.base.multiply(local.compose(posicion, giro, escala));
    try {
      fn();
    } finally {
      this.base = this.pila.pop() as Matrix4;
    }
  }

  /** Agrega una copia de `g` con centro en (x, y, z), escalada por (sx, sy, sz). */
  pieza(
    clave: ClaveAmbiente,
    g: BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    o: Opciones = {},
  ): void {
    posicion.set(x, y, z);
    giro.setFromEuler(euler.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'));
    escala.set(sx, sy, sz);
    const matriz = this.base.clone().multiply(local.compose(posicion, giro, escala));
    let copia = g.index ? g.toNonIndexed() : g.clone();
    copia.applyMatrix4(matriz);
    if (o.rect) {
      for (const nombre of Object.keys(copia.attributes)) {
        if (!ATRIBUTOS.includes(nombre)) copia.deleteAttribute(nombre);
      }
      copia.clearGroups();
      const uv = copia.getAttribute('uv');
      const { u0, v0, u1, v1 } = o.rect;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      }
    } else {
      copia = prepararPieza(copia);
    }
    const n = copia.getAttribute('position').count;
    const c = rgb(o.color);
    const colores = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colores[i * 3] = c.r;
      colores[i * 3 + 1] = c.g;
      colores[i * 3 + 2] = c.b;
    }
    copia.setAttribute('color', new Float32BufferAttribute(colores, 3));
    if (this.dueno) {
      copia.computeBoundingBox();
      const caja = this.cajas.get(this.dueno) ?? new Box3();
      caja.union(copia.boundingBox as Box3);
      this.cajas.set(this.dueno, caja);
    }
    const etiqueta = this.etiqueta;
    const llave = `${clave}|${etiqueta?.lado ?? ''}|${etiqueta?.nivel ?? ''}`;
    const grupo = this.grupos.get(llave) ?? { clave, etiqueta, partes: [] };
    grupo.partes.push(copia);
    this.grupos.set(llave, grupo);
  }

  /** Caja de ancho `w`, alto `h` y fondo `d` centrada en (x, y, z). */
  caja(
    clave: ClaveAmbiente,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    o?: Opciones,
  ): void {
    this.pieza(
      clave,
      plantilla('caja', () => new BoxGeometry(1, 1, 1)),
      x,
      y,
      z,
      w,
      h,
      d,
      o,
    );
  }

  /** Caja apoyada: su cara inferior en `y0`. */
  bloque(
    clave: ClaveAmbiente,
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    o?: Opciones,
  ): void {
    this.caja(clave, x, y0 + h / 2, z, w, h, d, o);
  }

  /** Caja de cantos redondeados (cojines, tapizados). */
  cojin(
    clave: ClaveAmbiente,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    radio: number,
    o?: Opciones,
  ): void {
    const r = Math.min(radio, w / 2, h / 2, d / 2) - 1e-4;
    const g = plantilla(
      `cojin:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`,
      () => new RoundedBoxGeometry(w, h, d, 2, r),
    );
    this.pieza(clave, g, x, y, z, 1, 1, 1, o);
  }

  /** Cilindro vertical (o girado con `o.rx`/`o.rz`) de radios r0 (arriba) y r1 (abajo). */
  cilindro(
    clave: ClaveAmbiente,
    x: number,
    y: number,
    z: number,
    r0: number,
    r1: number,
    h: number,
    lados: number,
    o?: Opciones,
  ): void {
    const m = Math.max(r0, r1);
    const a = r0 / m;
    const b = r1 / m;
    const g = plantilla(
      `cil:${a.toFixed(3)}:${b.toFixed(3)}:${lados}`,
      () => new CylinderGeometry(a, b, 1, lados),
    );
    this.pieza(clave, g, x, y, z, m, h, m, o);
  }

  /** Esfera (achatable con sy). */
  esfera(
    clave: ClaveAmbiente,
    x: number,
    y: number,
    z: number,
    r: number,
    lados: number,
    sy = 1,
    o?: Opciones,
  ): void {
    const g = plantilla(
      `esf:${lados}`,
      () => new SphereGeometry(1, lados, Math.max(3, Math.round(lados * 0.6))),
    );
    this.pieza(clave, g, x, y, z, r, r * sy, r, o);
  }

  /** Toro en el plano xy (gírelo con `o.rx` para acostarlo). */
  toro(
    clave: ClaveAmbiente,
    x: number,
    y: number,
    z: number,
    radio: number,
    tubo: number,
    lados: number,
    o?: Opciones,
  ): void {
    const g = plantilla(
      `toro:${radio}:${tubo}:${lados}`,
      () => new TorusGeometry(radio, tubo, 6, lados),
    );
    this.pieza(clave, g, x, y, z, 1, 1, 1, o);
  }

  /** Fusiona todo lo agregado: una geometría por (material, lado, nivel). */
  fusionar(): Fusionada[] {
    const resultado: Fusionada[] = [];
    for (const { clave, etiqueta, partes } of this.grupos.values()) {
      const geometria = mergeGeometries(partes);
      for (const p of partes) p.dispose();
      if (!geometria) throw new Error(`No se pudo fusionar el mobiliario de "${clave}"`);
      geometria.computeBoundingSphere();
      resultado.push({ clave, etiqueta, geometria });
    }
    this.grupos.clear();
    return resultado;
  }
}
