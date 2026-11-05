import type { Vista } from './interacciones';

/** Sin objetivo concreto: quien lo enfoca mira a la cámara. */
export const NADIE = -1;
/** El objetivo de la mirada es Jules. */
export const JULES = -2;
/** Duración (s) del gesto de quien es enfocado: saludo con la mano o asentimiento. */
export const SEGUNDOS_GESTO = 1.8;
/** Cuánto gira (rad) la silla de quien está sentado y atiende, enfocado o en su sala. */
export const GIRO_SILLA_ENFOCADO = Math.PI / 4;
export const GIRO_SILLA_SALA = Math.PI / 4;
/** Segundos que el enfocado lleva así antes de gesticular (le da tiempo a decidir si se para). */
export const DEMORA_GESTO = 0.3;
/** Jules gana la mirada de la sala si está a menos de esta fracción de la distancia al enfocado… */
const FRACCION_ENTRA_JULES = 0.85;
/** …y la conserva hasta que supera esta (así no parpadea en el límite). */
const FRACCION_SALE_JULES = 1.15;

/**
 * - `enfocado`: lo encuadra la cámara; se detiene, mira a cámara y saluda o asiente una vez.
 * - `sala`: comparte sala con el enfocado; se detiene y lo mira (o a Jules si está más cerca).
 * - `ambiente`: la cámara está en su ambiente sin enfoque; pasea a medias y mira su trabajo.
 */
export type RolAtencion = 'ninguno' | 'enfocado' | 'sala' | 'ambiente';
export type Gesto = 'ninguno' | 'saludo' | 'asentir';

/** Atención de una persona. Un objeto por persona, reutilizado siempre. */
export interface AtencionPersona {
  rol: RolAtencion;
  /** Índice de a quién mira (rol `sala`), `JULES` o `NADIE`. */
  objetivo: number;
  gesto: Gesto;
  /** Instante en que empezó el gesto. */
  gestoDesde: number;
}

export interface Atencion {
  personas: AtencionPersona[];
  /** Índice del enfocado vigente (-1 si no hay). */
  enfocado: number;
  /** Ya hizo su gesto en este enfoque. */
  gestoHecho: boolean;
  /** Instante en que empezó el enfoque vigente. */
  desde: number;
}

export interface EntradaAtencion {
  /** Índice del agente enfocado por la cámara (-1 si no hay). */
  enfocado: number;
  /** Sala (`Puesto.sala`) del ambiente donde está la cámara (-1 si no hay). */
  salaAmbiente: number;
  julesX: number;
  julesZ: number;
  /** `false` con prefers-reduced-motion o calidad baja: sin gestos amplios, solo el giro. */
  permitido: boolean;
}

export function crearAtencion(agentes: number): Atencion {
  return {
    personas: Array.from({ length: agentes }, () => ({
      rol: 'ninguno' as RolAtencion,
      objetivo: NADIE,
      gesto: 'ninguno' as Gesto,
      gestoDesde: 0,
    })),
    enfocado: -1,
    gestoHecho: false,
    desde: 0,
  };
}

/**
 * Reparte la atención del enfoque: quién es el enfocado, quién comparte su sala y a quién mira
 * cada uno. Corre a 4 Hz con las `vistas` del coordinador, con reloj inyectable, y escribe en
 * las estructuras preasignadas (no crea objetos). El gesto del enfocado ocurre una sola vez por
 * enfoque, cuando ya está quieto.
 */
export function actualizarAtencion(
  a: Atencion,
  n: number,
  vistas: readonly Vista[],
  e: EntradaAtencion,
  t: number,
): void {
  const foco = e.enfocado >= 0 && e.enfocado < n ? e.enfocado : -1;
  if (foco !== a.enfocado) {
    a.enfocado = foco;
    a.gestoHecho = false;
    a.desde = t;
    for (const p of a.personas) p.gesto = 'ninguno';
  }
  const vf = foco >= 0 ? vistas[foco] : undefined;
  for (let i = 0; i < n; i++) {
    const p = a.personas[i];
    const v = vistas[i];
    if (!p || !v) continue;
    const anterior = p.objetivo;
    p.rol = 'ninguno';
    p.objetivo = NADIE;
    if (vf) {
      if (i === foco) {
        p.rol = 'enfocado';
        if (!a.gestoHecho && e.permitido && v.quieta && t - a.desde >= DEMORA_GESTO) {
          p.gesto = v.sentado ? 'asentir' : 'saludo';
          p.gestoDesde = t;
          a.gestoHecho = true;
        } else if (p.gesto !== 'ninguno' && t - p.gestoDesde >= SEGUNDOS_GESTO) {
          p.gesto = 'ninguno';
        }
      } else if (v.sala === vf.sala) {
        p.rol = 'sala';
        const alFoco = Math.hypot(vf.x - v.x, vf.z - v.z);
        const aJules = Math.hypot(e.julesX - v.x, e.julesZ - v.z);
        const umbral = anterior === JULES ? FRACCION_SALE_JULES : FRACCION_ENTRA_JULES;
        p.objetivo = aJules < alFoco * umbral ? JULES : foco;
      }
    } else if (e.salaAmbiente >= 0 && v.sala === e.salaAmbiente) {
      p.rol = 'ambiente';
    }
    if (p.rol !== 'enfocado') p.gesto = 'ninguno';
  }
}

const envolver = (angulo: number) =>
  ((((angulo + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Yaw del cuerpo de quien atiende a un punto. De pie gira entero hacia él; sentado solo gira la
 * silla hasta `giroSilla` respecto de `yawSentado` (el resto lo hace la cabeza).
 */
export function yawObjetivoAtento(
  sentado: boolean,
  yawSentado: number,
  giroSilla: number,
  x: number,
  z: number,
  haciaX: number,
  haciaZ: number,
): number {
  const yaw = Math.atan2(haciaX - x, haciaZ - z);
  if (!sentado) return yaw;
  return yawSentado + Math.max(-giroSilla, Math.min(giroSilla, envolver(yaw - yawSentado)));
}
