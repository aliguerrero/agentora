import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Object3D } from 'three';
import type { Group, InstancedMesh, Mesh } from 'three';

/** Una sala que se está levantando. La casa no la tiene todavía: esto es lo único que se ve de ella. */
export interface ObraEnCurso {
  id: string;
  nombre: string;
  lado: 'este' | 'oeste';
  y: number;
  alto: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Milisegundos desde 1970: servidor y navegador corren en el mismo equipo. */
  inicio: number;
  fin: number;
}

const HORMIGON = '#8f8c86';
const ACERO = '#6d6f72';
const AMBAR = '#f0a848';
const CASCO = '#f2c230';
const CHALECO = '#e8742a';
const PIEL = '#c99a78';
const TINTA = '#23262b';

const SEPARACION_PARAL = 1.7;
const SEPARACION_LARGUERO = 1.3;
const GROSOR_PARAL = 0.07;
const GROSOR_LARGUERO = 0.045;
const SEPARACION_FACHADA = 0.28;
const SOBRE_EL_TECHO = 0.9;
const LOSA = 0.12;
const LADO_PILAR = 0.26;
const MURO = 0.14;
const VELOCIDAD_PASO = 0.45;

type Pieza = [x: number, y: number, z: number, ancho: number, alto: number, fondo: number];

const puntos = (a: number, b: number, paso: number): number[] => {
  const n = Math.max(1, Math.round((b - a) / paso));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
};

/** Paráles desde el suelo y largueros por las tres caras que dan afuera. */
function andamioDe(o: ObraEnCurso): Pieza[] {
  const afuera = o.lado === 'este' ? o.x1 + SEPARACION_FACHADA : o.x0 - SEPARACION_FACHADA;
  const pegado = o.lado === 'este' ? o.x0 : o.x1;
  const z0 = o.z0 - SEPARACION_FACHADA;
  const z1 = o.z1 + SEPARACION_FACHADA;
  const techo = o.y + o.alto + SOBRE_EL_TECHO;
  const piezas: Pieza[] = [];
  const paral = (x: number, z: number) => piezas.push([x, techo / 2, z, GROSOR_PARAL, techo, GROSOR_PARAL]);
  const costado = puntos(pegado, afuera, SEPARACION_PARAL);
  for (const z of puntos(z0, z1, SEPARACION_PARAL)) paral(afuera, z);
  for (const x of costado.slice(0, -1)) {
    paral(x, z0);
    paral(x, z1);
  }
  const anchoX = Math.abs(afuera - pegado);
  const medioX = (afuera + pegado) / 2;
  for (let y = SEPARACION_LARGUERO; y <= techo; y += SEPARACION_LARGUERO) {
    piezas.push([afuera, y, (z0 + z1) / 2, GROSOR_LARGUERO, GROSOR_LARGUERO, z1 - z0]);
    piezas.push([medioX, y, z0, anchoX, GROSOR_LARGUERO, GROSOR_LARGUERO]);
    piezas.push([medioX, y, z1, anchoX, GROSOR_LARGUERO, GROSOR_LARGUERO]);
  }
  return piezas;
}

function Andamio({ obra }: { obra: ObraEnCurso }) {
  const malla = useRef<InstancedMesh>(null);
  const piezas = useMemo(() => andamioDe(obra), [obra.x0, obra.x1, obra.z0, obra.z1, obra.y, obra.alto, obra.lado]);
  useLayoutEffect(() => {
    const m = malla.current;
    if (!m) return;
    const o = new Object3D();
    piezas.forEach(([x, y, z, a, h, f], i) => {
      o.position.set(x, y, z);
      o.scale.set(a, h, f);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [piezas]);
  return (
    <instancedMesh ref={malla} args={[undefined, undefined, piezas.length]} raycast={() => null} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={ACERO} metalness={0.55} roughness={0.5} />
    </instancedMesh>
  );
}

/** El ingeniero en la obra, con casco y chaleco, yendo y viniendo por la sala. */
function Ingeniero({ obra, movimiento }: { obra: ObraEnCurso; movimiento: number }) {
  const cuerpo = useRef<Group>(null);
  const x0 = obra.x0 + 0.8;
  const x1 = obra.x1 - 0.8;
  const z = obra.z1 - 1;
  useFrame(({ clock }) => {
    if (!cuerpo.current || movimiento <= 0) return;
    const fase = (clock.elapsedTime * VELOCIDAD_PASO) % 2;
    const ida = fase < 1;
    cuerpo.current.position.x = x0 + (x1 - x0) * (ida ? fase : 2 - fase);
    cuerpo.current.rotation.y = ida ? Math.PI / 2 : -Math.PI / 2;
    cuerpo.current.position.y = obra.y + Math.abs(Math.sin(clock.elapsedTime * 6)) * 0.04;
  });
  return (
    <group ref={cuerpo} position={[(x0 + x1) / 2, obra.y, z]} scale={1.15}>
      {[-0.1, 0.1].map((d) => (
        <mesh key={d} position={[d, 0.42, 0]} raycast={() => null}>
          <boxGeometry args={[0.14, 0.84, 0.16]} />
          <meshStandardMaterial color={TINTA} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 1.13, 0]} raycast={() => null}>
        <boxGeometry args={[0.42, 0.6, 0.24]} />
        <meshStandardMaterial color={CHALECO} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.57, 0]} raycast={() => null}>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color={PIEL} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.65, 0]} raycast={() => null}>
        <sphereGeometry args={[0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={CASCO} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.65, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.21, 0.21, 0.02, 16]} />
        <meshStandardMaterial color={CASCO} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Obra({ obra, movimiento }: { obra: ObraEnCurso; movimiento: number }) {
  const eventosListos = useThree((s) => !!s.events.connected);
  const muros = useRef<Group>(null);
  const cielo = useRef<Mesh>(null);
  const baliza = useRef<Mesh>(null);
  const carga = useRef<Group>(null);
  const [porcentaje, setPorcentaje] = useState(0);

  const { x0, x1, z0, z1, y, alto } = obra;
  const ancho = x1 - x0;
  const fondo = z1 - z0;
  const medioX = (x0 + x1) / 2;
  const medioZ = (z0 + z1) / 2;
  const este = obra.lado === 'este';
  const afuera = este ? x1 : x0;
  const techoAndamio = y + alto + SOBRE_EL_TECHO;
  const xPolea = afuera + (este ? SEPARACION_FACHADA + 0.3 : -SEPARACION_FACHADA - 0.3);

  useFrame(({ clock }) => {
    const avance = Math.min(1, Math.max(0, (Date.now() - obra.inicio) / Math.max(1, obra.fin - obra.inicio)));
    const levantado = Math.max(0.03, avance);
    if (muros.current) muros.current.scale.y = levantado;
    if (cielo.current) cielo.current.position.y = y + alto * levantado;
    const n = Math.floor(avance * 100);
    if (n !== porcentaje) setPorcentaje(n);
    // Con «reducir movimiento» la obra sigue creciendo, que es información, pero nada oscila.
    if (movimiento <= 0) return;
    if (baliza.current) baliza.current.visible = Math.sin(clock.elapsedTime * 4) > -0.2;
    if (carga.current) carga.current.position.y = 0.4 + ((Math.sin(clock.elapsedTime * 0.5) + 1) / 2) * (techoAndamio - 1.2);
  });

  return (
    <group>
      {/* Losa ya vaciada. */}
      <mesh position={[medioX, y - LOSA / 2, medioZ]} raycast={() => null} receiveShadow castShadow>
        <boxGeometry args={[ancho, LOSA, fondo]} />
        <meshStandardMaterial color={HORMIGON} roughness={0.9} />
      </mesh>
      {/* Muro del fondo, muro exterior y pilares: suben con el avance. */}
      <group ref={muros} position={[0, y, 0]} scale={[1, 0.03, 1]}>
        <mesh position={[medioX, alto / 2, z0 + MURO / 2]} raycast={() => null} castShadow>
          <boxGeometry args={[ancho, alto, MURO]} />
          <meshStandardMaterial color={HORMIGON} roughness={0.92} />
        </mesh>
        <mesh position={[afuera + (este ? -MURO / 2 : MURO / 2), alto / 2, medioZ]} raycast={() => null} castShadow>
          <boxGeometry args={[MURO, alto, fondo]} />
          <meshStandardMaterial color={HORMIGON} roughness={0.92} />
        </mesh>
        {[x0 + LADO_PILAR / 2, x1 - LADO_PILAR / 2].map((x) => (
          <mesh key={x} position={[x, alto / 2, z1 - LADO_PILAR / 2]} raycast={() => null} castShadow>
            <boxGeometry args={[LADO_PILAR, alto, LADO_PILAR]} />
            <meshStandardMaterial color={HORMIGON} roughness={0.92} />
          </mesh>
        ))}
      </group>
      <mesh ref={cielo} position={[medioX, y, medioZ]} raycast={() => null}>
        <boxGeometry args={[ancho, LOSA, fondo]} />
        <meshStandardMaterial color={HORMIGON} roughness={0.9} />
      </mesh>

      <Andamio obra={obra} />

      {/* Malla de seguridad por fuera del andamio. */}
      <mesh position={[afuera + (este ? SEPARACION_FACHADA + 0.04 : -SEPARACION_FACHADA - 0.04), techoAndamio / 2, medioZ]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[fondo + 2 * SEPARACION_FACHADA, techoAndamio]} />
        <meshBasicMaterial color={AMBAR} transparent opacity={0.13} depthWrite={false} side={2} />
      </mesh>

      {/* Polea con su carga. */}
      <mesh position={[xPolea, techoAndamio / 2, z1]} raycast={() => null}>
        <boxGeometry args={[0.02, techoAndamio, 0.02]} />
        <meshStandardMaterial color={TINTA} />
      </mesh>
      <group ref={carga} position={[xPolea, 0.4, z1]}>
        <mesh raycast={() => null} castShadow>
          <boxGeometry args={[0.5, 0.34, 0.5]} />
          <meshStandardMaterial color="#a0613c" roughness={0.7} />
        </mesh>
      </group>

      <mesh ref={baliza} position={[afuera, techoAndamio + 0.1, z1]} raycast={() => null}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshBasicMaterial color={AMBAR} toneMapped={false} />
      </mesh>

      <Ingeniero obra={obra} movimiento={movimiento} />

      {eventosListos && (
        <Html position={[medioX, techoAndamio + 0.7, z1]} center distanceFactor={12} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className="motor-etiqueta" style={{ ['--c' as string]: AMBAR }}>
            <b>{obra.nombre}</b> · en obra {porcentaje} %
          </div>
        </Html>
      )}
    </group>
  );
}

interface Props {
  obras: readonly ObraEnCurso[];
  movimiento: number;
}

/**
 * Las salas en construcción: losa, muros que suben, andamios y el ingeniero en el sitio. El plano de
 * la casa no cambia hasta que la obra termina; entonces esto desaparece y la casa se rehace con la
 * sala de verdad.
 */
export function ObrasEnCurso({ obras, movimiento }: Props) {
  return (
    <>
      {obras.map((o) => (
        <Obra key={o.id} obra={o} movimiento={movimiento} />
      ))}
    </>
  );
}
