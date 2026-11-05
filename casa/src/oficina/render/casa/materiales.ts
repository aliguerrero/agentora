import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  ShaderChunk,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Material, Texture } from 'three';
import { material } from '../recursos';
import type { ClaveMaterial } from './arquitectura';
import { versionPlano } from '../../mansion/plano';
import { glslOclusion } from './oclusion';

/**
 * Materiales PBR de la mansión, compartidos por la arquitectura y por el mobiliario. Cada uno
 * nace con su color plano y, cuando su textura CC0 (Poly Haven, ver `texturas/LICENCIA.md`)
 * termina de cargar, la recibe y cambia el color plano por el tinte: si una textura no carga,
 * el material queda con su color (nunca negro). Las UV de la arquitectura van en metros
 * (`geometria.ts`), así que `repeat` es 1 / tamaño de la textura en metros.
 *
 * Las URLs usan `new URL('./texturas/x.webp', import.meta.url)`, que empaquetan tanto Vite (el
 * laboratorio) como Next con webpack o Turbopack (la demo) como recursos con hash.
 */

const ANISOTROPIA = 4;
const cargador = new TextureLoader();

interface Mapas {
  /** URL de la textura de color. */
  color?: string;
  /** URL del mapa de rugosidad (en espacio lineal). */
  rugosidad?: string;
  /** Lado de la textura en metros. */
  metros: number;
  /** Color que multiplica a la textura una vez cargada. */
  tinte: string;
}

function textura(url: string, metros: number, esColor: boolean, alCargar: (t: Texture) => void) {
  cargador.load(
    url,
    (t) => {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(1 / metros, 1 / metros);
      t.anisotropy = ANISOTROPIA;
      if (esColor) t.colorSpace = SRGBColorSpace;
      alCargar(t);
    },
    undefined,
    () => {
      // Sin textura el material conserva su color plano: se ve, aunque más liso.
    },
  );
}

/** Asigna los mapas al material a medida que cargan (en el navegador; en pruebas no hay DOM). */
function conMapas<M extends MeshStandardMaterial>(m: M, mapas: Mapas): M {
  if (typeof document === 'undefined') return m;
  if (mapas.color) {
    textura(mapas.color, mapas.metros, true, (t) => {
      m.map = t;
      m.color.set(mapas.tinte);
      m.needsUpdate = true;
    });
  }
  if (mapas.rugosidad) {
    textura(mapas.rugosidad, mapas.metros, false, (t) => {
      m.roughnessMap = t;
      m.needsUpdate = true;
    });
  }
  return m;
}

const estandar = (color: string, roughness: number, metalness = 0) =>
  new MeshStandardMaterial({ color, roughness, metalness });

/**
 * Mármol blanco veteado (Calacatta) dibujado una vez en un lienzo: base cálida, vetas grises
 * con un hilo dorado y la junta de las placas en el borde (placas de 1,2 m).
 */
function marmolVeteado(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const lado = 1024;
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  const fondo = ctx.createLinearGradient(0, 0, lado, lado);
  fondo.addColorStop(0, '#f3f1ec');
  fondo.addColorStop(0.5, '#ebe8e2');
  fondo.addColorStop(1, '#f1eee8');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, lado, lado);
  // Pseudoazar determinista: la misma placa en cada carga.
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647;
  };
  const veta = (ancho: number, alfa: number, color: string) => {
    let x = azar() * lado;
    let y = -40;
    let angulo = 0.9 + azar() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < lado + 40 && x > -40 && x < lado + 40) {
      angulo += (azar() - 0.5) * 0.5;
      x += Math.cos(angulo) * 18;
      y += Math.abs(Math.sin(angulo)) * 18 + 4;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alfa;
    ctx.lineWidth = ancho;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  for (let i = 0; i < 5; i++) {
    const s = semilla;
    veta(30, 0.07, '#8d8a86');
    semilla = s;
    veta(10, 0.2, '#7d7a76');
    semilla = s;
    veta(3, 0.7, '#55524f');
  }
  for (let i = 0; i < 9; i++) veta(1.6, 0.4, '#8e8a84');
  veta(4, 0.5, '#b08c58');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(150,146,140,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, lado, lado);
  const t = new CanvasTexture(lienzo);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(1 / 1.2, 1 / 1.2);
  t.anisotropy = ANISOTROPIA;
  return t;
}

/**
 * Terreno cortado de la maqueta: estratos creíbles según la altura del mundo, en todas las
 * caras del corte (la cámara gira 360°). De arriba abajo: humus oscuro con raíces finas,
 * arcilla ocre con moteado, una capa de ripio con bolones y la roca madre gris con
 * fracturas. Los límites ondulan y bajan levemente hacia el valle (+z), como en un corte real.
 * Ruido por valor en el shader: sin texturas, el mismo programa para la roca y la tierra.
 */
function estratos(base: string): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: base, roughness: 0.95 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoEst;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vMundoEst = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vMundoEst;
float hashEst(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruidoEst(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashEst(i), hashEst(i + vec2(1.0, 0.0)), f.x), mix(hashEst(i + vec2(0.0, 1.0)), hashEst(i + 1.0), f.x), f.y);
}
float fbmEst(vec2 p) { return 0.5 * ruidoEst(p) + 0.25 * ruidoEst(p * 2.03) + 0.125 * ruidoEst(p * 4.1) + 0.0625 * ruidoEst(p * 8.3); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 p = vMundoEst;
    float h = p.x + p.z * 0.83;
    float y = p.y + 0.035 * p.z;
    float b1 = -0.62 + 0.16 * (fbmEst(vec2(h * 0.35, 1.3)) - 0.5);
    float b2 = -1.55 + 0.45 * (fbmEst(vec2(h * 0.18, 7.1)) - 0.5);
    float b3 = -2.25 + 0.5 * (fbmEst(vec2(h * 0.22, 3.7)) - 0.5);
    float grano = fbmEst(vec2(h, y) * 6.0);
    vec3 humus = vec3(0.16, 0.11, 0.075) * (0.8 + 0.4 * grano);
    vec3 arcilla = mix(vec3(0.42, 0.29, 0.17), vec3(0.52, 0.37, 0.22), fbmEst(vec2(h, y * 3.0) * 1.7)) * (0.85 + 0.25 * grano);
    vec3 ripio = vec3(0.47, 0.42, 0.35) * (0.8 + 0.3 * grano);
    vec3 roca = mix(vec3(0.36, 0.35, 0.34), vec3(0.5, 0.48, 0.45), fbmEst(vec2(h * 0.6, y * 1.1)));
    // Bolones del ripio: celdas con una piedra redondeada clara y su sombra.
    vec2 q = vec2(h * 3.1, y * 5.3);
    vec2 c = floor(q);
    vec2 o = vec2(hashEst(c), hashEst(c + 3.1)) * 0.5 + 0.25;
    float d = length((fract(q) - o) * vec2(1.0, 1.4));
    float tam = 0.12 + 0.22 * hashEst(c + 5.9);
    float bolon = smoothstep(tam, tam - 0.08, d) * step(0.55, hashEst(c + 9.7));
    ripio = mix(ripio * (0.8 + 0.2 * smoothstep(tam + 0.1, tam, d)), vec3(0.58, 0.54, 0.48) * (0.8 + 0.3 * hashEst(c + 1.3)), bolon * 0.7);
    // Fracturas de la roca: líneas finas casi verticales y diaclasas oblicuas.
    float fractura = smoothstep(0.018, 0.0, abs(fbmEst(vec2(h * 0.7, y * 0.3)) - 0.5));
    fractura = max(fractura, smoothstep(0.012, 0.0, abs(fract((h * 0.25 + y * 0.6) + 0.4 * fbmEst(vec2(h, y) * 0.8)) - 0.5)) * 0.5);
    // Bloques de la roca: cada uno con su tono, como un macizo diaclasado.
    roca *= 0.88 + 0.24 * hashEst(floor(vec2(h * 0.7 + 0.4 * fbmEst(vec2(y, h) * 0.5), y * 1.4)));
    roca *= 1.0 - 0.35 * fractura;
    // Raíces: hilos claros que bajan del humus a la arcilla.
    float raiz = smoothstep(0.05, 0.0, abs(fract(h * 1.7 + 0.35 * sin(y * 7.0 + h)) - 0.5)) * step(0.55, hashEst(vec2(floor(h * 1.7), 2.0)));
    raiz *= smoothstep(b1 - 0.55, b1, y) * smoothstep(-0.25, -0.4, y);
    float t1 = smoothstep(b1 - 0.04, b1 + 0.04, y);
    float t2 = smoothstep(b2 - 0.05, b2 + 0.05, y);
    float t3 = smoothstep(b3 - 0.04, b3 + 0.04, y);
    vec3 estrato = mix(roca, mix(ripio, mix(arcilla, humus, t1), t2), t3);
    estrato = mix(estrato, vec3(0.55, 0.45, 0.33), raiz * 0.6);
    // Ocre más oscuro en la línea de cada contacto (humedad).
    estrato *= 1.0 - 0.18 * (smoothstep(0.12, 0.0, abs(y - b2)) + smoothstep(0.1, 0.0, abs(y - b3)));
    // Los colores de arriba están pensados en sRGB; el shader trabaja en lineal.
    diffuseColor.rgb = pow(estrato, vec3(2.2));
  }`,
      );
  };
  m.customProgramCacheKey = () => 'casa-estratos';
  return m;
}

const CREAR: Record<ClaveMaterial, () => Material> = {
  hormigon: () =>
    conMapas(estandar('#a9a7a2', 0.85), {
      color: new URL('./texturas/hormigon.webp', import.meta.url).href,
      rugosidad: new URL('./texturas/hormigon-rugosidad.webp', import.meta.url).href,
      metros: 2.4,
      tinte: '#d9d6d2',
    }),
  pulido: () =>
    conMapas(estandar('#9d9b97', 0.42), {
      color: new URL('./texturas/hormigon.webp', import.meta.url).href,
      metros: 3.2,
      tinte: '#cfcdc9',
    }),
  marmol: () => {
    const m = new MeshPhysicalMaterial({
      color: '#ece9e4',
      roughness: 0.2,
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
    });
    const veteado = marmolVeteado();
    if (veteado) {
      m.map = veteado;
      m.color.set('#d4cfc8');
    }
    return m;
  },
  travertino: () =>
    conMapas(estandar('#d6c9b1', 0.62), {
      color: new URL('./texturas/marmol.webp', import.meta.url).href,
      rugosidad: new URL('./texturas/marmol-rugosidad.webp', import.meta.url).href,
      metros: 2.4,
      tinte: '#fff8ee',
    }),
  nogal: () =>
    conMapas(estandar('#6b4630', 0.55), {
      color: new URL('./texturas/nogal.webp', import.meta.url).href,
      rugosidad: new URL('./texturas/nogal-rugosidad.webp', import.meta.url).href,
      metros: 1.6,
      tinte: '#d58b5c',
    }),
  parquet: () =>
    conMapas(estandar('#9a6e45', 0.5), {
      color: new URL('./texturas/parquet.webp', import.meta.url).href,
      rugosidad: new URL('./texturas/parquet-rugosidad.webp', import.meta.url).href,
      metros: 2,
      tinte: '#f2e2cf',
    }),
  fieltro: () => estandar('#2e3136', 0.95),
  vidrio: () =>
    new MeshPhysicalMaterial({
      color: '#c4dadc',
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: DoubleSide,
      envMapIntensity: 1.4,
    }),
  acero: () => estandar('#1d1f22', 0.4, 0.8),
  laton: () => estandar('#b08d57', 0.35, 1),
  led: () => new MeshBasicMaterial({ color: '#ffd29a' }),
  roca: () => estratos('#6f6a62'),
  tierra: () => estratos('#4d3b2c'),
  cesped: () => estandar('#66743f', 1),
  deck: () =>
    conMapas(estandar('#8f7258', 0.7), {
      color: new URL('./texturas/nogal.webp', import.meta.url).href,
      metros: 1.2,
      tinte: '#f2c79e',
    }),
  /** Cobre de la cúpula del observatorio (se ve por dentro y por fuera). */
  cobre: () => {
    const m = estandar('#b8734a', 0.32, 1);
    m.side = DoubleSide;
    return m;
  },
  /** Cuero coñac (sillones de Ventas). */
  cuero: () =>
    conMapas(estandar('#8a4b2a', 0.6), {
      color: new URL('./texturas/cuero.webp', import.meta.url).href,
      metros: 0.8,
      tinte: '#ffffff',
    }),
};

/**
 * Inyecta la oclusión barata de la casa (`oclusion.ts`) en un material PBR: el sol y la luna
 * solo llegan por las aberturas de cada piso y la luz del cielo baja hacia el fondo. Sin
 * mapas de sombra ni pases extra; con sombras reales se suman las dos.
 */
function conOclusion(m: Material): Material {
  if (!(m instanceof MeshStandardMaterial)) return m;
  conOclusionHechos.add(m);
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoOcl;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 mundoOcl = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
  mundoOcl = batchingMatrix * mundoOcl;
  #endif
  #ifdef USE_INSTANCING
  mundoOcl = instanceMatrix * mundoOcl;
  #endif
  vMundoOcl = ( modelMatrix * mundoOcl ).xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMundoOcl;\n${glslOclusion()}`)
      .replace(
        '#include <lights_fragment_begin>',
        ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          `getDirectionalLightInfo( directionalLight, directLight );
		directLight.color *= oclLuzDirecta( vMundoOcl, inverseTransformDirection( directionalLight.direction, viewMatrix ) );`,
        ),
      )
      .replace(
        '#include <lights_fragment_end>',
        `#if defined( RE_IndirectDiffuse )
  float cieloOcl = oclLuzCielo( vMundoOcl );
  irradiance *= cieloOcl;
  iblIrradiance *= cieloOcl;
#endif
#if defined( RE_IndirectSpecular )
  radiance *= oclLuzCielo( vMundoOcl );
#endif
#include <lights_fragment_end>`,
      );
  };
  // Con la casa tal como viene la clave no cambia nunca.
  m.customProgramCacheKey = () => `casa-oclusion-${versionPlano()}`;
  return m;
}

const conOclusionHechos = new Set<Material>();

/** Tras construir o demoler una sala: que los materiales lean los volúmenes nuevos. */
export function recompilarOclusion(): void {
  for (const m of conOclusionHechos) m.needsUpdate = true;
}

/** El terreno está siempre afuera y ya trae su propio shader (`estratos`). */
const SIN_OCLUSION = new Set<ClaveMaterial>(['roca', 'tierra']);

/**
 * Material compartido de la casa por clave (uno por clave en toda la escena). El mobiliario
 * los reusa: `materialCasa('nogal')`, `materialCasa('cuero')`, `materialCasa('laton')`…
 */
export const materialCasa = (clave: ClaveMaterial): Material =>
  material(`casa:${clave}`, () =>
    SIN_OCLUSION.has(clave) ? CREAR[clave]() : conOclusion(CREAR[clave]()),
  );

/** Ajusta el brillo de las tiras LED (color ámbar × intensidad); lo llama la luz por hora. */
export function encenderLed(color: Color, intensidad: number): void {
  const led = materialCasa('led') as MeshBasicMaterial;
  led.color.copy(color).multiplyScalar(0.6 + 2.6 * intensidad);
}
