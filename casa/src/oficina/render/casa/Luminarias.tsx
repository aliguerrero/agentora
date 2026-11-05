import { useLayoutEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  CylinderGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { propio } from '../estilos';
import { Fusionados } from '../Fusionados';
import { Pieza } from '../Pieza';
import { congelar, geometria, material } from '../recursos';
import { texturaRadial } from '../texturas';
import { colgantes } from './colgantes';
import type { Colgante } from './colgantes';
import type { PaletaLuz } from './luz';
import { materialCasa } from './materiales';

const ALTO_PANTALLA = 0.24;

const G = {
  pantalla: () =>
    geometria(
      'colgante:pantalla',
      () => new CylinderGeometry(0.05, 0.19, ALTO_PANTALLA, 24, 1, true),
    ),
  remate: () => geometria('colgante:remate', () => new CylinderGeometry(0.035, 0.05, 0.05, 16)),
  ampolleta: () => geometria('colgante:ampolleta', () => new SphereGeometry(0.06, 12, 8)),
  cable: () => geometria('colgante:cable', () => new CylinderGeometry(0.006, 0.006, 1, 4)),
};

/**
 * Luz pintada: halos de las ampolletas y charcos sobre mesas y pisos, en una sola malla
 * aditiva. El peso de cada plano va en el color de sus vértices (el halo es el más intenso).
 */
const luzPintada = () =>
  material(
    'casa:luz-pintada',
    () =>
      new MeshBasicMaterial({
        map: texturaRadial('casa:luz-pintada', [
          [0, 'rgba(255,226,180,1)'],
          [0.22, 'rgba(255,196,130,0.5)'],
          [0.6, 'rgba(255,180,110,0.16)'],
          [1, 'rgba(255,170,100,0)'],
        ]),
        vertexColors: true,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
  );

const PESO = { halo: 1, mesa: 0.75, piso: 0.4 };

function plano(ancho: number, alto: number, peso: number): BufferGeometry {
  const g = new PlaneGeometry(ancho, alto);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Array<number>(n * 3).fill(peso), 3));
  return g;
}

/** Halo frente a cada ampolleta y charcos sobre la mesa y, amplio y tenue, en el piso. */
function geometriaLuzPintada(lista: readonly Colgante[]): BufferGeometry {
  const partes = lista.flatMap((c) => {
    const halo = plano(1.1, 1.1, PESO.halo);
    halo.translate(c.x, c.yPantalla + 0.02, c.z + 0.05);
    const mesa = plano(c.radioX * 2, c.radioZ * 2, PESO.mesa);
    mesa.rotateX(-Math.PI / 2);
    mesa.translate(c.x, c.yCharco, c.z);
    const piso = plano(c.radioX * 4, c.radioZ * 4, PESO.piso);
    piso.rotateX(-Math.PI / 2);
    piso.translate(c.x, c.yPiso + 0.006, c.z);
    return [halo, mesa, piso];
  });
  const fusion = mergeGeometries(partes);
  for (const p of partes) p.dispose();
  if (!fusion) throw new Error('No se pudo armar la luz pintada de las luminarias');
  return fusion;
}

interface Props {
  paleta: PaletaLuz;
}

/**
 * Colgantes de latón sobre las mesas: la pieza (pantalla, remate, cable y ampolleta) fusionada
 * por material y la luz pintada (halo de la ampolleta y charcos sobre la mesa y el piso) en
 * una sola malla aditiva. Su brillo sigue a la hora: casi apagados de día, encendidos de noche.
 */
export function Luminarias({ paleta }: Props) {
  const lista = useMemo(colgantes, []);
  const pintada = useMemo(() => geometriaLuzPintada(lista), [lista]);
  useLayoutEffect(() => () => pintada.dispose(), [pintada]);

  useLayoutEffect(() => {
    const { color, charcos } = paleta.interior;
    const m = luzPintada();
    m.color.setRGB(color.r, color.g, color.b, SRGBColorSpace);
    m.opacity = charcos;
  }, [paleta]);

  const laton = propio(materialCasa('laton'));
  const acero = propio(materialCasa('acero'));
  const luz = propio(materialCasa('led'));
  return (
    <>
      <Fusionados>
        {/* Decorado fijo: sus grupos no recalculan la matriz en cada cuadro. */}
        <group ref={congelar}>
          {lista.map((c) => {
            const largo = c.yCielo - (c.yPantalla + ALTO_PANTALLA);
            return (
              <group key={`${c.mueble}:${c.x}:${c.z}`} position={[c.x, c.yPantalla, c.z]}>
                <Pieza g={G.pantalla()} e={laton} p={[0, ALTO_PANTALLA / 2, 0]} />
                <Pieza g={G.remate()} e={laton} p={[0, ALTO_PANTALLA + 0.02, 0]} />
                <Pieza g={G.ampolleta()} e={luz} p={[0, 0.06, 0]} />
                <group position={[0, ALTO_PANTALLA + largo / 2, 0]} scale={[1, largo, 1]}>
                  <Pieza g={G.cable()} e={acero} />
                </group>
              </group>
            );
          })}
        </group>
      </Fusionados>
      <mesh geometry={pintada} material={luzPintada()} renderOrder={2} matrixAutoUpdate={false} />
    </>
  );
}
