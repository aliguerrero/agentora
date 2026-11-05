import { Group, InstancedBufferAttribute, InstancedMesh, DynamicDrawUsage } from 'three';
import type { BufferGeometry, Color, Material, Matrix4 } from 'three';
import { uvDeCelda } from './celdas';
import type { GeometriaAtlas, UvCelda } from './celdas';

/**
 * Cómo se dibuja un grupo de piezas: todas las que comparten geometría y familia salen en un
 * solo draw call. El color va por instancia (multiplica al del material, que es blanco).
 */
export interface Familia {
  readonly clave: string;
  readonly material: Material;
  /** Variante con colores por vértice, para fusionar geometrías estáticas (decorado). */
  readonly fusion?: Material;
  /** Si existe, cada instancia elige una celda del atlas de la textura del material. */
  readonly atlas?: GeometriaAtlas;
  readonly ordenRender?: number;
}

/** Familia + color: lo que `Pieza` necesita para saber cómo pintarse. */
export interface Estilo {
  readonly familia: Familia;
  readonly color: Color | null;
}

const CAPACIDAD_INICIAL = 16;

interface Lote {
  malla: InstancedMesh;
  /** Geometría de la malla: propia (clon) si lleva atlas, compartida si no. */
  geometria: BufferGeometry;
  familia: Familia;
  capacidad: number;
  n: number;
}

const uv: UvCelda = { x: 0, y: 0 };

function crearMalla(
  geometria: BufferGeometry,
  familia: Familia,
  capacidad: number,
  sombras: boolean,
): InstancedMesh {
  const malla = new InstancedMesh(geometria, familia.material, capacidad);
  malla.instanceMatrix.setUsage(DynamicDrawUsage);
  malla.instanceColor = new InstancedBufferAttribute(new Float32Array(capacidad * 3), 3);
  malla.instanceColor.setUsage(DynamicDrawUsage);
  // Las instancias se mueven cada cuadro: la esfera envolvente de la geometría base mentiría.
  malla.frustumCulled = false;
  malla.castShadow = sombras;
  malla.renderOrder = familia.ordenRender ?? 0;
  malla.count = 0;
  malla.visible = false;
  return malla;
}

/**
 * Todas las piezas móviles de las personas, agrupadas en mallas instanciadas. Cada cuadro:
 * `inicio()`, un `agregar(...)` por pieza visible (en cualquier orden) y `fin()`. Las
 * instancias se compactan solas, así que no hay que reservar ni liberar espacios por agente.
 */
export class Flota {
  readonly raiz = new Group();
  private readonly lotes = new Map<BufferGeometry, Map<Familia, Lote>>();
  private readonly lista: Lote[] = [];
  private sombras = false;

  inicio(): void {
    for (const lote of this.lista) lote.n = 0;
  }

  agregar(
    geometria: BufferGeometry,
    familia: Familia,
    matriz: Matrix4,
    color: Color | null,
    celda: number,
  ): void {
    const lote = this.lote(geometria, familia);
    if (lote.n === lote.capacidad) this.crecer(lote);
    const i = lote.n++;
    const m = lote.malla.instanceMatrix.array as Float32Array;
    const e = matriz.elements;
    const o = i * 16;
    for (let k = 0; k < 16; k++) m[o + k] = e[k] ?? 0;
    const c = (lote.malla.instanceColor as InstancedBufferAttribute).array as Float32Array;
    c[i * 3] = color ? color.r : 1;
    c[i * 3 + 1] = color ? color.g : 1;
    c[i * 3 + 2] = color ? color.b : 1;
    if (familia.atlas) {
      uvDeCelda(familia.atlas, celda, uv);
      const a = lote.geometria.getAttribute('aAtlas') as InstancedBufferAttribute;
      (a.array as Float32Array)[i * 2] = uv.x;
      (a.array as Float32Array)[i * 2 + 1] = uv.y;
    }
  }

  fin(): void {
    for (const lote of this.lista) {
      const { malla } = lote;
      malla.count = lote.n;
      malla.visible = lote.n > 0;
      if (lote.n === 0) continue;
      malla.instanceMatrix.needsUpdate = true;
      (malla.instanceColor as InstancedBufferAttribute).needsUpdate = true;
      if (lote.familia.atlas) {
        (lote.geometria.getAttribute('aAtlas') as InstancedBufferAttribute).needsUpdate = true;
      }
    }
  }

  fijarSombras(activas: boolean): void {
    this.sombras = activas;
    for (const lote of this.lista) lote.malla.castShadow = activas;
  }

  /** Libera las mallas (no las geometrías ni materiales compartidos). La flota queda reutilizable. */
  liberar(): void {
    for (const lote of this.lista) this.descartar(lote);
    this.raiz.clear();
    this.lotes.clear();
    this.lista.length = 0;
  }

  private lote(geometria: BufferGeometry, familia: Familia): Lote {
    let porFamilia = this.lotes.get(geometria);
    if (!porFamilia) {
      porFamilia = new Map();
      this.lotes.set(geometria, porFamilia);
    }
    let lote = porFamilia.get(familia);
    if (!lote) {
      const propia = familia.atlas ? geometria.clone() : geometria;
      if (familia.atlas) this.atributoAtlas(propia, CAPACIDAD_INICIAL);
      lote = {
        malla: crearMalla(propia, familia, CAPACIDAD_INICIAL, this.sombras),
        geometria: propia,
        familia,
        capacidad: CAPACIDAD_INICIAL,
        n: 0,
      };
      this.raiz.add(lote.malla);
      porFamilia.set(familia, lote);
      this.lista.push(lote);
    }
    return lote;
  }

  /** Duplica la capacidad conservando lo ya escrito este cuadro. */
  private crecer(lote: Lote): void {
    const capacidad = lote.capacidad * 2;
    const vieja = lote.malla;
    const nueva = crearMalla(lote.geometria, lote.familia, capacidad, this.sombras);
    (nueva.instanceMatrix.array as Float32Array).set(vieja.instanceMatrix.array as Float32Array);
    const colores = vieja.instanceColor as InstancedBufferAttribute;
    (nueva.instanceColor as InstancedBufferAttribute).array.set(colores.array);
    if (lote.familia.atlas) {
      const anterior = lote.geometria.getAttribute('aAtlas') as InstancedBufferAttribute;
      // Soltar los buffers de la geometría antes de cambiar su atributo evita dejar uno huérfano en la GPU.
      lote.geometria.dispose();
      this.atributoAtlas(lote.geometria, capacidad);
      (lote.geometria.getAttribute('aAtlas') as InstancedBufferAttribute).array.set(anterior.array);
    }
    this.raiz.remove(vieja);
    vieja.dispose();
    this.raiz.add(nueva);
    lote.malla = nueva;
    lote.capacidad = capacidad;
  }

  private atributoAtlas(geometria: BufferGeometry, capacidad: number): void {
    const atributo = new InstancedBufferAttribute(new Float32Array(capacidad * 2), 2);
    atributo.setUsage(DynamicDrawUsage);
    geometria.setAttribute('aAtlas', atributo);
  }

  private descartar(lote: Lote): void {
    lote.malla.dispose();
    if (lote.familia.atlas) lote.geometria.dispose();
  }
}
