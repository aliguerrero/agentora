import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { NIVEL_Y } from '../mansion/plano';

/** Letrero LED de la fachada (Oficina DevBox): el proyecto en el que trabaja la casa. */
export interface Letrero {
  texto?: string;
  /** Línea pequeña sobre el texto, p. ej. «PROYECTO». */
  titulo?: string;
  /** Color de los LED (por defecto ámbar). */
  color?: string;
  onClick?: () => void;
  /** Logo de la casa: al lado del letrero, o solo si el letrero está apagado. */
  logo?: string | null;
}

// Sobre el borde frontal de la azotea del tercer piso, delante del observatorio (que está
// retranqueado hasta z = 2), centrado en el atrio.
const POSICION: [number, number, number] = [0, NIVEL_Y.torre + 0.55, 4.05];
/** Tamaño relativo a la distancia de la cámara (drei distanceFactor): crece al acercarse. */
const FACTOR_DISTANCIA = 12;

const CSS = `
.led-cartel{width:520px;box-sizing:border-box;padding:10px 16px 12px;border-radius:10px;background:#07080a;
  border:3px solid #23262b;box-shadow:0 0 0 2px #0b0c0e,0 6px 24px rgba(0,0,0,.6);cursor:pointer;user-select:none}
.led-titulo{font:700 13px/1 ui-monospace,Consolas,monospace;letter-spacing:.35em;opacity:.7;margin-bottom:8px;text-align:center}
.led-ventana{overflow:hidden;white-space:nowrap;position:relative;height:46px;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.led-texto{display:inline-block;font:800 42px/46px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:inherit;
  text-shadow:0 0 4px currentColor,0 0 12px currentColor,0 0 24px rgba(255,160,60,.45)}
.led-ventana::after{content:"";position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(90deg,rgba(7,8,10,.55) 1px,transparent 1px),linear-gradient(rgba(7,8,10,.55) 1px,transparent 1px);background-size:4px 4px}
.led-texto.mueve{padding-left:100%;animation:led-desliza var(--dur) linear infinite}
.led-fachada{position:relative}
.led-logo{box-sizing:border-box;display:block;width:98px;height:98px;padding:6px;border-radius:10px;object-fit:contain;background:#07080a;
  border:3px solid #23262b;box-shadow:0 0 0 2px #0b0c0e,0 6px 24px rgba(0,0,0,.6);user-select:none;pointer-events:none}
.led-fachada .led-cartel + .led-logo{position:absolute;top:50%;right:calc(100% + 12px);transform:translateY(-50%)}
.led-logo.solo{width:160px;height:160px}
.led-cartel:hover{border-color:#3a3f47}
@keyframes led-desliza{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:reduce){.led-texto.mueve{animation:none;padding-left:0}}
`;

export function LetreroLed({ texto, titulo = 'PROYECTO', color = '#ffb347', onClick, logo }: Letrero) {
  const largo = (texto?.length ?? 0) > 18;
  // Igual que las etiquetas de Persona: montar <Html> con los eventos ya conectados.
  const eventosListos = useThree((s) => !!s.events.connected);
  if (!eventosListos) return null;
  return (
    <group position={POSICION}>
      <Html center distanceFactor={FACTOR_DISTANCIA} zIndexRange={[15, 0]} style={{ pointerEvents: 'auto' }}>
        <style>{CSS}</style>
        <div className="led-fachada">
        {texto !== undefined && (
        <div
          className="led-cartel"
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          aria-label={`${titulo}: ${texto}`}
          title={onClick ? 'Cambiar de proyecto' : undefined}
          onClick={onClick}
          onKeyDown={(e) => {
            if (onClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onClick();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ color }}
        >
          <div className="led-titulo">{titulo}</div>
          <div className="led-ventana" style={{ textAlign: largo ? 'left' : 'center' }}>
            <span className={largo ? 'led-texto mueve' : 'led-texto'} style={{ ['--dur' as string]: `${Math.max(8, texto.length * 0.45)}s` }}>
              {texto}
            </span>
          </div>
        </div>
        )}
        {logo && <img className={texto === undefined ? 'led-logo solo' : 'led-logo'} src={logo} alt="Logo de la casa" />}
        </div>
      </Html>
    </group>
  );
}
