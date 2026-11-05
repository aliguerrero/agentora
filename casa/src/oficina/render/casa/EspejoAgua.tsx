import { useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { ESPESOR_LOSA, NIVEL_Y, plano } from '../../mansion/plano';
import { flotacionJules, RADIO_NUCLEO } from '../Jules';
import type { PaletaLuz } from './luz';

/** Ancho del borde de mármol que enmarca el agua (lo dibuja `Casa`). */
export const BORDE_ESPEJO = 0.12;
/** El agua queda 12 mm bajo el canto de mármol. */
const BAJO_CANTO = 0.012;
/** Cielo del atrio de doble altura: la losa del tercer piso, con sus tiras LED. */
const CIELO_ATRIO = NIVEL_Y.piso3 - ESPESOR_LOSA;
/** Planos que encierran el atrio: muro cortina del fondo, corte del frente y muros laterales. */
const FONDO_ATRIO = -4.1;
const FRENTE_ATRIO = 4;
const MURO_ATRIO = 4;

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
uniform vec3 uJules;
uniform float uRadio;
uniform vec3 uNucleo;
uniform vec3 uLed;
uniform vec3 uHorizonte;
uniform vec3 uCenit;
uniform vec3 uCerro;
varying vec3 vMundo;

/** Afuera, visto por el vidrio o por el corte: el cerro abajo, el cielo arriba. */
vec3 afuera(vec3 h, vec3 r) {
  vec3 cielo = mix(uHorizonte, uCenit, pow(clamp(r.y, 0.0, 1.0), 0.5));
  return mix(uCerro, cielo, smoothstep(0.4, 2.2, h.y));
}

/**
 * Lo que ve el agua en la dirección r: el muro cortina del fondo (con montantes), el corte
 * abierto del frente, los muros del atrio o su cielo de nogal con tiras LED, lo que esté más
 * cerca. Así el reflejo funciona desde cualquier lado de la órbita.
 */
vec3 reflejado(vec3 p, vec3 r) {
  float tFondo = r.z < -1e-4 ? (${FONDO_ATRIO.toFixed(2)} - p.z) / r.z : 1e9;
  float tFrente = r.z > 1e-4 ? (${FRENTE_ATRIO.toFixed(2)} - p.z) / r.z : 1e9;
  float tMuro = abs(r.x) > 1e-4 ? ((r.x > 0.0 ? ${MURO_ATRIO.toFixed(2)} : -${MURO_ATRIO.toFixed(2)}) - p.x) / r.x : 1e9;
  float tCielo = r.y > 1e-4 ? (${CIELO_ATRIO.toFixed(2)} - p.y) / r.y : 1e9;
  float t = min(min(tFondo, tFrente), min(tMuro, tCielo));
  vec3 h = p + r * t;
  if (t == tCielo) {
    float led = smoothstep(0.03, 0.0, abs(fract(h.z / 1.2) - 0.5) - 0.46);
    return vec3(0.02, 0.014, 0.01) + uLed * led * 0.25;
  }
  if (t == tMuro) return vec3(0.035, 0.034, 0.032) * (0.4 + 0.6 * length(uHorizonte));
  vec3 fuera = afuera(h, r);
  if (t == tFondo) {
    // Montantes de acero del muro cortina y la pasarela que lo cruza en el segundo piso.
    float montante = smoothstep(0.035, 0.0, abs(fract(h.x / 1.333) - 0.5) - 0.46);
    float pasarela = step(${(NIVEL_Y.piso2 - ESPESOR_LOSA).toFixed(2)}, h.y) * step(h.y, ${NIVEL_Y.piso2.toFixed(2)});
    fuera = mix(fuera * 0.85, vec3(0.012), max(montante, pasarela));
  }
  return fuera;
}

void main() {
  vec3 p = vMundo;
  float t = uTiempo;
  // Ondas leves: anillos lentos que nacen bajo Jules y un temblor fino de la superficie.
  vec2 dc = p.xz - uJules.xz;
  float rc = length(dc) + 1e-4;
  float anillo = sin(rc * 9.0 - t * 1.6) * exp(-rc * 0.6);
  vec2 g = (dc / rc) * anillo * 0.5 + 0.25 * vec2(sin(p.x * 13.0 + t * 1.3), cos(p.z * 11.0 - t * 1.1));
  vec3 n = normalize(vec3(-g.x * 0.012, 1.0, -g.y * 0.012));
  vec3 v = normalize(cameraPosition - p);
  float fresnel = 0.05 + 0.95 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);

  // Agua negra pulida: casi sin cuerpo; lo que se ve es su reflejo.
  vec3 color = vec3(0.003, 0.005, 0.006);
  vec3 visto = reflejado(p, r);
  // Reflejo del núcleo de Jules: su imagen bajo el agua, con halo, que tiembla con las ondas.
  vec3 aJ = uJules - p;
  float a = dot(aJ, r);
  float lejos = length(aJ - r * max(a, 0.0));
  float nucleo = smoothstep(uRadio * 1.05, uRadio * 0.7, lejos) * step(0.0, a);
  // El halo es ancho (unos 2,4 m): aunque el núcleo no se alcance a reflejar desde una
  // cámara baja, su resplandor sí tiñe el fondo del espejo.
  float halo = exp(-lejos * lejos / 11.5) * step(0.0, a);
  visto += uNucleo * (nucleo * 4.0 + halo * 0.45);
  color = mix(color, visto, fresnel);
  // Halo sobre la superficie: la luz del núcleo cae al agua y chispea con las ondas.
  float sobre = exp(-dot(dc, dc) / 1.4) / (1.0 + 0.08 * pow(uJules.y, 2.0));
  color += uNucleo * sobre * (0.05 + 0.2 * pow(0.5 + 0.5 * anillo, 10.0));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Props {
  paleta: PaletaLuz;
  /** Posición actual de Jules (la misma referencia que mueve `Jules`). */
  jules: Vector3;
  /** Escala de Jules en reposo (la misma que recibe `Jules`). */
  escalaJules: number;
  movimiento: number;
}

/**
 * Espejo de agua negro del atrio: agua pulida con leves ondas que nacen bajo Jules, el
 * reflejo de su núcleo (con halo) y del cielo del atrio con sus tiras LED, y un halo de luz
 * sobre la superficie. El borde de mármol es parte de la casa. Un shader, un draw call.
 */
export function EspejoAgua({ paleta, jules, escalaJules, movimiento }: Props) {
  const espejo = plano.muebles.find((m) => m.tipo === 'espejo-agua');
  const geometria = useMemo(() => {
    if (!espejo) return null;
    const g = new PlaneGeometry(espejo.ancho - 2 * BORDE_ESPEJO, espejo.fondo - 2 * BORDE_ESPEJO);
    g.rotateX(-Math.PI / 2);
    g.translate(espejo.x, espejo.y + espejo.alto - BAJO_CANTO, espejo.z);
    return g;
  }, [espejo]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader: FRAGMENTO,
        uniforms: {
          uTiempo: { value: 0 },
          uJules: { value: new Vector3() },
          uRadio: { value: RADIO_NUCLEO * escalaJules },
          uNucleo: { value: new Color().setRGB(1, 0.86, 0.62, SRGBColorSpace) },
          uLed: { value: new Color() },
          uHorizonte: { value: new Color() },
          uCenit: { value: new Color() },
          uCerro: { value: new Color() },
        },
      }),
    [espejo, escalaJules],
  );
  useLayoutEffect(
    () => () => {
      geometria?.dispose();
      material.dispose();
    },
    [geometria, material],
  );

  useLayoutEffect(() => {
    const u = material.uniforms;
    const { color, led } = paleta.interior;
    (u.uLed?.value as Color)
      .setRGB(color.r, color.g, color.b, SRGBColorSpace)
      .multiplyScalar(0.25 + 0.9 * led);
    const { horizonte, cenit } = paleta.cielo;
    (u.uHorizonte?.value as Color).setRGB(horizonte.r, horizonte.g, horizonte.b, SRGBColorSpace);
    (u.uCenit?.value as Color).setRGB(cenit.r, cenit.g, cenit.b, SRGBColorSpace);
    const cerro = paleta.montanas.cerca;
    (u.uCerro?.value as Color).setRGB(cerro.r, cerro.g, cerro.b, SRGBColorSpace);
  }, [material, paleta]);

  useFrame((estado, delta) => {
    const u = material.uniforms;
    if (u.uTiempo) u.uTiempo.value += Math.min(delta, 0.1) * (0.3 + 0.7 * movimiento);
    // El núcleo flota igual que en `Jules` (mismo reloj y misma amplitud).
    const flota = flotacionJules(estado.clock.elapsedTime, movimiento) * escalaJules;
    (u.uJules?.value as Vector3).set(jules.x, jules.y + flota, jules.z);
  });

  if (!geometria) return null;
  return <mesh geometry={geometria} material={material} matrixAutoUpdate={false} />;
}
