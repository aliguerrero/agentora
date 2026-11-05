import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, QuadraticBezierCurve3, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import type { Group, Mesh, Texture } from 'three';
import { NIVEL_Y } from '../../mansion/plano';

export type EstadoVisualMotor = 'trabajando' | 'libre' | 'reserva' | 'limite' | 'apagado';

export interface MotorCielo {
  id: string;
  nombre: string;
  /** Color propio del motor. */
  color: string;
  estado: EstadoVisualMotor;
  /** Trabajos corriendo ahora mismo con este motor. */
  trabajos: number;
  /** % de uso de la última lectura vigente; null si no hay. */
  uso: number | null;
  logo: string | null;
}

const TEXTO_ESTADO: Record<EstadoVisualMotor, string> = {
  trabajando: 'trabajando',
  libre: 'libre',
  reserva: 'en reserva',
  limite: 'en límite',
  apagado: 'apagado',
};
const COLOR_RESERVA = '#f0a848';
const COLOR_LIMITE = '#e5484d';
const COLOR_APAGADO = '#34373c';
const METAL = '#2b2825';
const COBRE = '#a0613c';

const MAX_PULSOS = 6;
/** Vueltas por segundo de un pulso a lo largo del cable. */
const VELOCIDAD_PULSO = 0.42;
const FLOTAR = 0.08;

// Sobre la azotea, a cada lado de la torre, donde el cielo queda libre en la vista general.
const LADOS = [-1, 1] as const;
const ALTURA_MOTOR = NIVEL_Y.torre + 2.9;
const ALTURA_MASTIL = 1.1;
const ESCALA_NAVE = 1.45;
const X_NAVE = 7.4;
/** El mástil va hacia afuera: junto a la torre lo taparían el letrero y el logo de la fachada. */
const X_MASTIL = 10.2;

const colorDeLuz = (m: MotorCielo) => (m.estado === 'reserva' ? COLOR_RESERVA : m.estado === 'limite' ? COLOR_LIMITE : m.estado === 'apagado' ? COLOR_APAGADO : m.color);
const RPM: Record<EstadoVisualMotor, number> = { trabajando: 20, libre: 4, reserva: 4, limite: 0, apagado: 0 };

function pintarSinLogo(m: Pick<MotorCielo, 'nombre' | 'color'>): CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 256;
  const g = lienzo.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = m.color;
  g.beginPath();
  g.roundRect(8, 8, 240, 240, 48);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '700 150px system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(m.nombre.charAt(0), 128, 138);
  return new CanvasTexture(lienzo);
}

let halo: CanvasTexture | null = null;
function texturaHalo(): CanvasTexture {
  if (halo) return halo;
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 128;
  const g = lienzo.getContext('2d') as CanvasRenderingContext2D;
  const d = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(0.35, 'rgba(255,255,255,.35)');
  d.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  halo = new CanvasTexture(lienzo);
  return halo;
}

/** El logo del motor, o un distintivo con su inicial si este equipo no tiene el archivo. */
function useTexturaLogo(m: MotorCielo): Texture | null {
  const [textura, setTextura] = useState<Texture | null>(null);
  useEffect(() => {
    let vivo = true;
    let actual: Texture | null = null;
    const poner = (t: Texture) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      actual = t;
      if (vivo) setTextura(t);
      else t.dispose();
    };
    if (m.logo) new TextureLoader().load(m.logo, poner, undefined, () => poner(pintarSinLogo(m)));
    else poner(pintarSinLogo(m));
    return () => {
      vivo = false;
      actual?.dispose();
    };
  }, [m.logo, m.nombre, m.color]);
  return textura;
}

interface PropsMotor {
  motor: MotorCielo;
  lado: number;
  movimiento: number;
  onTocar?: () => void;
}

function Motor({ motor, lado, movimiento, onTocar }: PropsMotor) {
  const eventosListos = useThree((s) => !!s.events.connected);
  const [encima, setEncima] = useState(false);
  const nave = useRef<Group>(null);
  const helices = useRef<(Mesh | null)[]>([]);
  const pulsos = useRef<(Mesh | null)[]>([]);
  const aura = useRef<Mesh>(null);
  const logo = useTexturaLogo(motor);
  const luz = colorDeLuz(motor);
  const trabajando = motor.estado === 'trabajando';
  // Con «reducir movimiento» no hay pulsos: el cable queda encendido, fijo.
  const hayPulsos = trabajando && movimiento > 0;
  const cantidad = hayPulsos ? Math.min(MAX_PULSOS, motor.trabajos + 1) : 0;

  const posicion = useMemo(() => new Vector3(lado * X_NAVE, ALTURA_MOTOR, -1), [lado]);
  // Del vientre de la nave al mástil de la azotea, con el cable algo caído.
  const curva = useMemo(() => {
    const desde = new Vector3(lado * X_NAVE, ALTURA_MOTOR - 0.3, -1);
    const hasta = new Vector3(lado * X_MASTIL, NIVEL_Y.torre + ALTURA_MASTIL, 0.6);
    const medio = desde.clone().lerp(hasta, 0.5);
    medio.y -= 0.7;
    return new QuadraticBezierCurve3(desde, medio, hasta);
  }, [lado]);

  useEffect(() => {
    if (!encima) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [encima]);

  const fase = lado > 0 ? 2.1 : 0;
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (nave.current && movimiento > 0) nave.current.position.y = ALTURA_MOTOR + Math.sin(t * 0.8 + fase) * FLOTAR;
    const giro = RPM[motor.estado] * delta * (movimiento > 0 ? 1 : 0);
    for (const h of helices.current) if (h) h.rotation.y += giro;
    for (let i = 0; i < cantidad; i++) {
      const p = pulsos.current[i];
      if (p) curva.getPoint((t * VELOCIDAD_PULSO + i / cantidad) % 1, p.position);
    }
    if (aura.current && hayPulsos) aura.current.scale.setScalar(3.1 + Math.sin(t * 3) * 0.25);
  });

  const trabajosTexto = motor.trabajos === 1 ? '1 trabajo en marcha' : `${motor.trabajos} trabajos en marcha`;
  const brillo = motor.estado === 'apagado' ? 0.14 : trabajando ? 1 : 0.45;

  return (
    <group>
      {/* Mástil en la azotea, donde entra el cable. */}
      <mesh position={[lado * X_MASTIL, NIVEL_Y.torre + ALTURA_MASTIL / 2, 0.6]} raycast={() => null}>
        <cylinderGeometry args={[0.035, 0.06, ALTURA_MASTIL, 8]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[lado * X_MASTIL, NIVEL_Y.torre + ALTURA_MASTIL, 0.6]} raycast={() => null}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshBasicMaterial color={luz} toneMapped={false} />
      </mesh>

      <mesh raycast={() => null}>
        <tubeGeometry args={[curva, 32, trabajando ? 0.036 : 0.024, 6, false]} />
        <meshBasicMaterial color={luz} transparent opacity={brillo} toneMapped={false} />
      </mesh>
      {Array.from({ length: cantidad }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            pulsos.current[i] = m;
          }}
          raycast={() => null}
        >
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshBasicMaterial color="#fff6e6" toneMapped={false} />
        </mesh>
      ))}

      <group
        ref={nave}
        position={posicion}
        scale={ESCALA_NAVE}
        onClick={(e) => {
          e.stopPropagation();
          onTocar?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setEncima(true);
        }}
        onPointerOut={() => setEncima(false)}
      >
        {motor.estado !== 'apagado' && (
          <mesh ref={aura} position={[0, 0, -0.7]} scale={trabajando ? 3.1 : 2.3} raycast={() => null}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={texturaHalo()} color={luz} transparent opacity={trabajando ? 0.55 : 0.16} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
        )}
        {/* Casco: metal oscuro y cobre, como la cúpula de la casa. */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.42, 1.3, 6, 16]} />
          <meshStandardMaterial color={METAL} metalness={0.65} roughness={0.42} />
        </mesh>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <torusGeometry args={[0.43, 0.03, 8, 28]} />
            <meshStandardMaterial color={COBRE} metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        {/* Anillo de estado bajo el casco. */}
        <mesh position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[0.3, 0.035, 8, 28]} />
          <meshBasicMaterial color={luz} toneMapped={false} />
        </mesh>
        {/* Rotores a los costados. */}
        {[-1.32, 1.32].map((x, i) => (
          <group key={x} position={[x, 0.36, 0]}>
            <mesh raycast={() => null}>
              <cylinderGeometry args={[0.05, 0.07, 0.34, 10]} />
              <meshStandardMaterial color={COBRE} metalness={0.8} roughness={0.35} />
            </mesh>
            <mesh
              ref={(m) => {
                helices.current[i] = m;
              }}
              position={[0, 0.18, 0]}
              raycast={() => null}
            >
              <boxGeometry args={[0.95, 0.018, 0.07]} />
              <meshStandardMaterial color="#14130f" metalness={0.4} roughness={0.6} />
            </mesh>
          </group>
        ))}
        {logo && (
          <mesh position={[0, 0.02, 0.5]}>
            <planeGeometry args={[1.25, 1.25]} />
            <meshBasicMaterial map={logo} transparent alphaTest={0.05} toneMapped={false} color={motor.estado === 'apagado' ? '#5a5a5a' : '#ffffff'} />
          </mesh>
        )}
        {eventosListos && (
          <Html position={[0, -0.8, 0.5]} center distanceFactor={12} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
            <div className="motor-etiqueta" style={{ ['--c' as string]: luz }}>
              <b>{motor.nombre}</b> · {TEXTO_ESTADO[motor.estado]}
              {trabajando ? ` (${motor.trabajos})` : ''}
              {encima && (
                <small>
                  {trabajosTexto}
                  <br />
                  {motor.uso === null ? 'Uso: sin lectura reciente' : `Uso: ${motor.uso} %`}
                  <br />
                  Toca para abrir Motores
                </small>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

interface Props {
  motores: readonly MotorCielo[];
  movimiento: number;
  onTocar?: () => void;
}

/**
 * Los motores de la casa vuelan sobre ella, unidos por un cable a la azotea. Los pulsos cuentan
 * trabajos reales en ejecución con ese motor; no representan datos transmitidos.
 */
export function MotoresCielo({ motores, movimiento, onTocar }: Props) {
  return (
    <>
      {motores.slice(0, LADOS.length).map((m, i) => (
        <Motor key={m.id} motor={m} lado={m.id === 'codex' ? 1 : m.id === 'claude' ? -1 : LADOS[i]} movimiento={movimiento} onTocar={onTocar} />
      ))}
    </>
  );
}
