import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Object3D, Vector3 } from 'three';
import type { InstancedMesh } from 'three';
import type { SenalAgente } from '../tipos';
import type { Rig } from './animador';

const MAX = 48;
const COLA = 18;
interface Viaje { evento: SenalAgente; inicio: number }

/** Un solo draw call para las cabezas luminosas y sus estelas. Solo anima entregas nuevas. */
export function Senales({ eventos, rigs, patricia, reducir, proyecto }: {
  eventos: readonly SenalAgente[];
  rigs: MutableRefObject<Map<string, Rig>>;
  patricia: Vector3;
  reducir: boolean;
  proyecto?: string;
}) {
  const malla = useRef<InstancedMesh>(null);
  const viajes = useRef<Viaje[]>([]);
  const vistos = useRef<Set<string> | null>(null);
  const contexto = useRef(proyecto);
  const herramienta = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const desde = useMemo(() => new Vector3(), []);
  const hasta = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (!vistos.current || contexto.current !== proyecto) {
      contexto.current = proyecto;
      vistos.current = new Set(eventos.map((e) => e.id));
      viajes.current = [];
      return;
    }
    const nuevos = eventos.filter((e) => !vistos.current!.has(e.id));
    for (const e of eventos) vistos.current.add(e.id);
    if (vistos.current.size > 2000) vistos.current = new Set([...vistos.current].slice(-1000));
    const ahora = performance.now();
    viajes.current = [...viajes.current.filter((v) => ahora - v.inicio < 4200), ...nuevos.map((evento, i) => ({ evento, inicio: ahora + (i % 12) * 70 }))].slice(-MAX);
  }, [eventos, proyecto]);
  useFrame(() => {
    const mesh = malla.current;
    if (!mesh) return;
    let n = 0;
    const ahora = performance.now();
    for (const v of viajes.current) {
      const t = (ahora - v.inicio) / 3200;
      if (t < 0 || t > 1.2) continue;
      const origen = v.evento.de === 'patricia' ? patricia : rigs.current.get(v.evento.de)?.raiz.position;
      const destino = rigs.current.get(v.evento.para)?.raiz.position;
      if (!origen || !destino) continue;
      desde.copy(origen); hasta.copy(destino);
      if (v.evento.de !== 'patricia') desde.y += 1.4;
      hasta.y += 1.4;
      const arco = Math.min(4, desde.distanceTo(hasta) * 0.2 + 0.6);
      for (let k = 0; k < (reducir ? 1 : COLA); k++) {
        const u = reducir ? 1 : Math.max(0, Math.min(1, t - k * 0.012));
        herramienta.position.lerpVectors(desde, hasta, u);
        herramienta.position.y += Math.sin(u * Math.PI) * arco;
        const vida = Math.max(0, Math.min(1, (1.2 - t) * 5));
        herramienta.scale.setScalar((k === 0 ? 0.12 : 0.075 * (1 - k / COLA)) * vida * (reducir ? 2 : 1));
        herramienta.updateMatrix();
        mesh.setMatrixAt(n, herramienta.matrix);
        color.set(v.evento.de === 'patricia' ? '#ffe6ac' : '#8de9ff').multiplyScalar((1 - k / COLA) * vida);
        mesh.setColorAt(n++, color);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={malla} args={[undefined, undefined, MAX * COLA]} count={0} frustumCulled={false} raycast={() => null} renderOrder={5}>
    <sphereGeometry args={[1, 8, 6]} />
    <meshBasicMaterial transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} depthTest={false} toneMapped={false} />
  </instancedMesh>;
}
