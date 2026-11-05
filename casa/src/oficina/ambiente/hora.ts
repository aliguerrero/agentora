const FORMATO_SANTIAGO = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Hora decimal (0 ≤ h < 24) en America/Santiago para una fecha; nunca UTC. */
export function horaChile(fecha: Date): number {
  const partes = Object.fromEntries(
    FORMATO_SANTIAGO.formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  return Number(partes['hour']) + Number(partes['minute']) / 60 + Number(partes['second']) / 3600;
}

export type FaseDelDia = 'alba' | 'dia' | 'ocaso' | 'noche';

export interface LuzDelDia {
  fase: FaseDelDia;
  /** 0 = noche cerrada, 1 = pleno día; continuo. */
  factor: number;
  intensidadSol: number;
  intensidadLamparas: number;
}

const ALBA = [6, 8] as const;
const OCASO = [18, 20] as const;

const suave = (desde: number, hasta: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - desde) / (hasta - desde)));
  return t * t * (3 - 2 * t);
};

/**
 * Luz según la hora (0–24, se envuelve). El factor sube entre 6 y 8 h y baja entre
 * 18 y 20 h con una curva suave, así que no hay saltos; las lámparas de escritorio
 * compensan de noche y quedan al 20 % a pleno día.
 */
export function luzDelDia(hora: number): LuzDelDia {
  const h = ((hora % 24) + 24) % 24;
  const factor = suave(ALBA[0], ALBA[1], h) * (1 - suave(OCASO[0], OCASO[1], h));
  let fase: FaseDelDia = 'noche';
  if (h >= ALBA[0] && h < ALBA[1]) fase = 'alba';
  else if (h >= ALBA[1] && h < OCASO[0]) fase = 'dia';
  else if (h >= OCASO[0] && h < OCASO[1]) fase = 'ocaso';
  return { fase, factor, intensidadSol: factor, intensidadLamparas: 1 - 0.8 * factor };
}
