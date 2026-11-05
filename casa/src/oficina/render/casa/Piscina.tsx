import { useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NIVEL_Y, ESPESOR_LOSA, plano } from '../../mansion/plano';
import { HUELLA, TERRENO } from './arquitectura';
import type { PaletaLuz, RGB } from './luz';

/** La lámina va al ras de la terraza (piedra y deck en y = 0): sin escalón de tina. */
const Y_LAMINA = -0.012;
/** El borde infinito: la lámina termina aquí y se derrama al canal oculto. */
const Z_BORDE = TERRENO.z1 - 0.16;
/** Canal de rebalse, justo bajo el borde, que el corte de la maqueta deja ver. */
const Y_CANAL = -0.11;
/** Cara superior del terreno bajo la piscina: el canal se ve en sección hasta aquí. */
const Y_TERRENO = -0.3;

/** Cajas de la casa que el agua refleja (pisos encendidos y losas), en el plano del corte. */
const PISOS = [NIVEL_Y.piso1, NIVEL_Y.piso2, NIVEL_Y.piso3]
  .map(
    (y, i, todos) =>
      `vec2(${y.toFixed(2)}, ${((todos[i + 1] ?? NIVEL_Y.torre) - ESPESOR_LOSA).toFixed(2)})`,
  )
  .join(', ');

const VERTICE = /* glsl */ `
varying vec3 vMundo;
void main() {
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENTO = /* glsl */ `
uniform float uTiempo;
uniform vec3 uCenit;
uniform vec3 uHorizonte;
uniform vec3 uFondo;
uniform vec3 uSolDir;
uniform vec3 uSolColor;
uniform float uSol;
uniform vec3 uCalido;
uniform float uLuces;
uniform float uCasa;
uniform float uDia;
uniform vec4 uBorde; // x0, x1, z0, z1 de la lámina
varying vec3 vMundo;

const vec2 PISOS[3] = vec2[3](${PISOS});
const float FACHADA_Z = ${HUELLA.z1.toFixed(2)};
const float CASA_X = ${HUELLA.x1.toFixed(2)};
const float TECHO = ${NIVEL_Y.torre.toFixed(2)};

/** Lo que el agua ve en la dirección r desde p: el cielo o la casa (pisos y losas). */
vec3 reflejo(vec3 p, vec3 r) {
  vec3 cielo = mix(uHorizonte, uCenit, pow(clamp(r.y, 0.0, 1.0), 0.45));
  if (r.z > -0.02) return cielo;
  float t = (FACHADA_Z - p.z) / r.z;
  vec3 h = p + r * t;
  if (abs(h.x) > CASA_X || h.y > TECHO + 0.3) return cielo;
  // Por defecto, el canto de las losas: hormigón asoleado de día, oscuro de noche.
  vec3 casa = vec3(0.32, 0.31, 0.29) * (0.08 + 0.92 * uDia);
  for (int i = 0; i < 3; i++) {
    if (h.y > PISOS[i].x + 0.05 && h.y < PISOS[i].y - 0.05) {
      // Interior: penumbra de día; de noche, ámbar encendido con lámparas por tramo.
      float tramo = 0.65 + 0.35 * sin(h.x * 0.9 + float(i) * 1.7);
      vec3 dia = vec3(0.07, 0.06, 0.05);
      vec3 noche = uCalido * (0.15 + 0.45 * tramo) * uCasa;
      casa = dia * uDia + noche * (1.0 - 0.7 * uDia);
    }
  }
  return casa;
}

void main() {
  vec2 p = vMundo.xz;
  float t = uTiempo;
  // Ondas suaves: suma de senos cruzados (sin texturas).
  vec2 g = vec2(
    0.6 * cos(p.x * 1.9 + t * 1.1) + 0.35 * cos((p.x + p.y) * 3.7 + t * 1.7) + 0.2 * cos(p.x * 7.1 - p.y * 2.3 + t * 2.3),
    0.6 * cos(p.y * 2.3 - t * 0.9) + 0.35 * cos((p.x - p.y) * 3.1 + t * 1.3) + 0.2 * cos(p.y * 6.7 + p.x * 1.9 - t * 2.1)
  );
  vec3 v = normalize(cameraPosition - vMundo);

  // Rebalse (cortina y canal bajo el borde): agua revuelta, oscura y con espuma.
  if (vMundo.y < ${(Y_LAMINA - 0.01).toFixed(3)}) {
    float hilos = 0.5 + 0.5 * sin(p.x * 31.0 + 2.0 * sin(p.x * 2.3 + t * 0.7));
    float corre = 0.5 + 0.5 * sin(vMundo.y * 60.0 + t * 7.0 + hilos * 2.0);
    vec3 cortina = uFondo * 0.45 + mix(uHorizonte, uCalido, uLuces * 0.5) * hilos * corre * 0.06;
    gl_FragColor = vec4(cortina, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  vec3 n = normalize(vec3(-g.x * 0.03, 1.0, -g.y * 0.03));
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);

  // Profundidad aparente: somera junto a los bordes y más honda hacia el lado oeste.
  float borde = min(min(p.x - uBorde.x, uBorde.y - p.x), min(p.y - uBorde.z, uBorde.w - p.y));
  float hondo = smoothstep(0.0, 1.4, borde) * (0.7 + 0.3 * smoothstep(uBorde.y, uBorde.x, p.x));
  vec3 somero = mix(uFondo * 1.8, vec3(0.03, 0.3, 0.33), 0.65 * uDia);
  vec3 cuerpo = mix(somero, uFondo, hondo);

  // Cáusticas: una red de líneas que se cruzan (dos campos de senos deformados).
  vec2 q = p * 2.3 + g * 0.2;
  float c1 = abs(sin(q.x * 3.1 + t * 0.7 + 1.3 * sin(q.y * 2.3 + t * 0.5)));
  float c2 = abs(sin(q.y * 3.7 - t * 0.6 + 1.3 * sin(q.x * 2.9 - t * 0.4)));
  float causticas = pow(1.0 - min(c1, c2), 12.0);
  cuerpo += vec3(0.5, 0.8, 0.75) * causticas * (1.0 - 0.7 * hondo) * (0.1 * uSol + 0.08 * uLuces);

  // Focos subacuáticos cálidos en el muro del lado de la casa, cada 3 m.
  float xf = (floor(p.x / 3.0) + 0.5) * 3.0;
  float foco = exp(-pow(p.x - xf, 2.0) * 0.5 - pow(p.y - uBorde.z, 2.0) * 0.35);
  cuerpo += (vec3(0.005, 0.06, 0.07) * (1.0 - 0.5 * hondo) + (uCalido * 0.35 + vec3(0.02, 0.2, 0.22)) * foco) * uLuces;

  vec3 color = mix(cuerpo, reflejo(vMundo + vec3(g.x, 0.0, g.y) * 0.05, r), fresnel);
  // Brillo del sol: un destello nítido y un halo más ancho.
  float alSol = max(dot(r, uSolDir), 0.0);
  color += uSolColor * (pow(alSol, 400.0) * 4.0 + pow(alSol, 40.0) * 0.12) * uSol;
  // El labio del borde infinito atrapa la luz: una línea fina donde el agua se va.
  float labio = smoothstep(0.06, 0.0, uBorde.w - p.y);
  color = mix(color, uHorizonte * 0.9 + uCalido * 0.1 * uLuces, labio * 0.45);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const lineal = (c: RGB, destino: Color) => destino.setRGB(c.r, c.g, c.b, SRGBColorSpace);

/** Lámina al ras hasta el borde infinito, la cortina que cae y el canal oculto. */
function laminas() {
  const { piscina } = plano;
  const lamina = (z0: number, z1: number, y: number) => {
    const g = new PlaneGeometry(piscina.x1 - piscina.x0, z1 - z0, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate((piscina.x0 + piscina.x1) / 2, y, (z0 + z1) / 2);
    return g;
  };
  const caida = new PlaneGeometry(piscina.x1 - piscina.x0, Y_LAMINA - Y_CANAL);
  caida.translate((piscina.x0 + piscina.x1) / 2, (Y_LAMINA + Y_CANAL) / 2, Z_BORDE);
  // El canal cortado por la maqueta: su agua en sección, del canal al terreno.
  const seccion = new PlaneGeometry(piscina.x1 - piscina.x0, Y_CANAL - Y_TERRENO);
  seccion.translate((piscina.x0 + piscina.x1) / 2, (Y_CANAL + Y_TERRENO) / 2, TERRENO.z1);
  const partes = [
    lamina(piscina.z0, Z_BORDE, Y_LAMINA),
    lamina(Z_BORDE, TERRENO.z1, Y_CANAL),
    caida,
    seccion,
  ];
  const fusion = mergeGeometries(partes);
  for (const p of partes) p.dispose();
  if (!fusion) throw new Error('No se pudo armar la lámina de la piscina');
  return fusion;
}

interface Props {
  paleta: PaletaLuz;
  movimiento: number;
}

/**
 * Piscina infinita: la lámina va al ras de la terraza y su borde frontal no tiene
 * coronamiento; el agua se derrama a un canal oculto bajo el borde. Color hondo (petróleo al
 * centro, turquesa en lo somero), reflejo por Fresnel del cielo y de la propia casa (sus pisos
 * encendidos de noche, calculados en el shader contra el plano de la fachada), brillo del sol,
 * cáusticas animadas y focos subacuáticos cálidos de noche. Un shader propio, un draw call.
 */
export function Piscina({ paleta, movimiento }: Props) {
  const geometria = useMemo(laminas, []);
  const material = useMemo(() => {
    const { piscina } = plano;
    return new ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      uniforms: {
        uTiempo: { value: 0 },
        uCenit: { value: new Color() },
        uHorizonte: { value: new Color() },
        uFondo: { value: new Color() },
        uSolDir: { value: new Vector3() },
        uSolColor: { value: new Color() },
        uSol: { value: 0 },
        uCalido: { value: new Color() },
        uLuces: { value: 0 },
        uCasa: { value: 0 },
        uDia: { value: 0 },
        uBorde: { value: [piscina.x0, piscina.x1, piscina.z0, Z_BORDE] },
      },
    });
  }, []);
  useLayoutEffect(
    () => () => {
      geometria.dispose();
      material.dispose();
    },
    [geometria, material],
  );

  useLayoutEffect(() => {
    const u = material.uniforms;
    lineal(paleta.cielo.cenit, u.uCenit?.value);
    lineal(paleta.cielo.horizonte, u.uHorizonte?.value);
    lineal(paleta.agua.fondo, u.uFondo?.value);
    lineal(paleta.sol.color, u.uSolColor?.value);
    lineal(paleta.interior.color, u.uCalido?.value);
    const d = paleta.sol.direccion;
    (u.uSolDir?.value as Vector3).set(d.x, d.y, d.z);
    if (u.uSol) u.uSol.value = Math.min(1, paleta.sol.intensidad);
    if (u.uLuces) u.uLuces.value = paleta.agua.luces;
    if (u.uCasa) u.uCasa.value = paleta.interior.charcos;
    if (u.uDia) u.uDia.value = paleta.factor;
  }, [material, paleta]);

  useFrame((_, delta) => {
    const tiempo = material.uniforms.uTiempo;
    if (tiempo) tiempo.value += Math.min(delta, 0.1) * (0.25 + 0.75 * movimiento);
  });

  return <mesh geometry={geometria} material={material} matrixAutoUpdate={false} />;
}
