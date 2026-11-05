import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { Mesh } from 'three';
import type { PaletaLuz, RGB } from './luz';
import { Paisaje } from './Paisaje';

const VERTICE = /* glsl */ `
varying vec3 vDireccion;
void main() {
  vDireccion = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Siempre al fondo, aunque la esfera quede más lejos que el plano lejano de la cámara.
  gl_Position = vec4(p.xy, p.w * 0.9999, p.w);
}
`;

const FRAGMENTO = /* glsl */ `
uniform vec3 uCenit;
uniform vec3 uHorizonte;
uniform vec3 uValle;
uniform vec3 uSolDir;
uniform vec3 uSolColor;
uniform float uSol;
uniform vec3 uLunaDir;
uniform float uLuna;
uniform float uEstrellas;
uniform float uDorado;
uniform float uTiempo;
varying vec3 vDireccion;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 d = normalize(vDireccion);
  float e = d.y;
  float az = atan(d.x, -d.z);

  // Cielo: degradado del horizonte al cénit, con el resplandor del sol y la luna.
  vec3 cielo = mix(uHorizonte, uCenit, pow(clamp(e, 0.0, 1.0), 0.5));
  float alSol = max(dot(d, uSolDir), 0.0);
  cielo += uSolColor * (pow(alSol, 6.0) * (0.25 + 0.45 * uDorado) + pow(alSol, 600.0) * 3.0) * uSol;
  cielo += uSolColor * uDorado * 0.18 * exp(-abs(e) * 9.0);
  float alLuna = max(dot(d, uLunaDir), 0.0);
  cielo += vec3(0.75, 0.82, 1.0) * (smoothstep(0.99935, 0.99955, alLuna) * 1.3 + pow(alLuna, 90.0) * 0.12) * uLuna;

  // Estrellas: una por celda, con brillo y titileo propios; se apagan cerca del horizonte.
  if (uEstrellas > 0.001 && e > 0.0) {
    vec2 rejilla = vec2(az * 60.0, e * 60.0);
    vec2 celda = floor(rejilla);
    vec2 centro = celda + 0.2 + 0.6 * vec2(hash(celda), hash(celda + 7.1));
    float brillo = pow(hash(celda + 3.3), 9.0);
    float dist = length(rejilla - centro);
    float titileo = 0.75 + 0.25 * sin(uTiempo * (1.5 + 3.0 * hash(celda + 1.7)) + hash(celda) * 6.28);
    cielo += vec3(0.85, 0.9, 1.0) * smoothstep(0.09, 0.0, dist) * brillo * 2.2 * titileo * uEstrellas * smoothstep(0.0, 0.15, e);
  }

  // Bajo el horizonte, neblina clara: tras la cresta de la cordillera se lee como cielo lejano.
  vec3 valle = mix(uHorizonte, uValle, 0.35 * smoothstep(0.0, 0.4, -e));
  vec3 color = e < 0.0 ? valle : cielo;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const lineal = (c: RGB, destino: Color) => destino.setRGB(c.r, c.g, c.b, SRGBColorSpace);

interface Props {
  paleta: PaletaLuz;
  /** Velocidad del titileo (0..1; menor con `prefers-reduced-motion`). */
  movimiento: number;
}

/**
 * Cielo de la casa: una esfera que sigue a la cámara (no la recorta el plano lejano, sin
 * niebla) con el degradado de la hora, sol y luna y estrellas, todo en un shader (un draw
 * call), más el valle y la cordillera en dos planos (`Paisaje`).
 */
export function Cielo({ paleta, movimiento }: Props) {
  const malla = useRef<Mesh>(null);
  const geometria = useMemo(() => new SphereGeometry(80, 48, 24), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader: FRAGMENTO,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uCenit: { value: new Color() },
          uHorizonte: { value: new Color() },
          uValle: { value: new Color() },
          uSolDir: { value: new Vector3() },
          uSolColor: { value: new Color() },
          uSol: { value: 0 },
          uLunaDir: { value: new Vector3() },
          uLuna: { value: 0 },
          uEstrellas: { value: 0 },
          uDorado: { value: 0 },
          uTiempo: { value: 0 },
        },
      }),
    [],
  );
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
    lineal(paleta.cielo.valle, u.uValle?.value);
    lineal(paleta.sol.color, u.uSolColor?.value);
    const { sol, luna } = paleta;
    (u.uSolDir?.value as Vector3).set(sol.direccion.x, sol.direccion.y, sol.direccion.z);
    (u.uLunaDir?.value as Vector3).set(luna.direccion.x, luna.direccion.y, luna.direccion.z);
    if (u.uSol) u.uSol.value = Math.min(1, sol.intensidad);
    if (u.uLuna) u.uLuna.value = Math.min(1, luna.intensidad / 0.45);
    if (u.uEstrellas) u.uEstrellas.value = paleta.estrellas;
    if (u.uDorado) u.uDorado.value = paleta.dorado;
  }, [material, paleta]);

  useFrame(({ camera }, delta) => {
    malla.current?.position.copy(camera.position);
    const tiempo = material.uniforms.uTiempo;
    if (tiempo) tiempo.value += delta * movimiento;
  });

  return (
    <>
      <mesh
        ref={malla}
        geometry={geometria}
        material={material}
        renderOrder={-1000}
        frustumCulled={false}
      />
      <Paisaje paleta={paleta} />
    </>
  );
}
