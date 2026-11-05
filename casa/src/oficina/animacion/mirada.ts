export const LIMITE_YAW = (70 * Math.PI) / 180;
export const LIMITE_PITCH = (25 * Math.PI) / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Mirada {
  /** Giro de la cabeza respecto del cuerpo (rad). */
  yaw: number;
  /** Cabeceo (rad): positivo = hacia arriba. */
  pitch: number;
}

const limitar = (valor: number, limite: number) => Math.max(-limite, Math.min(limite, valor));
const envolver = (angulo: number) =>
  ((((angulo + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Hacia dónde debe girar la cabeza para mirar un objetivo. El yaw es relativo al
 * cuerpo (`yawCuerpo`, mismo convenio que el prototipo: atan2(x, z)) y se limita a ±70°;
 * el pitch a ±25°. Escribe en `out` y lo devuelve (se llama por persona y por cuadro).
 */
export function calcularMirada(
  entrada: { posCabeza: Vec3; yawCuerpo: number; objetivo: Vec3 },
  out: Mirada,
): Mirada {
  const dx = entrada.objetivo.x - entrada.posCabeza.x;
  const dy = entrada.objetivo.y - entrada.posCabeza.y;
  const dz = entrada.objetivo.z - entrada.posCabeza.z;
  out.yaw = limitar(envolver(Math.atan2(dx, dz) - entrada.yawCuerpo), LIMITE_YAW);
  out.pitch = limitar(Math.atan2(dy, Math.hypot(dx, dz)), LIMITE_PITCH);
  return out;
}

/** Suavizado exponencial independiente de la tasa de cuadros. `tau` ≤ 0 salta al objetivo. */
export function suavizar(actual: number, objetivo: number, dt: number, tau: number): number {
  if (tau <= 0) return objetivo;
  return actual + (objetivo - actual) * (1 - Math.exp(-dt / tau));
}

/** Distancia (m) a la que quien espera una decisión empieza a seguir al orbe con la mirada. */
export const UMBRAL_ORBE_ENTRA = 6;
/** Distancia a la que lo suelta (mayor que la de entrada, para que no parpadee en el borde). */
export const UMBRAL_ORBE_SALE = 8;
const SEGUNDOS_EN_ATENDER = 0.8;
const SEGUNDOS_EN_SOLTAR = 0.6;

/**
 * Atención (0..1) hacia el orbe de Jules: sube con retardo mientras pasa cerca y baja al
 * alejarse; entre los dos umbrales conserva lo que hacía. Quien la usa mezcla su mirada normal
 * con la dirigida al orbe (que ya limita `calcularMirada`).
 */
export function atencionOrbe(atencion: number, distancia: number, dt: number): number {
  const atiende =
    distancia < UMBRAL_ORBE_ENTRA ? true : distancia > UMBRAL_ORBE_SALE ? false : atencion > 0.5;
  return atiende
    ? Math.min(1, atencion + dt / SEGUNDOS_EN_ATENDER)
    : Math.max(0, atencion - dt / SEGUNDOS_EN_SOLTAR);
}
