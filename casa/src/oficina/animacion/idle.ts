import type { Azar } from '../azar';

/** Variantes de base, con el peso que tienen cuando el rol no declara personalidad. */
export const VARIANTES_IDLE = [
  { nombre: 'respirar', peso: 5 },
  { nombre: 'mirar_alrededor', peso: 3 },
  { nombre: 'tamborilear', peso: 2 },
  { nombre: 'estirarse', peso: 1 },
  { nombre: 'rascarse_cabeza', peso: 1 },
] as const;

/**
 * Todas las variantes. Las de personalidad se eligen según el perfil del rol; `probar_luz`,
 * `senalar` y `asentir` las fuerzan las pausas y las interacciones, no el azar.
 */
export const TODAS_LAS_VARIANTES = [
  'respirar',
  'mirar_alrededor',
  'tamborilear',
  'estirarse',
  'rascarse_cabeza',
  'leer_documento',
  'revisar_papeles',
  'estirar_espalda',
  'tomar_cafe',
  'telefono',
  'probar_luz',
  'senalar',
  'asentir',
] as const;

export type VarianteIdle = (typeof TODAS_LAS_VARIANTES)[number];
/** Peso de cada variante en el sorteo; las que faltan pesan 0. */
export type PesosIdle = Partial<Record<VarianteIdle, number>>;

export const PESOS_BASE: PesosIdle = Object.fromEntries(
  VARIANTES_IDLE.map((v) => [v.nombre, v.peso]),
);

export interface Idle {
  variante: VarianteIdle;
  /** Segundos que dura la variante (3–8). */
  duracion: number;
  /** Desfase de fase propio del agente, en [0, 2π). */
  fase: number;
}

/** Elige una variante de idle ponderada, con duración y desfase aleatorios. */
export function nuevoIdle(azar: Azar, pesos: PesosIdle = PESOS_BASE): Idle {
  let total = 0;
  for (const nombre of TODAS_LAS_VARIANTES) total += pesos[nombre] ?? 0;
  let restante = azar() * total;
  let variante: VarianteIdle = 'respirar';
  for (const nombre of TODAS_LAS_VARIANTES) {
    const peso = pesos[nombre] ?? 0;
    if (peso <= 0) continue;
    variante = nombre;
    if (restante < peso) break;
    restante -= peso;
  }
  return { variante, duracion: 3 + azar() * 5, fase: azar() * Math.PI * 2 };
}

/** Objeto pequeño que el idle pone en una mano (se dibuja como una instancia más). */
export type PropIdle = 'ninguno' | 'hoja' | 'telefono' | 'taza';

/** Ajuste que un idle aplica sobre la pose base; los brazos van [izquierdo, derecho]. */
export interface AjusteIdle {
  cabezaYaw: number;
  /** Positivo = hacia arriba (mismo convenio que `Mirada`). */
  cabezaPitch: number;
  /** Cabeceo extra de la columna (rad): negativo = se arquea hacia atrás. */
  columna: number;
  /** Peso 0..1 con el que el idle reemplaza la pose del brazo. */
  mezcla: [number, number];
  hombro: [number, number];
  codo: [number, number];
  prop: PropIdle;
}

/** Ajuste vacío: no cambia nada de la pose. */
export function ajusteNeutro(): AjusteIdle {
  return {
    cabezaYaw: 0,
    cabezaPitch: 0,
    columna: 0,
    mezcla: [0, 0],
    hombro: [0, 0],
    codo: [0, 0],
    prop: 'ninguno',
  };
}

/**
 * Calcula el ajuste de un idle en `progreso` (0..1 de su duración) escribiendo en `salida`
 * (sin crear objetos por cuadro). Entra y sale suavemente: el peso es sen(π·progreso).
 */
export function ajusteIdle(
  idle: Idle,
  progreso: number,
  t: number,
  salida: AjusteIdle,
): AjusteIdle {
  const envolvente = Math.sin(Math.PI * Math.min(1, Math.max(0, progreso)));
  const ciclo = t + idle.fase;
  salida.cabezaYaw = 0;
  salida.cabezaPitch = 0;
  salida.columna = 0;
  salida.mezcla[0] = salida.mezcla[1] = 0;
  salida.hombro[0] = salida.hombro[1] = 0;
  salida.codo[0] = salida.codo[1] = 0;
  salida.prop = 'ninguno';
  switch (idle.variante) {
    case 'mirar_alrededor':
      salida.cabezaYaw = Math.sin(ciclo * 0.9) * 0.5 * envolvente;
      salida.cabezaPitch = Math.sin(ciclo * 0.6) * 0.1 * envolvente;
      break;
    case 'tamborilear':
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -0.7 + Math.sin(ciclo * 14) * 0.06;
      salida.codo[1] = 1.1;
      break;
    case 'estirarse':
      salida.mezcla[0] = salida.mezcla[1] = envolvente;
      salida.hombro[0] = salida.hombro[1] = -2.9;
      salida.codo[0] = salida.codo[1] = 0.2;
      salida.cabezaPitch = 0.25 * envolvente;
      break;
    case 'rascarse_cabeza':
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -2.5;
      salida.codo[1] = 2 + Math.sin(ciclo * 9) * 0.15;
      salida.cabezaYaw = -0.15 * envolvente;
      break;
    case 'leer_documento':
      // La hoja en la mano izquierda, a la altura del pecho; la derecha la sostiene por abajo.
      salida.mezcla[0] = envolvente;
      salida.hombro[0] = -1.15;
      salida.codo[0] = 1.9;
      salida.mezcla[1] = envolvente * 0.8;
      salida.hombro[1] = -0.9;
      salida.codo[1] = 1.5;
      salida.cabezaPitch = -0.3 * envolvente;
      salida.cabezaYaw = (0.2 + Math.sin(ciclo * 0.5) * 0.05) * envolvente;
      salida.prop = 'hoja';
      break;
    case 'revisar_papeles':
      // La hoja en la izquierda; la derecha pasa la hoja de un lado a otro.
      salida.mezcla[0] = envolvente;
      salida.hombro[0] = -1.05;
      salida.codo[0] = 1.7;
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -1 + Math.sin(ciclo * 1.6) * 0.25;
      salida.codo[1] = 1.3 + Math.sin(ciclo * 1.6 + 1) * 0.3;
      salida.cabezaPitch = -0.25 * envolvente;
      salida.cabezaYaw = Math.sin(ciclo * 0.8) * 0.1 * envolvente;
      salida.prop = 'hoja';
      break;
    case 'estirar_espalda':
      // Manos tras la nuca y el pecho hacia delante.
      salida.mezcla[0] = salida.mezcla[1] = envolvente;
      salida.hombro[0] = salida.hombro[1] = -2.6;
      salida.codo[0] = salida.codo[1] = 2.3;
      salida.columna = -0.25 * envolvente;
      salida.cabezaPitch = 0.2 * envolvente;
      break;
    case 'tomar_cafe':
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -1.1;
      salida.codo[1] = 1.8 + Math.max(0, Math.sin(ciclo * 0.9)) * 0.5;
      salida.cabezaPitch = Math.max(0, Math.sin(ciclo * 0.9)) * 0.1 * envolvente;
      salida.prop = 'taza';
      break;
    case 'telefono':
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -2.3;
      salida.codo[1] = 2.2;
      salida.cabezaYaw = 0.2 * envolvente;
      salida.prop = 'telefono';
      break;
    case 'probar_luz':
      salida.cabezaYaw = Math.sin(ciclo * 1.1) * 0.75 * envolvente;
      salida.cabezaPitch = 0.1 * envolvente;
      break;
    case 'senalar':
      salida.mezcla[1] = envolvente;
      salida.hombro[1] = -1.5 + Math.sin(ciclo * 2) * 0.06;
      salida.codo[1] = 0.25;
      salida.cabezaPitch = -0.05 * envolvente;
      break;
    case 'asentir':
      salida.cabezaPitch = -Math.abs(Math.sin(ciclo * 1.6)) * 0.2 * envolvente;
      break;
    case 'respirar':
      break;
  }
  // El objeto solo aparece con el brazo ya arriba (no salta desde la cadera).
  if (envolvente < 0.5) salida.prop = 'ninguno';
  return salida;
}
