import type { Punto3 } from '../camara';

/** Altura (m, a escala 1) del centro del cuerpo de Jules sobre sus pies: ahí flota el orbe. */
export const CENTRO_CUERPO = 0.95;
/** Semiancho (m) de su silueta con brazos y tableta: lo que debe caber dentro del encuadre. */
export const SEMIANCHO_CUERPO = 0.42;
/** Dónde queda su centro en pantalla (NDC x, 1 = borde derecho): tercio derecho, fuera del cono. */
const NDC_X_MAX = 0.74;
/** Su silueta nunca pasa de aquí (NDC x): deja ≥ 6 % del ancho de margen al borde. */
const NDC_BORDE = 0.88;
/** Cuánto más al fondo que el enfocado puede ponerse para caber en encuadres angostos. */
const PROFUNDIDAD_MAX = 4;

/**
 * Dónde se para Jules mientras la cámara mira `cabeza`: en el tercio derecho del encuadre, en
 * el piso `pisoY`, con toda su silueta dentro del cuadro y fuera del cono cámara→cabeza.
 * Si el encuadre es angosto (retrato, cámara cercana) retrocede en profundidad hasta caber.
 * Escribe en `salida` el centro de su cuerpo (pies + `CENTRO_CUERPO`).
 */
export function puntoDePie(
  cabeza: Punto3,
  camara: Punto3,
  fovVertical: number,
  aspecto: number,
  pisoY: number,
  salida: Punto3,
): Punto3 {
  const fx = cabeza.x - camara.x;
  const fy = cabeza.y - camara.y;
  const fz = cabeza.z - camara.z;
  const distancia = Math.hypot(fx, fy, fz) || 1;
  const adelanteY = fy / distancia;
  const horizontal = Math.hypot(fx, fz) || 1;
  const hx = fx / horizontal;
  const hz = fz / horizontal;
  // Derecha de la cámara en planta (adelante × arriba).
  const rx = -hz;
  const rz = hx;
  const medioAncho = distancia * Math.tan((fovVertical * Math.PI) / 360) * aspecto;
  // Profundidad: la del enfocado, o más al fondo hasta que la silueta quepa con el centro en NDC_X_MAX.
  const holgura = NDC_BORDE - NDC_X_MAX;
  const k = Math.min(PROFUNDIDAD_MAX, Math.max(1, SEMIANCHO_CUERPO / holgura / medioAncho));
  const ndcX = Math.min(NDC_X_MAX, NDC_BORDE - SEMIANCHO_CUERPO / (k * medioAncho));
  const profundidad = k * distancia;
  const centroY = pisoY + CENTRO_CUERPO;
  // Distancia en planta que da esa profundidad medida a lo largo del eje de la cámara.
  const avance = (profundidad - (centroY - camara.y) * adelanteY) / (horizontal / distancia);
  const lateral = ndcX * k * medioAncho;
  salida.x = camara.x + hx * avance + rx * lateral;
  salida.y = centroY;
  salida.z = camara.z + hz * avance + rz * lateral;
  return salida;
}

/** Rotación Y con la que Jules mira a la cámara; `desvio` la gira hacia el costado del enfocado. */
export const yawHaciaCamara = (desde: Punto3, camara: Punto3, desvio: number) =>
  Math.atan2(camara.x - desde.x, camara.z - desde.z) + desvio;
