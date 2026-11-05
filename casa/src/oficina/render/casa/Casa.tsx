import { useLayoutEffect, useMemo } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NIVEL_Y, plano } from '../../mansion/plano';
import { material } from '../recursos';
import { texturaLineal } from '../texturas';
import { estructura, exterior, HUELLA, peldanos } from './arquitectura';
import type { Bloque, ClaveMaterial } from './arquitectura';
import { Ambientes } from './ambientes/Ambientes';
import { fusionarPorCorte, prepararPieza } from './geometria';
import type { PiezaMundo } from './geometria';
import { BORDE_ESPEJO } from './EspejoAgua';
import { Luminarias } from './Luminarias';
import type { PaletaLuz } from './luz';
import { materialCasa, recompilarOclusion } from './materiales';
import { planoCorte } from './planoCorte';
import { Piscina } from './Piscina';
import { Vegetacion } from './Vegetacion';

// --- escalera de caracol: sectores de nogal, columna, balaustres y pasamanos helicoidal ---

const RADIO_COLUMNA = 0.09;
const RADIO_EXTERIOR = 1.05;
const RADIO_PASAMANOS = 1.0;
/** El pasamanos termina antes de cruzar la losa de la torre. */
const TOPE_PASAMANOS = NIVEL_Y.torre - 1.3;

function piezasCaracol(): PiezaMundo[] {
  const piezas: PiezaMundo[] = [];
  for (const escalera of plano.escaleras) {
    const lista = peldanos(escalera).filter((p) => p.sector);
    const primero = lista[0]?.sector;
    if (!primero) continue;
    const { cx, cz } = primero;
    const puntos: Vector3[] = [];
    for (const p of lista) {
      const s = p.sector;
      if (!s) continue;
      // En el plano de la forma, y = -z del mundo (la forma se acuesta con rotateX(-π/2)).
      const forma = new Shape();
      const n = 6;
      const arco = (r: number, desde: number, hasta: number) =>
        Array.from({ length: n + 1 }, (_, i) => {
          const a = desde + ((hasta - desde) * i) / n;
          return [r * Math.cos(a), -r * Math.sin(a)] as const;
        });
      const exterior = arco(RADIO_EXTERIOR, s.desde, s.hasta);
      const interior = arco(RADIO_COLUMNA, s.hasta, s.desde);
      const [inicio, ...resto] = [...exterior, ...interior];
      if (!inicio) continue;
      forma.moveTo(inicio[0], inicio[1]);
      for (const [x, y] of resto) forma.lineTo(x, y);
      const g = new ExtrudeGeometry(forma, { depth: 0.055, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(cx, p.y - 0.055, cz);
      piezas.push({ material: 'nogal', geometria: prepararPieza(g) });

      const medio = (s.desde + s.hasta) / 2;
      const bx = cx + RADIO_PASAMANOS * Math.cos(medio);
      const bz = cz + RADIO_PASAMANOS * Math.sin(medio);
      if (p.y <= TOPE_PASAMANOS) {
        const balaustre = new CylinderGeometry(0.011, 0.011, 0.92, 5);
        balaustre.translate(bx, p.y + 0.46, bz);
        piezas.push({ material: 'acero', geometria: prepararPieza(balaustre) });
        puntos.push(new Vector3(bx, p.y + 0.94, bz));
      }
    }
    const ultimo = lista[lista.length - 1];
    if (!ultimo) continue;
    const columna = new CylinderGeometry(
      RADIO_COLUMNA,
      RADIO_COLUMNA,
      ultimo.y + 1 - lista[0]!.y,
      16,
    );
    columna.translate(cx, (ultimo.y + 1 + lista[0]!.y) / 2 - 0.2, cz);
    piezas.push({ material: 'acero', geometria: prepararPieza(columna) });
    if (puntos.length > 1) {
      const curva = new CatmullRomCurve3(puntos);
      const pasamanos = new TubeGeometry(curva, puntos.length * 4, 0.022, 6, false);
      piezas.push({ material: 'laton', geometria: prepararPieza(pasamanos) });
    }
  }
  return piezas;
}

// --- torre-observatorio: anillo de hormigón y cúpula de cobre abierta (en corte) ---

const CUPULA = { x: 0, z: -1, radio: 2.95, ranura: 0.1 };

function piezasTorre(): PiezaMundo[] {
  const torre = plano.ambientes.find((a) => a.nivel === 'torre');
  if (!torre) return [];
  const arriba = torre.y + torre.alto;
  // Anillo: losa con el hueco circular de la cúpula (y de la forma = -z del mundo).
  const losa = new Shape();
  losa.moveTo(torre.x0 - 0.2, -HUELLA.z0);
  losa.lineTo(torre.x1 + 0.2, -HUELLA.z0);
  losa.lineTo(torre.x1 + 0.2, -torre.z1);
  losa.lineTo(torre.x0 - 0.2, -torre.z1);
  losa.closePath();
  const hueco = new Path();
  hueco.absarc(CUPULA.x, -CUPULA.z, CUPULA.radio, 0, Math.PI * 2, false);
  losa.holes.push(hueco);
  const anillo = new ExtrudeGeometry(losa, { depth: 0.3, bevelEnabled: false, curveSegments: 40 });
  anillo.rotateX(-Math.PI / 2);
  anillo.translate(0, arriba, 0);

  const base = arriba + 0.3;
  // Media cúpula trasera (z < 0) con la ranura del telescopio al centro; la delantera es el corte.
  const media = (desde: number, hasta: number) => {
    const g = new SphereGeometry(CUPULA.radio, 28, 12, desde, hasta - desde, 0, Math.PI / 2);
    g.translate(CUPULA.x, base, CUPULA.z);
    return g;
  };
  const piezas: PiezaMundo[] = [
    { material: 'hormigon', geometria: prepararPieza(anillo) },
    { material: 'cobre', geometria: prepararPieza(media(Math.PI, 1.5 * Math.PI - CUPULA.ranura)) },
    {
      material: 'cobre',
      geometria: prepararPieza(media(1.5 * Math.PI + CUPULA.ranura, 2 * Math.PI)),
    },
  ];
  // Aro de latón en la base y nervios de acero que suben al cénit.
  const aro = new TorusGeometry(CUPULA.radio, 0.06, 6, 40, Math.PI);
  aro.rotateX(-Math.PI / 2);
  aro.translate(CUPULA.x, base, CUPULA.z);
  piezas.push({ material: 'laton', geometria: prepararPieza(aro) });
  for (const beta of [0.12, 0.32, 0.68, 0.88]) {
    const nervio = new TorusGeometry(CUPULA.radio + 0.02, 0.035, 4, 16, Math.PI / 2);
    nervio.rotateY(beta * Math.PI);
    nervio.translate(CUPULA.x, base, CUPULA.z);
    piezas.push({ material: 'acero', geometria: prepararPieza(nervio) });
  }
  return piezas;
}

// --- borde de mármol del espejo de agua del atrio (el agua es `EspejoAgua`) ---

function espejoDeAgua(): Bloque[] {
  return plano.muebles
    .filter((m) => m.tipo === 'espejo-agua')
    .flatMap((m): Bloque[] => {
      const [hx, hz, borde] = [m.ancho / 2, m.fondo / 2, BORDE_ESPEJO];
      const c = { x0: m.x - hx, x1: m.x + hx, z0: m.z - hz, z1: m.z + hz };
      const y = m.y + m.alto;
      const marmol = (x0: number, x1: number, z0: number, z1: number): Bloque => ({
        material: 'marmol',
        rol: 'muro',
        x0,
        x1,
        y0: 0,
        y1: y,
        z0,
        z1,
      });
      return [
        marmol(c.x0, c.x1, c.z0, c.z0 + borde),
        marmol(c.x0, c.x1, c.z1 - borde, c.z1),
        marmol(c.x0, c.x0 + borde, c.z0 + borde, c.z1 - borde),
        marmol(c.x1 - borde, c.x1, c.z0 + borde, c.z1 - borde),
      ];
    });
}

// --- sombras de contacto pintadas: donde el piso se encuentra con muros y vidrio ---

const ANCHO_SOMBRA = 0.55;

/** Una franja horizontal oscura junto a una arista; v = 0 en la arista, 1 lejos. */
function franja(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  hacia: 'x+' | 'x-' | 'z+',
) {
  const posiciones = [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
  const v = (x: number, z: number) =>
    hacia === 'x+'
      ? (x - x0) / (x1 - x0)
      : hacia === 'x-'
        ? (x1 - x) / (x1 - x0)
        : (z - z0) / (z1 - z0);
  const uv: number[] = [];
  for (let i = 0; i < posiciones.length; i += 3)
    uv.push(0.5, v(posiciones[i] as number, posiciones[i + 2] as number));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posiciones, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

function geometriaSombras(bloques: readonly Bloque[]): BufferGeometry {
  const niveles = Object.values(NIVEL_Y);
  const enPiso = (b: Bloque) => niveles.some((n) => Math.abs(n - b.y0) < 1e-6);
  const partes: BufferGeometry[] = [];
  for (const b of bloques) {
    if (b.rol !== 'muro' || b.pendiente || !enPiso(b)) continue;
    const y = b.y0 + 0.005;
    if (b.material === 'hormigon' && b.z1 - b.z0 > 0.3) {
      // Por fuera de un ala no hay piso sobre el que pintar: la franja quedaría flotando.
      if (b.x1 <= HUELLA.x1 + 1e-6)
        partes.push(franja(b.x1, b.x1 + ANCHO_SOMBRA, b.z0, Math.min(b.z1, HUELLA.z1), y, 'x+'));
      if (b.x0 >= HUELLA.x0 - 1e-6)
        partes.push(franja(b.x0 - ANCHO_SOMBRA, b.x0, b.z0, Math.min(b.z1, HUELLA.z1), y, 'x-'));
    } else if (b.material === 'vidrio') {
      partes.push(franja(b.x0, b.x1, b.z1, b.z1 + ANCHO_SOMBRA, y, 'z+'));
    }
  }
  const fusion = mergeGeometries(partes);
  for (const p of partes) p.dispose();
  if (!fusion) throw new Error('No se pudieron armar las sombras de contacto');
  return fusion;
}

const materialSombra = () =>
  material(
    'casa:sombra-contacto',
    () =>
      new MeshBasicMaterial({
        color: '#000000',
        map: texturaLineal('casa:sombra-contacto', [
          [0, 'rgba(255,255,255,0.42)'],
          [0.35, 'rgba(255,255,255,0.14)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
  );

/** Materiales que no proyectan sombra real (transparentes o emisivos). */
const SIN_SOMBRA = new Set<ClaveMaterial>(['vidrio', 'led']);

interface Props {
  paleta: PaletaLuz;
  /** Sombras reales (calidad alta en escritorio). */
  sombras: boolean;
  /** 0..1: velocidad del agua y el viento (menor con `prefers-reduced-motion`). */
  movimiento: number;
}

/**
 * La mansión entera: toda la arquitectura (losas, muros, muro cortina, cielos, barandas,
 * escaleras, torre, terreno y terraza) fusionada en una malla por material y costado de corte
 * (el muro cortina y los muros laterales se ocultan según el ángulo), más la piscina,
 * el jardín y las luminarias. Se construye una sola vez.
 */
export function Casa({ paleta, sombras, movimiento }: Props) {
  const { grupos, sombrasPintadas } = useMemo(() => {
    const bloques = [...estructura(), ...exterior(), ...espejoDeAgua()];
    const fusion = fusionarPorCorte(bloques, [...piezasCaracol(), ...piezasTorre()]);
    return { grupos: fusion, sombrasPintadas: geometriaSombras(bloques) };
  }, []);
  useLayoutEffect(
    () => () => {
      for (const g of grupos) g.geometria.dispose();
      sombrasPintadas.dispose();
    },
    [grupos, sombrasPintadas],
  );
  // Las salas construidas cambian los volúmenes de la oclusión, que van escritos en el shader.
  useLayoutEffect(recompilarOclusion, []);
  // El corte de altura (`CorteCasa`) recorta con un plano los materiales de la casa, que el
  // mobiliario comparte: los pisos de arriba desaparecen sin una malla más.
  useLayoutEffect(() => {
    for (const { material: clave } of grupos) {
      const m = materialCasa(clave);
      m.clippingPlanes = [planoCorte];
      m.clipShadows = true;
      m.needsUpdate = true;
    }
  }, [grupos]);

  return (
    <group>
      {grupos.map(({ material: clave, lado, geometria }) => (
        <mesh
          key={`${clave}|${lado ?? ''}`}
          geometry={geometria}
          material={materialCasa(clave)}
          userData={lado ? { ladoCorte: lado } : {}}
          castShadow={sombras && !SIN_SOMBRA.has(clave)}
          receiveShadow={sombras && clave !== 'led'}
          renderOrder={clave === 'vidrio' ? 1 : 0}
          matrixAutoUpdate={false}
        />
      ))}
      <mesh
        geometry={sombrasPintadas}
        material={materialSombra()}
        renderOrder={1}
        matrixAutoUpdate={false}
      />
      <Piscina paleta={paleta} movimiento={movimiento} />
      <Vegetacion sombras={sombras} movimiento={movimiento} />
      <Luminarias paleta={paleta} />
      <Ambientes paleta={paleta} sombras={sombras} movimiento={movimiento} />
    </group>
  );
}
