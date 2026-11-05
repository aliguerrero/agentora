import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { Group } from 'three';
import type { AgenteOficina, AtuendoResuelto, ModoEtiquetas } from '../tipos';
import type { Rig } from './animador';
import { AccesoriosRegistrados, ACCESORIOS } from './accesorios';
import { oscurecer } from './caras';
import {
  estiloCara,
  estiloIcono,
  estiloTorsoFrente,
  hueso,
  ORDEN,
  pintura,
  propio,
  vendas,
} from './estilos';
import type { Estilo } from './flota';
import { Pieza, ProveedorPartes } from './Pieza';
import type { Parte } from './Pieza';
import { caja, cajaRedonda, congelar, geometria, material } from './recursos';
import { celdaTorso, celdasCara, materialCaraCalabaza } from './texturas';

type Tupla = [number, number, number];

/** Umbral (px) de arrastre: más que esto es orbitar la cámara, no tocar a alguien. */
const UMBRAL_ARRASTRE = 6;
const ESTILOS_BASE = ['feliz', 'sonrisa', 'concentrado', 'guino', 'serio'];
/** Tops de manga corta; cualquier otro (incluidos los de paquetes) lleva manga larga. */
const MANGA_CORTA = ['polera', 'deportiva'];

/** Caja del torso sin la cara frontal: el frente es un plano aparte que lee el atlas de torsos. */
function cajaSinFrente(ancho: number, alto: number, fondo: number): BoxGeometry {
  const g = new BoxGeometry(ancho, alto, fondo);
  const frente = g.groups[4];
  const indice = g.getIndex();
  if (!frente || !indice) throw new Error('BoxGeometry sin el grupo de la cara frontal');
  const restantes = Array.from(indice.array);
  restantes.splice(frente.start, frente.count);
  g.setIndex(restantes);
  g.clearGroups();
  return g;
}

// --- geometrías compartidas por todas las personas ---
const G = {
  muslo: cajaRedonda(0.25, 0.32, 0.27, 2, 0.03),
  pantorrilla: cajaRedonda(0.25, 0.25, 0.27, 2, 0.03),
  zapato: cajaRedonda(0.27, 0.09, 0.32, 2, 0.035),
  torso: geometria('torso-sin-frente', () => cajaSinFrente(0.56, 0.6, 0.3)),
  torsoFrente: geometria('torso-frente', () => new PlaneGeometry(0.56, 0.6)),
  brazoSup: cajaRedonda(0.22, 0.3, 0.26, 2, 0.03),
  antebrazo: cajaRedonda(0.21, 0.29, 0.25, 2, 0.04),
  mano: cajaRedonda(0.2, 0.06, 0.24, 1, 0.02),
  cabeza: cajaRedonda(0.44, 0.42, 0.42, 4, 0.1),
  cara: geometria('plano-cara', () => new PlaneGeometry(0.36, 0.36)),
  caraCalabaza: geometria('plano-cara-calabaza', () => new PlaneGeometry(0.42, 0.42)),
  icono: geometria('plano-icono', () => new PlaneGeometry(0.42, 0.42)),
  falda: geometria('falda', () =>
    new CylinderGeometry(0.31, 0.4, 0.34, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.62),
  ),
  bata: caja(0.58, 0.22, 0.32),
  taza: geometria('taza', () => new CylinderGeometry(0.06, 0.05, 0.12, 14)),
  hoja: caja(0.22, 0.28, 0.012),
  telefono: caja(0.2, 0.1, 0.05),
  rizo: geometria('rizo', () => new IcosahedronGeometry(0.1, 1)),
  /** Caja invisible que recibe el toque: una por persona, en vez de raycastear cada pieza. */
  zonaToque: caja(0.75, 1.8, 0.65),
};

const materialToque = () => material('zona-toque', () => new MeshBasicMaterial({ visible: false }));

/** Aro ámbar bajo quien espera una decisión o está seleccionado (un solo material compartido). */
export const materialAnillo = () =>
  material(
    'anillo',
    () =>
      new MeshBasicMaterial({
        color: '#f0a848',
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
      }),
  );
export const geometriaAnillo = () =>
  geometria('anillo', () => new RingGeometry(0.46, 0.56, 40).rotateX(-Math.PI / 2));

const cristal = () =>
  propio(
    material(
      'cristal',
      () =>
        new MeshStandardMaterial({
          color: 0x9fd3ff,
          transparent: true,
          opacity: 0.25,
          roughness: 0.1,
        }),
    ),
    ORDEN.cristal,
  );

/** Estilos de cada parte de una persona, derivados de su atuendo (todos compartidos). */
function estilosPersona(a: AtuendoResuelto) {
  const piel = a.skin === 'momia' ? vendas() : pintura(a.skin, 0.5);
  const especial = a.top === 'esqueleto' || a.top === 'momia';
  const extremidad = (tipo: string, color: string): Estilo =>
    tipo === 'esqueleto' || color === 'esqueleto'
      ? hueso()
      : tipo === 'momia' || color === 'momia'
        ? vendas()
        : pintura(color, 0.7);
  const lateral: Estilo =
    a.top === 'esqueleto'
      ? pintura('#151719')
      : a.top === 'momia'
        ? vendas()
        : pintura(a.top === 'bata' ? '#eef0f2' : a.topColor, 0.7);
  const pantalon = extremidad(a.bottomColor, a.bottomColor);
  const piernaCorta = a.bottom === 'short' || a.bottom === 'falda';
  const inferior = piernaCorta ? (especial ? extremidad(a.top, a.top) : piel) : pantalon;
  const mangaLarga = !MANGA_CORTA.includes(a.top);
  return {
    piel,
    pantalon,
    muslo: a.bottom === 'falda' ? (especial ? inferior : piel) : pantalon,
    inferior,
    zapato: pintura(a.shoes, 0.5),
    torso: lateral,
    mangaSup: especial ? extremidad(a.top, a.top) : lateral,
    mangaInf: especial ? extremidad(a.top, a.top) : mangaLarga ? lateral : piel,
    punoVisible: mangaLarga && !especial,
    pelo: pintura(a.hairColor, 0.75),
  };
}

function Pelo({ a, e }: { a: AtuendoResuelto; e: Estilo }) {
  const conSombrero = a.acc.some(
    (id) =>
      ['gorro', 'gorra', 'sombrero-bruja', 'cuernos'].includes(id) || ACCESORIOS[id]?.sombrero,
  );
  const casquete = <Pieza g={cajaRedonda(0.47, 0.13, 0.46, 2, 0.05)} e={e} p={[0, 0.18, -0.01]} />;
  switch (a.hair) {
    case 'corto':
      return (
        <>
          {casquete}
          <Pieza g={cajaRedonda(0.47, 0.26, 0.08, 2, 0.03)} e={e} p={[0, 0.06, -0.2]} />
          {[-1, 1].map((s) => (
            <Pieza
              key={s}
              g={cajaRedonda(0.05, 0.17, 0.3, 1, 0.02)}
              e={e}
              p={[s * 0.225, 0.1, -0.05]}
            />
          ))}
          {!conSombrero && (
            <Pieza g={cajaRedonda(0.3, 0.07, 0.12, 2, 0.03)} e={e} p={[0.05, 0.22, 0.17]} />
          )}
        </>
      );
    case 'largo':
      return (
        <>
          {casquete}
          <Pieza g={cajaRedonda(0.49, 0.66, 0.1, 2, 0.04)} e={e} p={[0, -0.08, -0.21]} />
          {[-1, 1].map((s) => (
            <Pieza
              key={s}
              g={cajaRedonda(0.06, 0.48, 0.34, 1, 0.02)}
              e={e}
              p={[s * 0.235, -0.02, -0.03]}
            />
          ))}
        </>
      );
    case 'rizos':
      return (
        <>
          {RIZOS.map((p, i) => (
            <Pieza key={i} g={G.rizo} e={e} p={p} />
          ))}
        </>
      );
    case 'mono':
      return (
        <>
          {casquete}
          <Pieza g={cajaRedonda(0.47, 0.22, 0.08, 2, 0.03)} e={e} p={[0, 0.08, -0.2]} />
          {!conSombrero && (
            <Pieza
              g={geometria('mono', () => new SphereGeometry(0.12, 16, 12))}
              e={e}
              p={[0, 0.3, -0.12]}
            />
          )}
        </>
      );
    case 'rapado':
      return <Pieza g={cajaRedonda(0.45, 0.05, 0.44, 1, 0.02)} e={e} p={[0, 0.2, -0.01]} />;
    default:
      return null;
  }
}

const RIZOS: Tupla[] = [
  [0, 0.24, 0],
  [-0.15, 0.21, 0.06],
  [0.15, 0.21, 0.06],
  [-0.17, 0.2, -0.12],
  [0.17, 0.2, -0.12],
  [0, 0.22, -0.17],
  [-0.08, 0.26, -0.06],
  [0.08, 0.26, -0.06],
  [-0.21, 0.08, -0.12],
  [0.21, 0.08, -0.12],
  [0, 0.1, -0.22],
];

/** Accesorios de la cabeza (sus coordenadas son locales a la cabeza). */
function AccesoriosCabeza({ a }: { a: AtuendoResuelto }) {
  const tiene = (id: string) => a.acc.includes(id);
  const lentes = tiene('lentes');
  const audifonos = tiene('audifonos');
  const gorro = tiene('gorro');
  const gorra = tiene('gorra');
  const bruja = tiene('sombrero-bruja');
  const cuernos = tiene('cuernos');
  const pumpkin = tiene('calabaza');
  const marco = pintura('#151719', 0.4);
  const auricular = pintura('#22262c', 0.4);
  const colorGorro = a.topColor === '#151719' ? '#b33a3a' : oscurecer(a.topColor, 0.85);
  const gorroMat = pintura(colorGorro, 0.8);
  const gorraMat = pintura('#2f3e63', 0.6);
  const brujaMat = pintura('#221a2e', 0.7);
  return (
    <>
      {lentes && !pumpkin && (
        <>
          {[-0.095, 0.095].map((x) => (
            <Pieza
              key={x}
              g={geometria('lente-aro', () => new TorusGeometry(0.058, 0.012, 6, 20))}
              e={marco}
              p={[x, 0.035, 0.225]}
            />
          ))}
          <Pieza g={caja(0.06, 0.012, 0.012)} e={marco} p={[0, 0.04, 0.225]} />
          {[-0.095, 0.095].map((x) => (
            <Pieza
              key={x}
              g={geometria('lente-cristal', () => new CircleGeometry(0.056, 20))}
              e={cristal()}
              p={[x, 0.035, 0.226]}
            />
          ))}
        </>
      )}
      {audifonos && (
        <>
          <Pieza
            g={geometria('aud-banda', () => new TorusGeometry(0.25, 0.022, 8, 28, Math.PI))}
            e={auricular}
          />
          {[-1, 1].map((s) => (
            <Pieza
              key={s}
              g={geometria('aud-copa', () =>
                new CylinderGeometry(0.08, 0.08, 0.07, 18).rotateZ(Math.PI / 2),
              )}
              e={auricular}
              p={[s * 0.25, 0, 0]}
            />
          ))}
          <Pieza
            g={geometria('aud-mic', () => new CylinderGeometry(0.01, 0.01, 0.2, 6))}
            e={auricular}
            p={[-0.25, -0.1, 0.1]}
            r={[1.1, 0, 0]}
          />
          <Pieza
            g={geometria('aud-punta', () => new SphereGeometry(0.025, 8, 6))}
            e={pintura('#f0a848')}
            p={[-0.25, -0.15, 0.19]}
          />
        </>
      )}
      {gorro && (
        <>
          <Pieza
            g={geometria('gorro-base', () => new CylinderGeometry(0.245, 0.245, 0.12, 22))}
            e={gorroMat}
            p={[0, 0.19, 0]}
          />
          <Pieza
            g={geometria('gorro-cupula', () =>
              new SphereGeometry(0.245, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1),
            )}
            e={gorroMat}
            p={[0, 0.25, 0]}
          />
          <Pieza
            g={geometria('gorro-pompon', () => new SphereGeometry(0.06, 12, 10))}
            e={pintura('#eef0f2', 0.9)}
            p={[0, 0.42, 0]}
          />
        </>
      )}
      {gorra && (
        <>
          <Pieza g={cajaRedonda(0.48, 0.14, 0.47, 2, 0.06)} e={gorraMat} p={[0, 0.23, 0]} />
          <Pieza g={cajaRedonda(0.34, 0.03, 0.2, 1, 0.012)} e={gorraMat} p={[0, 0.18, 0.3]} />
        </>
      )}
      {bruja && (
        <>
          <Pieza
            g={geometria('bruja-ala', () => new CylinderGeometry(0.42, 0.42, 0.025, 30))}
            e={brujaMat}
            p={[0, 0.21, 0]}
          />
          <Pieza
            g={geometria('bruja-cono', () => new ConeGeometry(0.22, 0.56, 24))}
            e={brujaMat}
            p={[0.02, 0.5, -0.02]}
            r={[0, 0, -0.18]}
          />
          <Pieza
            g={geometria('bruja-cinta', () => new CylinderGeometry(0.235, 0.235, 0.06, 24))}
            e={pintura('#7b5cc4', 0.5)}
            p={[0, 0.26, 0]}
          />
        </>
      )}
      {cuernos &&
        [-1, 1].map((s) => (
          <Pieza
            key={s}
            g={geometria('cuerno', () => new ConeGeometry(0.055, 0.17, 12))}
            e={pintura('#b33a3a', 0.4)}
            p={[s * 0.13, 0.3, 0.04]}
            r={[0, 0, -s * 0.35]}
          />
        ))}
    </>
  );
}

/** Accesorios del torso (mochila y capa), locales a la columna. */
function AccesoriosEspalda({ a }: { a: AtuendoResuelto }) {
  return (
    <>
      {a.acc.includes('mochila') && (
        <>
          <Pieza
            g={cajaRedonda(0.44, 0.46, 0.18, 2, 0.05)}
            e={pintura('#d9825f', 0.7)}
            p={[0, 0.32, -0.25]}
          />
          <Pieza
            g={cajaRedonda(0.3, 0.16, 0.06, 1, 0.02)}
            e={pintura(oscurecer('#d9825f', 0.75), 0.7)}
            p={[0, 0.2, -0.36]}
          />
        </>
      )}
      {a.acc.includes('capa') && (
        <>
          <Pieza
            g={caja(0.64, 0.98, 0.03)}
            e={pintura('#151719', 0.6)}
            p={[0, 0.12, -0.19]}
            r={[0.1, 0, 0]}
          />
          <Pieza
            g={caja(0.6, 0.94, 0.01)}
            e={pintura('#8e1b1b', 0.5)}
            p={[0, 0.12, -0.17]}
            r={[0.1, 0, 0]}
          />
          {[-1, 1].map((s) => (
            <Pieza
              key={s}
              g={caja(0.22, 0.2, 0.03)}
              e={pintura('#151719', 0.6)}
              p={[s * 0.2, 0.68, -0.13]}
              r={[-0.3, s * 0.35, 0]}
            />
          ))}
        </>
      )}
    </>
  );
}

function CabezaCalabaza() {
  return (
    <>
      <Pieza
        g={geometria('calabaza', () => new SphereGeometry(0.3, 28, 18).scale(1.12, 0.92, 1.06))}
        e={pintura('#e07b24', 0.6)}
      />
      {[0, 1, 2, 3].map((i) => (
        <Pieza
          key={i}
          g={geometria('calabaza-gajo', () =>
            new TorusGeometry(0.31, 0.02, 6, 32).scale(1.1, 0.9, 1),
          )}
          e={pintura('#c4621a', 0.6)}
          r={[0, (i * Math.PI) / 4, 0]}
        />
      ))}
      <Pieza
        g={geometria('calabaza-tallo', () => new CylinderGeometry(0.035, 0.05, 0.12, 8))}
        e={pintura('#3f7a5e')}
        p={[0, 0.31, 0]}
      />
      <Pieza g={G.caraCalabaza} e={propio(materialCaraCalabaza(), ORDEN.cara)} p={[0, 0, 0.325]} />
    </>
  );
}

export interface PersonaProps {
  agente: AgenteOficina;
  atuendo: AtuendoResuelto;
  seleccionado: boolean;
  rigs: MutableRefObject<Map<string, Rig>>;
  onSeleccionar: (id: string) => void;
  etiquetas?: ModoEtiquetas;
}

const useGrupo = () => useRef<Group>(null);
const useParte = () => useRef<Parte | null>(null);

/**
 * Una persona: cadera → muslo → rodilla → pantorrilla → zapato, hombro → brazo → codo →
 * antebrazo, columna con torso, brazos y cabeza. El árbol de grupos es solo el esqueleto
 * (sin mallas): sus piezas se anotan como `Parte` y `Personas` las dibuja instanciadas.
 * No anima nada por sí misma: registra su `Rig` para que el único `useFrame` de `Personas`
 * lo mueva.
 */
export function Persona({ agente, atuendo, seleccionado, rigs, onSeleccionar, etiquetas = 'nunca' }: PersonaProps) {
  // Mouse encima: muestra nombre y cargo (Oficina DevBox).
  const [encima, setEncima] = useState(false);
  const ficha = seleccionado || (encima && etiquetas !== 'nunca');
  // drei <Html> cambia de contenedor cuando el lienzo conecta sus eventos; si la etiqueta se
  // monta antes, su raíz de React se recrea sobre el mismo nodo y queda vacía para siempre
  // (le pasaba a la primera persona). Se monta solo con los eventos ya conectados.
  const eventosListos = useThree((s) => !!s.events.connected);
  const conEtiqueta = eventosListos && (ficha || etiquetas === 'siempre');
  const clave = JSON.stringify(atuendo);
  const estilos = useMemo(() => estilosPersona(atuendo), [clave]);
  const celdaFrente = useMemo(() => celdaTorso(atuendo), [clave]);
  const calabaza = atuendo.acc.includes('calabaza');
  const tieneTaza = atuendo.acc.includes('taza');
  const conPelo = !calabaza && !atuendo.ocultas.includes('pelo');
  const caraFija = ESTILOS_BASE.includes(atuendo.face) ? null : atuendo.face;
  const celdaCara = useMemo(() => celdasCara(caraFija ?? atuendo.face)[0], [clave]);
  const alturaIcono = calabaza ? 0.62 : 0.6;
  const partes = useMemo<Parte[]>(() => [], []);

  const raiz = useGrupo();
  const pelvis = useGrupo();
  const columna = useGrupo();
  const cabeza = useGrupo();
  const cadera0 = useGrupo();
  const cadera1 = useGrupo();
  const rodilla0 = useGrupo();
  const rodilla1 = useGrupo();
  const hombro0 = useGrupo();
  const hombro1 = useGrupo();
  const codo0 = useGrupo();
  const codo1 = useGrupo();
  const anillo = useGrupo();
  const torso = useParte();
  const taza = useParte();
  const hoja = useParte();
  const telefono = useParte();
  const cara = useParte();
  const icono = useParte();
  const pulsado = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const articulaciones = [
      raiz,
      pelvis,
      columna,
      cabeza,
      cadera0,
      cadera1,
      rodilla0,
      rodilla1,
      hombro0,
      hombro1,
      codo0,
      codo1,
      anillo,
    ];
    const [r, p, col, cab, c0, c1, k0, k1, h0, h1, e0, e1, aro] = articulaciones.map(
      (ref) => ref.current,
    );
    if (!r || !p || !col || !cab || !c0 || !c1 || !k0 || !k1 || !h0 || !h1 || !e0 || !e1 || !aro) {
      return;
    }
    if (!torso.current || !taza.current || !hoja.current || !telefono.current || !icono.current) {
      return;
    }
    const rig: Rig = {
      raiz: r,
      pelvis: p,
      columna: col,
      torso: torso.current.ancla,
      cabeza: cab,
      piernas: [
        { cadera: c0, rodilla: k0 },
        { cadera: c1, rodilla: k1 },
      ],
      brazos: [
        { hombro: h0, codo: e0 },
        { hombro: h1, codo: e1 },
      ],
      taza: taza.current,
      hoja: hoja.current,
      telefono: telefono.current,
      cara: calabaza ? null : cara.current,
      icono: icono.current,
      anillo: aro,
      partes,
      caraFija,
      tazaEquipada: tieneTaza,
      alturaIcono,
    };
    const registro = rigs.current;
    registro.set(agente.id, rig);
    return () => {
      if (registro.get(agente.id) === rig) registro.delete(agente.id);
    };
  }, [agente.id, clave, rigs]);

  const alBajar = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pulsado.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };
  const alSoltar = (e: ThreeEvent<PointerEvent>) => {
    const inicio = pulsado.current;
    pulsado.current = null;
    if (!inicio) return;
    e.stopPropagation();
    if (
      Math.hypot(e.nativeEvent.clientX - inicio.x, e.nativeEvent.clientY - inicio.y) <=
      UMBRAL_ARRASTRE
    ) {
      onSeleccionar(agente.id);
    }
  };

  return (
    <ProveedorPartes value={partes}>
      <group ref={raiz} dispose={null}>
        <mesh
          geometry={G.zonaToque}
          material={materialToque()}
          position={[0, 0.9, 0]}
          onPointerDown={alBajar}
          onPointerUp={alSoltar}
          onPointerOver={(e) => {
            e.stopPropagation();
            setEncima(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            setEncima(false);
            document.body.style.cursor = '';
          }}
        />
        <group ref={pelvis} position={[0, 0.62, 0]}>
          {([-0.135, 0.135] as const).map((x, i) => (
            <group key={x} ref={i === 0 ? cadera0 : cadera1} position={[x, 0, 0]}>
              <Pieza g={G.muslo} e={estilos.muslo} p={[0, -0.16, 0]} />
              <group ref={i === 0 ? rodilla0 : rodilla1} position={[0, -0.32, 0]}>
                <Pieza g={G.pantorrilla} e={estilos.inferior} p={[0, -0.125, 0]} />
                <Pieza g={G.zapato} e={estilos.zapato} p={[0, -0.265, 0.025]} />
              </group>
            </group>
          ))}
          {atuendo.bottom === 'falda' && (
            <Pieza g={G.falda} e={estilos.pantalon} p={[0, -0.12, 0]} />
          )}
          {atuendo.top === 'bata' && (
            <Pieza g={G.bata} e={pintura('#eef0f2', 0.7)} p={[0, -0.08, 0]} />
          )}
          <group ref={columna}>
            <Pieza g={G.torso} e={estilos.torso} p={[0, 0.3, 0]} parte={torso}>
              <Pieza
                g={G.torsoFrente}
                e={estiloTorsoFrente()}
                p={[0, 0, 0.15]}
                celda={celdaFrente}
              />
            </Pieza>
            {([-0.39, 0.39] as const).map((x, i) => (
              <group key={x} ref={i === 0 ? hombro0 : hombro1} position={[x, 0.55, 0]}>
                <Pieza g={G.brazoSup} e={estilos.mangaSup} p={[0, -0.12, 0]} />
                <group ref={i === 0 ? codo0 : codo1} position={[0, -0.27, 0]}>
                  <Pieza g={G.antebrazo} e={estilos.mangaInf} p={[0, -0.14, 0]} />
                  {estilos.punoVisible && <Pieza g={G.mano} e={estilos.piel} p={[0, -0.305, 0]} />}
                  {i === 0 && <AccesoriosRegistrados ancla="mano" acc={atuendo.acc} />}
                  {i === 0 && (
                    <Pieza
                      g={G.hoja}
                      e={pintura('#f4f1e8', 0.9)}
                      p={[0.12, -0.3, -0.03]}
                      visible={false}
                      parte={hoja}
                    />
                  )}
                  {i === 1 && (
                    <Pieza
                      g={G.telefono}
                      e={pintura('#22262c', 0.35)}
                      p={[-0.02, -0.4, -0.03]}
                      visible={false}
                      parte={telefono}
                    />
                  )}
                  {i === 1 && (
                    <Pieza
                      g={G.taza}
                      e={pintura('#eef0f2', 0.4)}
                      p={[0, -0.33, 0.06]}
                      visible={tieneTaza}
                      parte={taza}
                    />
                  )}
                </group>
              </group>
            ))}
            <group key={`espalda-${clave}`} ref={congelar}>
              <AccesoriosEspalda a={atuendo} />
              <AccesoriosRegistrados ancla="columna" acc={atuendo.acc} />
            </group>
            <group ref={cabeza} position={[0, 0.83, 0]}>
              <group key={`cabeza-${clave}`} ref={congelar}>
                {calabaza ? (
                  <CabezaCalabaza />
                ) : (
                  <>
                    <Pieza g={G.cabeza} e={estilos.piel} />
                    {conPelo && <Pelo a={atuendo} e={estilos.pelo} />}
                  </>
                )}
                <AccesoriosCabeza a={atuendo} />
                <AccesoriosRegistrados ancla="cabeza" acc={atuendo.acc} />
              </group>
              {!calabaza && (
                <Pieza
                  g={G.cara}
                  e={estiloCara()}
                  p={[0, 0, 0.212]}
                  celda={celdaCara}
                  parte={cara}
                />
              )}
              <Pieza
                g={G.icono}
                e={estiloIcono()}
                p={[0, alturaIcono, 0]}
                visible={false}
                cartel
                parte={icono}
              />
              {conEtiqueta && (
                <Html
                  position={[0, 0.95, 0]}
                  center
                  zIndexRange={ficha ? [21, 1] : [20, 0]}
                  style={{ pointerEvents: 'none' }}
                >
                  <div style={{ ...ESTILO_ETIQUETA, ...(ficha ? {} : ESTILO_NOMBRE), borderTop: `2px solid ${agente.color ?? '#f0a848'}` }}>
                    {agente.nombre}
                    {ficha && agente.rol && <div style={ESTILO_CARGO}>{agente.rol}</div>}
                  </div>
                </Html>
              )}
            </group>
          </group>
        </group>
      </group>
      <group ref={anillo} visible={false} />
    </ProveedorPartes>
  );
}

const ESTILO_ETIQUETA = {
  background: 'rgba(18,20,24,0.9)',
  color: '#eef0f2',
  font: '600 12px/1 system-ui, sans-serif',
  padding: '6px 10px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  transform: 'translateY(-14px)',
  textAlign: 'center',
} as const;

/** Solo el nombre, más discreto (modo «siempre» sin mouse encima). */
const ESTILO_NOMBRE = {
  background: 'rgba(18,20,24,0.62)',
  font: '600 10px/1 system-ui, sans-serif',
  padding: '4px 7px',
  borderRadius: 6,
} as const;

const ESTILO_CARGO = {
  font: '400 11px/1.3 system-ui, sans-serif',
  color: '#a0a7b0',
  marginTop: 4,
  maxWidth: 220,
  whiteSpace: 'normal',
} as const;
