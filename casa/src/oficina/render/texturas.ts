import {
  AdditiveBlending,
  CanvasTexture,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';
import type { Material } from 'three';
import {
  dibujarCara,
  dibujarCaraCalabaza,
  dibujarHuesoExtremidad,
  dibujarIcono,
  dibujarTorso,
  dibujarVendas,
  ESTILOS_CARA,
  parpadea,
} from './caras';
import type { DatosTorso } from './caras';
import { altoAtlas, anchoAtlas, crearAsignador, escalaDeCelda } from './celdas';
import type { GeometriaAtlas } from './celdas';
import { material } from './recursos';
import type { EstadoAgente } from '../tipos';

type Dibujo = (ctx: CanvasRenderingContext2D, ancho: number, alto: number) => void;

const texturas = new Map<string, CanvasTexture>();

/**
 * Textura de lienzo cacheada por clave. Todo dibujo ocurre aquí, una vez por clave y
 * fuera del bucle de render: el bucle solo intercambia materiales ya construidos.
 */
function lienzo(clave: string, ancho: number, alto: number, dibujar: Dibujo): CanvasTexture {
  const existente = texturas.get(clave);
  if (existente) return existente;
  const cv = document.createElement('canvas');
  cv.width = ancho;
  cv.height = alto;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error(`No se pudo crear el contexto 2D de la textura "${clave}"`);
  dibujar(ctx, ancho, alto);
  const textura = new CanvasTexture(cv);
  textura.colorSpace = SRGBColorSpace;
  textura.anisotropy = 4;
  texturas.set(clave, textura);
  return textura;
}

// --- atlas: una textura por tipo de parte con celdas que cada instancia elige ---

interface Atlas {
  readonly geometria: GeometriaAtlas;
  readonly textura: CanvasTexture;
  /** Celda de `clave`; la dibuja la primera vez (nunca en el bucle de render salvo estilos nuevos). */
  celda(clave: string, dibujar: Dibujo): number;
}

function crearAtlas(geometria: GeometriaAtlas, capacidad = geometria.columnas * geometria.filas) {
  const lienzoAtlas = document.createElement('canvas');
  lienzoAtlas.width = anchoAtlas(geometria);
  lienzoAtlas.height = altoAtlas(geometria);
  const ctx = lienzoAtlas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D del atlas de texturas');
  const textura = new CanvasTexture(lienzoAtlas);
  textura.colorSpace = SRGBColorSpace;
  textura.anisotropy = 4;
  const asignador = crearAsignador(capacidad);
  const indices = new Map<string, number>();
  const atlas: Atlas = {
    geometria,
    textura,
    celda(clave, dibujar) {
      const conocida = indices.get(clave);
      if (conocida !== undefined) return conocida;
      const { indice } = asignador.asignar(clave);
      indices.set(clave, indice);
      const { celdaAncho, celdaAlto, columnas } = geometria;
      ctx.save();
      ctx.translate((indice % columnas) * celdaAncho, Math.floor(indice / columnas) * celdaAlto);
      ctx.beginPath();
      ctx.rect(0, 0, celdaAncho, celdaAlto);
      ctx.clip();
      dibujar(ctx, celdaAncho, celdaAlto);
      ctx.restore();
      textura.needsUpdate = true;
      return indice;
    },
  };
  return atlas;
}

/**
 * Hace que un material con `map` lea su textura como atlas: el atributo por instancia
 * `aAtlas` desplaza y recorta las UV hacia la celda elegida.
 */
function conAtlas<M extends Material>(m: M, g: GeometriaAtlas): M {
  const { x, y } = escalaDeCelda(g);
  const escala = `vec2(${x.toFixed(8)}, ${y.toFixed(8)})`;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aAtlas;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * ${escala} + aAtlas;\n#endif`,
      );
  };
  m.customProgramCacheKey = () => `atlas:${escala}`;
  return m;
}

let atlasCaras: Atlas | undefined;
let atlasTorsos: Atlas | undefined;
let atlasIconos: Atlas | undefined;

/** 32 celdas: 8 estilos × (ojos abiertos, ojos cerrados) y margen para estilos nuevos. */
const cara = () =>
  (atlasCaras ??= crearAtlas({
    columnas: 8,
    filas: 4,
    celdaAncho: 128,
    celdaAlto: 128,
    margen: 2,
  }));
/** 128 celdas: distintos tops × colores × estampados a la vez; llenarlo es un error explícito. */
const torso = () =>
  (atlasTorsos ??= crearAtlas({
    columnas: 8,
    filas: 16,
    celdaAncho: 128,
    celdaAlto: 136,
    margen: 4,
  }));
const iconos = () =>
  (atlasIconos ??= crearAtlas({ columnas: 2, filas: 1, celdaAncho: 96, celdaAlto: 96, margen: 1 }));

export const geometriaAtlasCaras = () => cara().geometria;
export const geometriaAtlasTorsos = () => torso().geometria;
export const geometriaAtlasIconos = () => iconos().geometria;

/** Material de las caras (todas las personas, un draw call): lee el atlas de caras. */
export const materialAtlasCaras = () =>
  material('atlas-caras', () =>
    conAtlas(
      new MeshBasicMaterial({ map: cara().textura, transparent: true, depthWrite: false }),
      cara().geometria,
    ),
  );

/** Material del frente de los torsos: estándar (recibe luz) y lee el atlas de torsos. */
export const materialAtlasTorsos = () =>
  material('atlas-torsos', () =>
    conAtlas(new MeshStandardMaterial({ map: torso().textura, roughness: 0.6 }), torso().geometria),
  );

export const materialAtlasIconos = () =>
  material('atlas-iconos', () =>
    conAtlas(
      new MeshBasicMaterial({ map: iconos().textura, transparent: true, depthWrite: false }),
      iconos().geometria,
    ),
  );

const celdasDeCara = new Map<string, readonly [number, number]>();

/**
 * Celdas `[ojos abiertos, ojos cerrados]` de un estilo de cara. Los estilos que no parpadean
 * (calavera, momia) devuelven la misma celda dos veces.
 */
export function celdasCara(estilo: string): readonly [number, number] {
  const conocidas = celdasDeCara.get(estilo);
  if (conocidas) return conocidas;
  const abierta = cara().celda(`${estilo}:abierta`, (x) => dibujarCara(x, estilo, false));
  const cerrada = parpadea(estilo)
    ? cara().celda(`${estilo}:cerrada`, (x) => dibujarCara(x, estilo, true))
    : abierta;
  const par = [abierta, cerrada] as const;
  celdasDeCara.set(estilo, par);
  return par;
}

/** Celda del frente de un torso, cacheada por top, color, estampado y (vampiro) cara. */
export function celdaTorso(a: DatosTorso): number {
  const clave = `torso:${a.top}:${a.topColor}:${a.print}:${a.face === 'vampiro' ? 'v' : ''}`;
  return torso().celda(clave, (x, w, h) => dibujarTorso(x, w, h, a));
}

/** Celda del globo de estado; `libre` no tiene globo. */
export function celdaIcono(estado: Exclude<EstadoAgente, 'libre'>): number {
  return iconos().celda(estado, (x) => dibujarIcono(x, estado === 'esperando_decision'));
}

export const materialCaraCalabaza = () =>
  material(
    'cara:calabaza',
    () =>
      new MeshBasicMaterial({
        map: lienzo('cara:calabaza', 128, 128, (x) => dibujarCaraCalabaza(x)),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
  );

export const materialVendas = () =>
  material(
    'vendas',
    () =>
      new MeshStandardMaterial({
        map: lienzo('vendas', 64, 64, dibujarVendas),
        roughness: 0.6,
      }),
  );

export const materialHueso = () =>
  material(
    'hueso',
    () =>
      new MeshStandardMaterial({
        map: lienzo('hueso', 32, 64, dibujarHuesoExtremidad),
        roughness: 0.6,
      }),
  );

/** Degradado radial (centro → borde) cacheado por clave: halos, charcos de luz y sombras de contacto. */
export function texturaRadial(
  clave: string,
  paradas: ReadonlyArray<readonly [number, string]>,
): CanvasTexture {
  return lienzo(clave, 128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [posicion, color] of paradas) g.addColorStop(posicion, color);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
}

/** Sombra de contacto: mancha oscura que se desvanece hacia el borde. */
export const materialBlob = () =>
  material(
    'blob',
    () =>
      new MeshBasicMaterial({
        map: texturaRadial('blob', [
          [0, 'rgba(0,0,0,0.55)'],
          [1, 'rgba(0,0,0,0)'],
        ]),
        transparent: true,
        depthWrite: false,
      }),
  );

/** Halo de Jules (sprite aditivo). */
export const materialHaloJules = () =>
  material(
    'halo-jules',
    () =>
      new SpriteMaterial({
        map: texturaRadial('halo-jules', [
          [0, 'rgba(255,236,200,1)'],
          [0.25, 'rgba(240,168,72,0.55)'],
          [1, 'rgba(240,168,72,0)'],
        ]),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
  );

/** Degradado lineal a lo largo de la textura (v = 0 → 1), cacheado por clave. */
export function texturaLineal(
  clave: string,
  paradas: ReadonlyArray<readonly [number, string]>,
): CanvasTexture {
  return lienzo(clave, 4, 64, (x) => {
    // El lienzo va de arriba (v = 1) a abajo (v = 0).
    const g = x.createLinearGradient(0, 64, 0, 0);
    for (const [posicion, color] of paradas) g.addColorStop(posicion, color);
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 64);
  });
}

/**
 * Construye de una vez todas las texturas que usa el bucle de animación (caras abiertas
 * y cerradas, globos de estado, sombra). Se llama antes del primer cuadro; después de
 * esto, animar solo cambia de celda.
 */
export function precalentarTexturas(): void {
  for (const estilo of ESTILOS_CARA) celdasCara(estilo);
  celdaIcono('trabajando');
  celdaIcono('esperando_decision');
  materialBlob();
}
