import type { PresenciaJules } from '../../animacion/presencia';

/** Pose de las partes móviles de Jules (radianes salvo `boca`). */
export interface PoseJules {
  cabezaPitch: number;
  cabezaYaw: number;
  cabezaRoll: number;
  /** Brazo libre: hombro adelante (negativo = sube), apertura hacia afuera y codo (negativo = dobla). */
  hombroX: number;
  abduccion: number;
  codo: number;
  /** Brazo de la tableta: cuánto la sube hacia la cara (0..1). */
  tableta: number;
  /** Apertura de la boca (0 cerrada .. 1 abierta). */
  boca: number;
}

export const crearPose = (): PoseJules => ({
  cabezaPitch: 0,
  cabezaYaw: 0,
  cabezaRoll: 0,
  hombroX: 0.05,
  abduccion: 0.08,
  codo: -0.12,
  tableta: 0,
  boca: 0,
});

/** Ritmo silábico sintético (0..1) para cuando la voz no entrega nivel. */
export const nivelSintetico = (t: number) =>
  Math.max(0, Math.sin(t * 9)) * (0.65 + 0.35 * Math.sin(t * 3.3 + 1));

/**
 * Pose objetivo según lo que hace Jules. Al hablar, la amplitud del gesto y la apertura de la
 * boca crecen con `nivel` (0..1); `amplitud` (0..1) atenúa todo con movimiento reducido.
 */
export function gestoJules(
  salida: PoseJules,
  presencia: PresenciaJules,
  nivel: number,
  t: number,
  amplitud: number,
): void {
  const n = Math.min(Math.max(nivel, 0), 1);
  const a = Math.min(Math.max(amplitud, 0), 1);
  const respira = Math.sin(t * 0.9);
  // Reposo: hombros sueltos, mirada ligeramente viva.
  let pitch = 0.02 * respira;
  let yaw = 0.05 * Math.sin(t * 0.4);
  let roll = 0;
  let hombroX = 0.05;
  let abduccion = 0.08;
  let codo = -0.12;
  let tableta = 0;
  let boca = 0;
  switch (presencia) {
    case 'hablando': {
      const fuerza = n * a;
      yaw = fuerza * 0.2 * Math.sin(t * 1.7);
      pitch = 0.03 + fuerza * 0.1 * Math.sin(t * 2.3);
      roll = fuerza * 0.06 * Math.sin(t * 1.3 + 1);
      const vaiven = 0.5 + 0.5 * Math.sin(t * 2.6);
      hombroX = 0.05 - fuerza * (0.55 + 0.45 * vaiven);
      abduccion = 0.08 + fuerza * 0.35 * (0.5 + 0.5 * Math.sin(t * 1.9 + 2));
      codo = -0.12 - fuerza * (0.7 + 0.5 * vaiven);
      boca = n;
      break;
    }
    case 'escuchando':
      roll = 0.2 * a;
      pitch = 0.04;
      yaw = 0.03 * Math.sin(t * 0.6);
      break;
    case 'pensando':
      pitch = 0.42 * a;
      yaw = 0.3 * a;
      tableta = a;
      break;
    case 'esperando_decision':
      roll = 0.1 * a;
      pitch = 0.05;
      codo = -0.5;
      hombroX = -0.25;
      break;
    case 'reposo':
      break;
  }
  salida.cabezaPitch = pitch;
  salida.cabezaYaw = yaw;
  salida.cabezaRoll = roll;
  salida.hombroX = hombroX;
  salida.abduccion = abduccion;
  salida.codo = codo;
  salida.tableta = tableta;
  salida.boca = boca;
}

const CAMPOS_POSE = [
  'cabezaPitch',
  'cabezaYaw',
  'cabezaRoll',
  'hombroX',
  'abduccion',
  'codo',
  'tableta',
] as const;

/** Acerca `actual` a `objetivo` (k = 0..1 por cuadro); la boca sigue la voz sin retardo. */
export function suavizarPose(actual: PoseJules, objetivo: PoseJules, k: number): void {
  for (const campo of CAMPOS_POSE) actual[campo] += (objetivo[campo] - actual[campo]) * k;
  actual.boca = objetivo.boca;
}
