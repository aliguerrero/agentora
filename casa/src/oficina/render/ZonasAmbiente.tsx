import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BackSide } from 'three';
import { plano } from '../mansion/plano';
import { ambienteBajoRayo, esDobleToque, puntoDeEnfoque } from './zonas';
import type { Toque, Vec3 } from './zonas';

/** Píxeles de arrastre a partir de los cuales el gesto es una órbita y no un toque. */
const UMBRAL_ARRASTRE = 6;
/** Radio (m) de la esfera de toque: más allá de la cámara más lejana, así la cámara siempre queda dentro. */
const RADIO_ESFERA = 300;

interface Props {
  /** Toque sobre un ambiente (`id`) o fuera de la casa (`null`). */
  onToque: (id: string | null) => void;
  /** Doble toque o doble clic: el punto del mundo al que se quiere enfocar. */
  onDobleToque: (punto: Vec3) => void;
}

/**
 * Capta el toque que entra a un ambiente y el doble toque que enfoca un punto. Es una esfera
 * invisible que rodea la escena y se toca por dentro (no se dibuja): desde cualquier lado de
 * la órbita queda detrás de todo, y el rayo del toque se cruza con las cajas de los ambientes
 * en `ambienteBajoRayo`. Las personas y todo lo que esté delante lo atienden primero y
 * detienen el evento, así que tocar a alguien lo selecciona sin entrar al ambiente.
 */
export function ZonasAmbiente({ onToque, onDobleToque }: Props) {
  const pulsado = useRef<{ x: number; y: number } | null>(null);
  const anterior = useRef<Toque | null>(null);

  const alBajar = (e: ThreeEvent<PointerEvent>) => {
    if (!e.nativeEvent.isPrimary) return;
    pulsado.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };
  const alSoltar = (e: ThreeEvent<PointerEvent>) => {
    const inicio = pulsado.current;
    pulsado.current = null;
    if (!inicio) return;
    const { clientX: x, clientY: y } = e.nativeEvent;
    if (Math.hypot(x - inicio.x, y - inicio.y) > UMBRAL_ARRASTRE) return;
    e.stopPropagation();
    const toque = { t: performance.now(), x, y };
    const doble = esDobleToque(anterior.current, toque);
    anterior.current = doble ? null : toque;
    onToque(ambienteBajoRayo(e.ray.origin, e.ray.direction, plano.ambientes)?.id ?? null);
    if (!doble) return;
    const punto = puntoDeEnfoque(e.ray.origin, e.ray.direction, plano.ambientes);
    if (punto) onDobleToque(punto);
  };

  return (
    <mesh onPointerDown={alBajar} onPointerUp={alSoltar}>
      <sphereGeometry args={[RADIO_ESFERA, 8, 6]} />
      <meshBasicMaterial visible={false} side={BackSide} />
    </mesh>
  );
}
