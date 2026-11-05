import type { Azar } from '../azar';
import type { EstadoAgente } from '../tipos';

const CARAS_NEUTRAS = ['feliz', 'guino', 'serio'] as const;
const DURACION_CIERRE = 0.13;
const SEPARACION_DOBLE = 0.26;
const PROBABILIDAD_DOBLE = 0.15;

/** Cara según el estado del agente. `libre` elige una variante neutra por azar. */
export function caraPorEstado(estado: EstadoAgente, azar: Azar): string {
  if (estado === 'trabajando') return 'concentrado';
  if (estado === 'esperando_decision') return 'sonrisa';
  return (
    CARAS_NEUTRAS[Math.min(CARAS_NEUTRAS.length - 1, Math.floor(azar() * CARAS_NEUTRAS.length))] ??
    'feliz'
  );
}

export interface Cierre {
  /** Segundos desde que termina la espera. */
  desde: number;
  duracion: number;
}

export interface PlanParpadeo {
  /** Segundos de espera (2–6) hasta el próximo parpadeo. */
  espera: number;
  cierres: Cierre[];
}

/** Planifica el próximo parpadeo (a veces doble) sin dibujar nada. */
export function planParpadeo(azar: Azar): PlanParpadeo {
  const espera = 2 + azar() * 4;
  const cierres: Cierre[] = [{ desde: 0, duracion: DURACION_CIERRE }];
  if (azar() < PROBABILIDAD_DOBLE)
    cierres.push({ desde: SEPARACION_DOBLE, duracion: DURACION_CIERRE });
  return { espera, cierres };
}

/** ¿Están los ojos cerrados `transcurrido` segundos después de empezar a esperar el plan? */
export function estaParpadeando(plan: PlanParpadeo, transcurrido: number): boolean {
  const t = transcurrido - plan.espera;
  return plan.cierres.some((c) => t >= c.desde && t < c.desde + c.duracion);
}
