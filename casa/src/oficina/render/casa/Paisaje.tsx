import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  MeshBasicMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Group } from 'three';
import { TERRENO } from './arquitectura';
import { sombrasExteriores } from './contacto';
import type { PaletaLuz, RGB } from './luz';

/**
 * El paisaje que rodea la casa en el cerro, en 360° (la cámara orbita libre):
 *
 * - **La ladera**: el cerro que baja desde el pie de la maqueta hacia el valle, más empinado
 *   hacia el frente (sur). Pasto seco dorado, matorral y afloramientos de roca en lo empinado,
 *   y perspectiva aérea con la distancia. Geometría fija (no sigue a la cámara).
 * - **El valle** muy abajo, con parcelas de día y la ciudad encendida de noche.
 * - **La cordillera** en tres cordones que rodean la casa (precordillera, cordón medio y los
 *   Andes al fondo): cada uno más alto, más lejano y más perdido en la neblina que el anterior;
 *   crestas irregulares sin repetición visible, laderas con quebradas que el sol marca y nieve
 *   en las cumbres según la pendiente. Los Andes son más altos al norte y al este; hacia el sur
 *   (el valle) quedan los cerros bajos de la costa.
 *
 * La cordillera de verdad está a decenas de kilómetros: subir la cámara no debería dejar ver
 * por encima de ella. Por eso el valle y la cordillera acompañan la altura de la cámara (sus
 * ángulos bajo el horizonte no cambian entre encuadres) y solo conservan el paralaje
 * horizontal de la órbita. Además, las sombras de contacto de afuera de la casa
 * (`contacto.ts`): el pie de los muros y el cielo de los vuelos. Seis draw calls; sin niebla.
 */

/** Altura de cámara para la que están diseñadas las alturas de abajo (encuadre apaisado). */
const ALTURA_DISENO = 16;

/** Altura del valle, muy por debajo del corte del terreno (y = -4). */
const VALLE_Y = -70;

interface Cordon {
  radio: number;
  /** Profundidad (m) de la falda, desde la cresta hacia la casa. */
  falda: number;
  /** Altura media de la cresta y su amplitud. */
  base: number;
  amplitud: number;
  semilla: number;
  /** Desde qué altura hay nieve (∞ si no tiene). */
  nieve: number;
  /** Cuánto se pierde en la neblina (0 = nítido, 1 = color del horizonte). */
  bruma: number;
}

/** Precordillera: cerros bajos y nítidos que se asoman por el vidrio de los pisos. */
const CERCA: Cordon = {
  radio: 175,
  falda: 55,
  base: -46,
  amplitud: 34,
  semilla: 4.1,
  nieve: Infinity,
  bruma: 0.06,
};
/** Cordón medio: más alto y azulado, con nieve solo en lo más alto. */
const MEDIA: Cordon = {
  radio: 265,
  falda: 70,
  base: -42,
  amplitud: 60,
  semilla: 2.7,
  nieve: 16,
  bruma: 0.3,
};
/** Los Andes: la pared nevada del fondo, sobre el techo de la casa. */
const LEJOS: Cordon = {
  radio: 390,
  falda: 90,
  base: -38,
  amplitud: 76,
  semilla: 1.3,
  nieve: 17,
  bruma: 0.42,
};

/**
 * Perfil de una cresta según el azimut (0 = norte, π/2 = este), en 0..1 aprox.: un macizo de
 * ondas suaves (los cordones y sus portezuelos) con crestas finas encima (pliegues de valor
 * absoluto de frecuencia alta, que dan cumbres irregulares y no triángulos). Todos los
 * armónicos son enteros: el perfil es periódico y no tiene costura al dar la vuelta. Una
 * envolvente lo sube hacia el norte y el este, donde están los Andes.
 */
export function cresta(a: number, semilla: number): number {
  const pliegue = (k: number, fase: number) => 1 - Math.abs(Math.sin(k * a + fase));
  const macizo =
    0.5 +
    0.22 * Math.sin(2 * a + semilla) +
    0.14 * Math.sin(5 * a + semilla * 2.1) +
    0.09 * Math.sin(9 * a + semilla * 3.3);
  const cumbres =
    0.11 * pliegue(17, semilla * 1.7) +
    0.07 * pliegue(37, semilla * 5.3) +
    0.04 * pliegue(71, semilla * 1.9) +
    0.02 * Math.sin(151 * a + semilla * 4.4);
  const envolvente = 0.5 + 0.5 * (0.5 + 0.5 * Math.cos(a - 0.6));
  return (0.78 * macizo + cumbres) * envolvente;
}

/** Ruido por valor 2D determinista (para el relieve de las faldas), en 0..1. */
function ruido2(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * ux;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * ux;
  return a + (b - a) * uy;
}

/** Filas de la falda, de la cresta (0) al pie (1). */
const FILAS = 12;

/**
 * Un cordón en anillo completo: la cresta y la falda que baja hacia el valle. El relieve de la
 * falda (espolones y quebradas) sale de un ruido 2D que serpentea con la altura, así el sol
 * marca laderas ramificadas y no franjas paralelas.
 */
function geometriaCordon(c: Cordon): BufferGeometry {
  const muestras = 900;
  const posiciones: number[] = [];
  for (let i = 0; i <= muestras; i++) {
    // La última columna repite la primera (a = 2π ≡ 0): el ruido usa el índice envuelto.
    const a = (Math.PI * 2 * i) / muestras;
    const u = (i % muestras) / muestras;
    const h = c.base + c.amplitud * cresta(a, c.semilla);
    for (let k = 0; k < FILAS; k++) {
      const prof = k / (FILAS - 1);
      const caida = Math.pow(1 - prof, 1.6);
      // Quebradas que serpentean: el ruido se desplaza en el azimut a medida que baja.
      const n =
        ruido2(u * 45 + 2 * ruido2(u * 9, prof * 3 + c.semilla), prof * 7 + c.semilla) * 0.7 +
        ruido2(u * 90, prof * 13 + c.semilla * 2) * 0.3 -
        0.5;
      const relieve = k === 0 ? 0 : n * Math.sin(Math.PI * Math.min(1, prof * 1.3));
      const r = c.radio - c.falda * prof + relieve * c.falda * 0.14;
      const y = VALLE_Y + (h - VALLE_Y) * caida + relieve * c.amplitud * 0.04;
      posiciones.push(Math.sin(a) * r, y, -Math.cos(a) * r);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < muestras; i++) {
    for (let k = 0; k < FILAS - 1; k++) {
      const a = i * FILAS + k;
      const b = a + FILAS;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Distancias (m) de los anillos de la ladera, desde el borde de la maqueta hacia afuera. */
const ANILLOS = [-0.8, 0, 1.2, 3, 6, 11, 18, 28, 42, 62, 90, 130, 185, 260, 360];
const LADOS_LADERA = 192;
/** Centro de la maqueta en planta y su medio ancho y medio fondo. */
const MAQUETA = {
  cx: (TERRENO.x0 + TERRENO.x1) / 2,
  cz: (TERRENO.z0 + TERRENO.z1) / 2,
  hx: (TERRENO.x1 - TERRENO.x0) / 2,
  hz: (TERRENO.z1 - TERRENO.z0) / 2,
};

/**
 * Altura de la ladera a `d` metros del pie de la maqueta, mirando en la dirección `(dx, dz)`
 * (unitaria): cae más rápido hacia el frente (+z, el valle) que hacia el fondo.
 */
export function alturaLadera(d: number, dx: number, dz: number): number {
  if (d <= 0) return TERRENO.fondo + 0.1;
  const frente = Math.max(0, dz);
  const pendiente = 0.2 + 0.32 * frente + 0.06 * Math.abs(dx);
  // Lomas, y quebradas que bajan por la ladera (crecen con la distancia al pie).
  const t = Math.atan2(dx, dz);
  const ondula =
    Math.min(1, d / 25) *
      (2.2 * Math.sin(dx * 5.3 + dz * 2.1 + d * 0.045) +
        1.4 * Math.sin(dx * 11.7 - dz * 7.3 + d * 0.11)) +
    Math.min(1, d / 40) *
      d *
      0.06 *
      (Math.sin(t * 9 + d * 0.012) + 0.5 * Math.sin(t * 23 - d * 0.02));
  return TERRENO.fondo - pendiente * d - 0.0018 * d * d * (1 + frente) + ondula;
}

/** El cerro bajo la maqueta: un faldón en anillo, del pie de la maqueta hasta el valle. */
function geometriaLadera(): BufferGeometry {
  const posiciones: number[] = [];
  for (let i = 0; i <= LADOS_LADERA; i++) {
    const t = (Math.PI * 2 * i) / LADOS_LADERA;
    const dx = Math.sin(t);
    const dz = Math.cos(t);
    // Borde de la maqueta en esa dirección (rayo desde el centro contra el rectángulo).
    const borde = Math.min(
      Math.abs(dx) > 1e-6 ? MAQUETA.hx / Math.abs(dx) : Infinity,
      Math.abs(dz) > 1e-6 ? MAQUETA.hz / Math.abs(dz) : Infinity,
    );
    for (const d of ANILLOS) {
      const r = borde + d;
      posiciones.push(MAQUETA.cx + dx * r, alturaLadera(d, dx, dz), MAQUETA.cz + dz * r);
    }
  }
  const n = ANILLOS.length;
  const indices: number[] = [];
  for (let i = 0; i < LADOS_LADERA; i++) {
    for (let k = 0; k < n - 1; k++) {
      const a = i * n + k;
      const b = a + n;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Las sombras de contacto de afuera (`contacto.ts`) fusionadas en una malla. */
function geometriaContacto(): BufferGeometry {
  const posiciones: number[] = [];
  const colores: number[] = [];
  for (const { esquinas, alfa } of sombrasExteriores()) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      posiciones.push(...(esquinas[i] as [number, number, number]));
      colores.push(0, 0, 0, alfa[i] as number);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
  g.setAttribute('color', new Float32BufferAttribute(colores, 4));
  return g;
}

const VERTICE = /* glsl */ `
varying vec3 vMundo;
varying vec3 vNormal;
varying float vAltura;
void main() {
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  vAltura = position.y;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const RUIDO = /* glsl */ `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ruido(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * ruido(p) + 0.25 * ruido(p * 2.03) + 0.125 * ruido(p * 4.1) + 0.0625 * ruido(p * 8.3); }
`;

/** Luz común del paisaje: sol, luna y un relleno del cielo frío arriba y cálido abajo. */
const LUZ = /* glsl */ `
uniform vec3 uSolDir;
uniform vec3 uSolColor;
uniform float uSol;
uniform vec3 uLunaDir;
uniform vec3 uLunaColor;
uniform float uLuna;
uniform vec3 uRellenoCielo;
uniform vec3 uRellenoSuelo;
uniform float uRelleno;
vec3 iluminar(vec3 n) {
  vec3 relleno = mix(uRellenoSuelo, uRellenoCielo, 0.5 + 0.5 * n.y) * uRelleno;
  vec3 sol = uSolColor * max(dot(n, uSolDir), 0.0) * uSol;
  vec3 luna = uLunaColor * max(dot(n, uLunaDir), 0.0) * uLuna;
  return relleno + sol + luna;
}
`;

const FRAGMENTO_CORDON = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uNiebla;
uniform float uBruma;
uniform float uCima;
uniform float uNieve;
uniform vec3 uBlanco;
varying vec3 vMundo;
varying vec3 vNormal;
varying float vAltura;
${RUIDO}
${LUZ}
void main() {
  vec3 n = normalize(vNormal);
  float altura = clamp((vAltura - ${VALLE_Y.toFixed(1)}) / (uCima - ${VALLE_Y.toFixed(1)}), 0.0, 1.0);
  float az = atan(vMundo.x, -vMundo.z);
  // Roca con vetas y matorral en lo bajo; la luz marca quebradas y espolones.
  float veta = fbm(vec2(az * 30.0, vAltura * 0.3));
  vec3 base = uColor * (0.8 + 0.4 * veta);
  vec3 color = base * iluminar(n);
  // Nieve: sobre la línea de nieve y en lo que no es demasiado empinado; jirones con ruido.
  float linea = uNieve + 12.0 * (fbm(vec2(az * 22.0, vAltura * 0.04)) - 0.5);
  float nieve = smoothstep(linea - 3.0, linea + 6.0, vAltura) * smoothstep(-0.1, 0.35, n.y + 0.2 * veta);
  color = mix(color, uBlanco * (0.55 + 0.6 * iluminar(n)), nieve);
  // Perspectiva aérea: cada cordón más perdido en la neblina, y la falda más que la cresta.
  float bruma = clamp(uBruma + (1.0 - uBruma) * 0.55 * pow(1.0 - altura, 2.0), 0.0, 1.0);
  color = mix(color, uNiebla, bruma);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const FRAGMENTO_LADERA = /* glsl */ `
uniform vec3 uNiebla;
uniform vec3 uPasto;
uniform vec3 uMatorral;
uniform vec3 uRoca;
varying vec3 vMundo;
varying vec3 vNormal;
${RUIDO}
${LUZ}
void main() {
  vec3 n = normalize(vNormal);
  vec2 p = vMundo.xz;
  // Pasto seco con manchas de matorral (espinos) y roca donde la ladera se empina.
  float manchas = fbm(p * 0.07);
  // Espinos sueltos: manchas oscuras redondeadas, más densas en las quebradas.
  vec2 celda = floor(p / 1.3);
  vec2 centro = (celda + 0.2 + 0.6 * vec2(hash(celda), hash(celda + 4.7))) * 1.3;
  float radio = 0.2 + 0.35 * hash(celda + 8.3);
  float espino = smoothstep(radio, radio * 0.5, length(p - centro)) * step(0.7 - 0.3 * manchas, hash(celda + 1.9));
  float matorral = max(smoothstep(0.56, 0.7, fbm(p * 0.11 + 3.1)) * 0.6, espino);
  float empinado = smoothstep(0.74, 0.56, n.y + 0.12 * (manchas - 0.5));
  vec3 albedo = uPasto * (0.75 + 0.45 * manchas) * (0.9 + 0.2 * ruido(p * 3.1));
  albedo = mix(albedo, uMatorral * (0.75 + 0.5 * ruido(p * 1.3)), matorral * 0.9);
  albedo = mix(albedo, uRoca * (0.8 + 0.4 * fbm(p * 0.6)), empinado);
  vec3 color = albedo * iluminar(n);
  // Perspectiva aérea: la ladera se funde con el valle a lo lejos.
  float d = length(vMundo - cameraPosition);
  color = mix(color, uNiebla, smoothstep(120.0, 700.0, d) * 0.85);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const FRAGMENTO_VALLE = /* glsl */ `
uniform vec3 uValle;
uniform vec3 uNiebla;
uniform float uNoche;
varying vec3 vMundo;
varying vec3 vNormal;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  float d = length(vMundo.xz - cameraPosition.xz);
  // Parcelas, viñas y bosquetes: manchas por celda.
  vec2 celda = floor(vMundo.xz / vec2(17.0, 29.0) + vec2(0.0, floor(vMundo.x / 17.0) * 0.37));
  vec3 color = uValle * (0.84 + 0.22 * hash(celda) + 0.06 * hash(floor(vMundo.xz / 5.0)));
  // De noche, la ciudad en el valle: puntos cálidos dispersos.
  vec2 lote = vMundo.xz / 5.0;
  vec2 id = floor(lote);
  float luz = step(0.88, hash(id + 0.5)) * smoothstep(0.09, 0.0, length(fract(lote) - 0.5));
  color += vec3(1.0, 0.7, 0.4) * luz * uNoche * (1.2 + hash(id) * 1.5);
  color = mix(color, uNiebla, smoothstep(140.0, 590.0, d));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const lineal = (c: RGB, destino: Color) => destino.setRGB(c.r, c.g, c.b, SRGBColorSpace);

const uniformsLuz = () => ({
  uSolDir: { value: new Vector3() },
  uSolColor: { value: new Color() },
  uSol: { value: 0 },
  uLunaDir: { value: new Vector3() },
  uLunaColor: { value: new Color() },
  uLuna: { value: 0 },
  uRellenoCielo: { value: new Color() },
  uRellenoSuelo: { value: new Color() },
  uRelleno: { value: 0 },
});

function materialCordon(c: Cordon) {
  return new ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO_CORDON,
    toneMapped: false,
    uniforms: {
      ...uniformsLuz(),
      uColor: { value: new Color() },
      uNiebla: { value: new Color() },
      uBruma: { value: c.bruma },
      uCima: { value: c.base + c.amplitud },
      uNieve: { value: c.nieve === Infinity ? 1e6 : c.nieve },
      uBlanco: { value: new Color() },
    },
  });
}

/** Fija la luz del paisaje (sin tone mapping: en escala de la paleta, que ya es de pantalla). */
function fijarLuz(m: ShaderMaterial, paleta: PaletaLuz) {
  const u = m.uniforms;
  const { sol, luna, hemisferio } = paleta;
  (u.uSolDir?.value as Vector3).set(sol.direccion.x, sol.direccion.y, sol.direccion.z);
  lineal(sol.color, u.uSolColor?.value);
  if (u.uSol) u.uSol.value = 0.5 * sol.intensidad;
  (u.uLunaDir?.value as Vector3).set(luna.direccion.x, luna.direccion.y, luna.direccion.z);
  lineal(luna.color, u.uLunaColor?.value);
  if (u.uLuna) u.uLuna.value = 0.9 * luna.intensidad;
  lineal(hemisferio.cielo, u.uRellenoCielo?.value);
  lineal(hemisferio.suelo, u.uRellenoSuelo?.value);
  if (u.uRelleno) u.uRelleno.value = 0.25 + 0.75 * hemisferio.intensidad;
}

interface Props {
  paleta: PaletaLuz;
}

/** Ladera, valle y cordillera alrededor de la casa (ver el comentario del módulo). */
export function Paisaje({ paleta }: Props) {
  const grupo = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (grupo.current) grupo.current.position.y = camera.position.y - ALTURA_DISENO;
  });
  const recursos = useMemo(() => {
    const valle = new CircleGeometry(900, 48);
    valle.rotateX(-Math.PI / 2);
    valle.translate(0, VALLE_Y, 0);
    return {
      geometrias: {
        valle,
        ladera: geometriaLadera(),
        contacto: geometriaContacto(),
        cerca: geometriaCordon(CERCA),
        media: geometriaCordon(MEDIA),
        lejos: geometriaCordon(LEJOS),
      },
      materiales: {
        valle: new ShaderMaterial({
          vertexShader: VERTICE,
          fragmentShader: FRAGMENTO_VALLE,
          toneMapped: false,
          uniforms: {
            uValle: { value: new Color() },
            uNiebla: { value: new Color() },
            uNoche: { value: 0 },
          },
        }),
        ladera: new ShaderMaterial({
          vertexShader: VERTICE,
          fragmentShader: FRAGMENTO_LADERA,
          toneMapped: false,
          uniforms: {
            ...uniformsLuz(),
            uNiebla: { value: new Color() },
            uPasto: { value: new Color().setRGB(0.5, 0.46, 0.29, SRGBColorSpace) },
            uMatorral: { value: new Color().setRGB(0.2, 0.25, 0.15, SRGBColorSpace) },
            uRoca: { value: new Color().setRGB(0.46, 0.4, 0.33, SRGBColorSpace) },
          },
        }),
        contacto: new MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
        cerca: materialCordon(CERCA),
        media: materialCordon(MEDIA),
        lejos: materialCordon(LEJOS),
      },
    };
  }, []);
  useLayoutEffect(
    () => () => {
      for (const g of Object.values(recursos.geometrias)) g.dispose();
      for (const m of Object.values(recursos.materiales)) m.dispose();
    },
    [recursos],
  );

  useLayoutEffect(() => {
    const { valle, ladera, cerca, media, lejos } = recursos.materiales;
    const niebla = paleta.cielo.horizonte;
    lineal(paleta.cielo.valle, valle.uniforms.uValle?.value);
    lineal(niebla, valle.uniforms.uNiebla?.value);
    if (valle.uniforms.uNoche) valle.uniforms.uNoche.value = paleta.estrellas;
    fijarLuz(ladera, paleta);
    lineal(niebla, ladera.uniforms.uNiebla?.value);
    // El cordón medio toma el tono entre el cercano y el lejano.
    const medio: RGB = {
      r: (paleta.montanas.cerca.r + paleta.montanas.lejos.r) / 2,
      g: (paleta.montanas.cerca.g + paleta.montanas.lejos.g) / 2,
      b: (paleta.montanas.cerca.b + paleta.montanas.lejos.b) / 2,
    };
    const pares = [
      [cerca, paleta.montanas.cerca],
      [media, medio],
      [lejos, paleta.montanas.lejos],
    ] as const;
    // Nieve: blanca de día, rosada al atardecer (arrebol), azulada de noche.
    const arrebol = new Color().setRGB(1, 0.72, 0.66, SRGBColorSpace);
    for (const [m, color] of pares) {
      const u = m.uniforms;
      fijarLuz(m, paleta);
      lineal(color, u.uColor?.value);
      lineal(niebla, u.uNiebla?.value);
      const blanco = u.uBlanco?.value as Color;
      blanco.setRGB(0.92, 0.95, 1, SRGBColorSpace);
      blanco.lerp(arrebol, paleta.dorado * 0.8).multiplyScalar(0.16 + 0.84 * paleta.factor);
    }
  }, [recursos, paleta]);

  const { geometrias, materiales } = recursos;
  return (
    <>
      <mesh geometry={geometrias.ladera} material={materiales.ladera} matrixAutoUpdate={false} />
      <mesh
        geometry={geometrias.contacto}
        material={materiales.contacto}
        renderOrder={1}
        matrixAutoUpdate={false}
      />
      <group ref={grupo}>
        <mesh
          geometry={geometrias.valle}
          material={materiales.valle}
          renderOrder={-900}
          matrixAutoUpdate={false}
        />
        <mesh
          geometry={geometrias.lejos}
          material={materiales.lejos}
          renderOrder={-899}
          matrixAutoUpdate={false}
        />
        <mesh
          geometry={geometrias.media}
          material={materiales.media}
          renderOrder={-898}
          matrixAutoUpdate={false}
        />
        <mesh
          geometry={geometrias.cerca}
          material={materiales.cerca}
          renderOrder={-897}
          matrixAutoUpdate={false}
        />
      </group>
    </>
  );
}
