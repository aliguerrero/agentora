import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  TubeGeometry,
  Vector3,
} from 'three';
import type { InstancedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NIVEL_Y, plano } from '../../mansion/plano';
import { HUELLA, jardineras, TERRENO } from './arquitectura';

/** Pseudoazar determinista: el mismo jardín en cada carga. */
function crearAzar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

interface Planta {
  x: number;
  y: number;
  z: number;
  escala: number;
  giro: number;
}

// --- olivos ---

/** Tronco torcido con dos ramas, en tubos fusionados. */
function geometriaTronco(): BufferGeometry {
  const tubo = (puntos: [number, number, number][], radio: number) =>
    new TubeGeometry(
      new CatmullRomCurve3(puntos.map(([x, y, z]) => new Vector3(x, y, z))),
      10,
      radio,
      6,
      false,
    );
  const partes = [
    tubo(
      [
        [0, 0, 0],
        [0.12, 0.6, 0.05],
        [-0.08, 1.2, -0.04],
        [0.05, 1.75, 0.08],
      ],
      0.11,
    ),
    tubo(
      [
        [0.02, 1.3, 0],
        [0.45, 1.85, 0.2],
        [0.8, 2.2, 0.25],
      ],
      0.05,
    ),
    tubo(
      [
        [0, 1.45, 0],
        [-0.4, 1.95, -0.25],
        [-0.65, 2.3, -0.1],
      ],
      0.05,
    ),
  ];
  const fusion = mergeGeometries(partes.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of partes) p.dispose();
  if (!fusion) throw new Error('No se pudo armar el tronco del olivo');
  return fusion;
}

/** Copa: racimos irregulares (icosaedros deformados y aplanados), plateada y de caras planas. */
function geometriaCopa(): BufferGeometry {
  const azar = crearAzar(11);
  const racimos: [number, number, number, number][] = [
    [0.1, 2.25, 0.05, 0.85],
    [0.8, 2.35, 0.25, 0.6],
    [-0.65, 2.4, -0.15, 0.62],
    [0.25, 2.75, -0.3, 0.55],
    [-0.25, 2.7, 0.35, 0.5],
    [0.55, 2.05, -0.4, 0.45],
  ];
  const partes = racimos.map(([x, y, z, r]) => {
    const g = new IcosahedronGeometry(r, 1);
    const pos = g.getAttribute('position');
    // Deforma cada vértice según su dirección (el mismo vértice compartido se mueve igual).
    const desplazamiento = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const clave = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let k = desplazamiento.get(clave);
      if (k === undefined) {
        k = 0.72 + azar() * 0.5;
        desplazamiento.set(clave, k);
      }
      pos.setXYZ(i, pos.getX(i) * k * 1.15, pos.getY(i) * k * 0.62, pos.getZ(i) * k * 1.15);
    }
    g.translate(x, y, z);
    g.computeVertexNormals();
    return g;
  });
  const fusion = mergeGeometries(partes);
  for (const p of partes) p.dispose();
  if (!fusion) throw new Error('No se pudo armar la copa del olivo');
  return fusion;
}

// --- gramíneas ---

/** Mata de gramínea: hojas finas que se abren desde la base, del verde al pajizo en la punta. */
function geometriaGraminea(): BufferGeometry {
  const azar = crearAzar(29);
  const posiciones: number[] = [];
  const colores: number[] = [];
  const base = new Color('#4f5a33');
  const punta = new Color('#d8c48a');
  const HOJAS = 16;
  for (let i = 0; i < HOJAS; i++) {
    const a = (i / HOJAS) * Math.PI * 2 + azar() * 0.4;
    const inclinacion = 0.15 + azar() * 0.35;
    const alto = 0.55 + azar() * 0.45;
    const ancho = 0.018;
    const [cx, cz] = [Math.cos(a), Math.sin(a)];
    // Dos tramos por hoja: se curva hacia afuera.
    const medio = [cx * inclinacion * 0.35, alto * 0.55, cz * inclinacion * 0.35];
    const tip = [cx * inclinacion, alto, cz * inclinacion];
    const [px, pz] = [-cz * ancho, cx * ancho];
    const v = [
      [-px, 0, -pz],
      [px, 0, pz],
      [medio[0] as number, medio[1] as number, medio[2] as number],
      [tip[0] as number, tip[1] as number, tip[2] as number],
    ];
    const tris = [
      [0, 1, 2],
      [1, 3, 2],
    ];
    for (const tri of tris) {
      for (const k of tri) {
        const p = v[k] as number[];
        posiciones.push(p[0] as number, p[1] as number, p[2] as number);
        const c = base.clone().lerp(punta, Math.min(1, (p[1] as number) / alto));
        colores.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
  g.setAttribute('color', new Float32BufferAttribute(colores, 3));
  g.computeVertexNormals();
  return g;
}

function sembrar(): { olivos: Planta[]; matas: Planta[] } {
  const azar = crearAzar(5);
  const olivos: Planta[] = [];
  const matas: Planta[] = [];
  const planta = (x: number, y: number, z: number, escala: number): Planta => ({
    x,
    y,
    z,
    escala,
    giro: azar() * Math.PI * 2,
  });
  // Jardineras del este: un olivo y gramíneas alrededor.
  for (const j of jardineras()) {
    olivos.push(planta((j.x0 + j.x1) / 2, j.y, (j.z0 + j.z1) / 2, 1.05));
    for (let i = 0; i < 16; i++) {
      matas.push(
        planta(
          j.x0 + 0.2 + azar() * (j.x1 - j.x0 - 0.4),
          j.y,
          j.z0 + 0.2 + azar() * (j.z1 - j.z0 - 0.4),
          0.7 + azar() * 0.5,
        ),
      );
    }
  }
  // Nada crece donde hay un ala ni bajo ella.
  const alas = plano.ambientes.filter((a) => a.ala);
  const bajoUnAla = (x: number, z: number, margen: number) =>
    alas.some((a) => x > a.x0 - margen && x < a.x1 + margen && z > -4.2 - margen && z < 4 + margen);
  // Olivos sueltos en el pasto, enmarcando la casa.
  for (const [x, z, e] of [
    [-19.3, 6.8, 1.25],
    [19.6, 1.6, 1.15],
    [-18.6, -7.2, 1.35],
    [18, -7.6, 1.2],
    [-20.2, -0.8, 1],
  ] as const) {
    if (!bajoUnAla(x, z, 1.5)) olivos.push(planta(x, 0, z, e));
  }
  // Gramíneas en macizos: atrás de la casa (se ven por el vidrio) y a los costados.
  const macizo = (cx: number, cz: number, n: number, radio: number) => {
    for (let i = 0; i < n; i++) {
      const a = azar() * Math.PI * 2;
      const r = Math.sqrt(azar()) * radio;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const dentroCasa =
        x > HUELLA.x0 - 0.2 && x < HUELLA.x1 + 0.2 && z > HUELLA.z0 - 0.3 && z < HUELLA.z1;
      const dentroTerreno =
        x > TERRENO.x0 + 0.3 &&
        x < TERRENO.x1 - 0.3 &&
        z > TERRENO.z0 + 0.3 &&
        z < TERRENO.z1 - 0.3;
      if (!dentroCasa && dentroTerreno && !bajoUnAla(x, z, 0.4))
        matas.push(planta(x, 0, z, 0.8 + azar() * 0.6));
    }
  };
  for (let x = -20; x <= 20; x += 4.2) macizo(x + azar(), -5.6 - azar() * 1.5, 7, 1.3);
  macizo(-19, 3, 14, 2.2);
  macizo(19.5, 6, 14, 2.2);
  macizo(-18.5, -4.5, 10, 1.6);
  macizo(18.8, -3.5, 10, 1.6);
  // Techo verde: macizos sobre la losa del techo, a ambos lados de la torre.
  const techo = NIVEL_Y.torre;
  for (const [cx, cz] of [
    [-13.5, -2],
    [-9, 1.8],
    [-6.2, -2.6],
    [7, 1.5],
    [11.5, -2.2],
    [14.6, 1.2],
  ] as const) {
    for (let i = 0; i < 9; i++) {
      const a = azar() * Math.PI * 2;
      const r = Math.sqrt(azar()) * 1.4;
      matas.push(
        planta(
          cx + Math.cos(a) * r,
          techo,
          Math.min(3.5, cz + Math.sin(a) * r),
          0.7 + azar() * 0.4,
        ),
      );
    }
  }
  return { olivos, matas };
}

const matriz = new Matrix4();
const rotacion = new Quaternion();
const eje = new Vector3(0, 1, 0);
const escala = new Vector3();
const posicion = new Vector3();

function colocar(
  malla: InstancedMesh | null,
  plantas: readonly Planta[],
  colores?: readonly Color[],
) {
  if (!malla) return;
  plantas.forEach((p, i) => {
    rotacion.setFromAxisAngle(eje, p.giro);
    matriz.compose(posicion.set(p.x, p.y, p.z), rotacion, escala.setScalar(p.escala));
    malla.setMatrixAt(i, matriz);
    const c = colores?.[i];
    if (c) malla.setColorAt(i, c);
  });
  malla.instanceMatrix.needsUpdate = true;
  if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
}

interface Props {
  sombras: boolean;
  movimiento: number;
}

/**
 * Olivos y gramíneas procedurales, instanciados: tres draw calls para todo el jardín (troncos,
 * copas y matas). Las gramíneas se mecen con el viento en el shader (sin costo en CPU);
 * `movimiento` (menor con `prefers-reduced-motion`) escala su velocidad.
 */
export function Vegetacion({ sombras, movimiento }: Props) {
  const tronco = useRef<InstancedMesh>(null);
  const copa = useRef<InstancedMesh>(null);
  const matas = useRef<InstancedMesh>(null);
  const datos = useMemo(() => {
    const plantas = sembrar();
    const azar = crearAzar(3);
    const plata = new Color('#6f7d5a');
    return {
      ...plantas,
      coloresCopa: plantas.olivos.map(() =>
        plata.clone().offsetHSL((azar() - 0.5) * 0.03, 0, (azar() - 0.5) * 0.06),
      ),
      coloresMata: plantas.matas.map(() =>
        new Color().setHSL(0.13 + azar() * 0.07, 0.25 + azar() * 0.2, 0.7 + azar() * 0.2),
      ),
      geometrias: { tronco: geometriaTronco(), copa: geometriaCopa(), mata: geometriaGraminea() },
    };
  }, []);
  const viento = useMemo(() => ({ value: 0 }), []);
  const materiales = useMemo(() => {
    const mata = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.9 });
    mata.onBeforeCompile = (shader) => {
      shader.uniforms.uViento = viento;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uViento;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 raiz = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float vaiven = sin(uViento * 1.6 + raiz.x * 0.7 + raiz.z * 0.5) + 0.4 * sin(uViento * 3.1 + raiz.x * 1.3);
          transformed.x += vaiven * 0.06 * transformed.y * transformed.y;
          transformed.z += vaiven * 0.03 * transformed.y * transformed.y;`,
        );
    };
    return {
      tronco: new MeshStandardMaterial({ color: '#5b5148', roughness: 1 }),
      copa: new MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
      mata,
    };
  }, [viento]);

  useLayoutEffect(() => {
    colocar(tronco.current, datos.olivos);
    colocar(copa.current, datos.olivos, datos.coloresCopa);
    colocar(matas.current, datos.matas, datos.coloresMata);
  }, [datos]);
  useLayoutEffect(
    () => () => {
      for (const g of Object.values(datos.geometrias)) g.dispose();
      for (const m of Object.values(materiales)) m.dispose();
    },
    [datos, materiales],
  );

  useFrame((_, delta) => {
    viento.value += Math.min(delta, 0.1) * movimiento;
  });

  const n = datos.olivos.length;
  return (
    <group>
      <instancedMesh
        ref={tronco}
        args={[datos.geometrias.tronco, materiales.tronco, n]}
        castShadow={sombras}
        receiveShadow={sombras}
        frustumCulled={false}
        matrixAutoUpdate={false}
      />
      <instancedMesh
        ref={copa}
        args={[datos.geometrias.copa, materiales.copa, n]}
        castShadow={sombras}
        receiveShadow={sombras}
        frustumCulled={false}
        matrixAutoUpdate={false}
      />
      <instancedMesh
        ref={matas}
        args={[datos.geometrias.mata, materiales.mata, datos.matas.length]}
        receiveShadow={sombras}
        frustumCulled={false}
        matrixAutoUpdate={false}
      />
    </group>
  );
}
