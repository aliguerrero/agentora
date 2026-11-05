/** Estados de presencia del orbe de Jules, dirigidos desde fuera por la voz y el agente. */
export const PRESENCIAS = [
  'reposo',
  'escuchando',
  'pensando',
  'hablando',
  'esperando_decision',
] as const;

export type PresenciaJules = (typeof PRESENCIAS)[number];

/** Rasgos suavizados de un estado: lo que se interpola al cambiar de presencia. */
interface Perfil {
  /** Escala base del núcleo. */
  escalaBase: number;
  /** Amplitud del pulso de escala y su frecuencia (rad/s). */
  pulsoAmp: number;
  pulsoFreq: number;
  /** 0 = el pulso es una senoide; 1 = lo manda la envolvente de voz. */
  envPeso: number;
  /** Brillo del halo: base, parpadeo irregular y aporte de la envolvente de voz. */
  brilloBase: number;
  brilloAmp: number;
  brilloEnv: number;
  ruidoVel: number;
  haloEscala: number;
  /** Color del núcleo y el anillo (0..1). */
  r: number;
  g: number;
  b: number;
  /** Rapidez y radio relativo de la órbita de los satélites. */
  velSat: number;
  radSat: number;
  /** Ondas: amplitud, sentido (-1 hacia el orbe, 1 hacia afuera) y ciclos por segundo. */
  ondasAmp: number;
  ondasDir: number;
  ondasVel: number;
  /** Inclinación (rad) del plano orbital hacia la cámara. */
  inclinacion: number;
}

const PERFILES: Record<PresenciaJules, Perfil> = {
  reposo: {
    escalaBase: 1,
    pulsoAmp: 0.06,
    pulsoFreq: 2.1,
    envPeso: 0,
    brilloBase: 1,
    brilloAmp: 0,
    brilloEnv: 0,
    ruidoVel: 1,
    haloEscala: 1,
    r: 1,
    g: 0.89,
    b: 0.71,
    velSat: 1,
    radSat: 1,
    ondasAmp: 0,
    ondasDir: 1,
    ondasVel: 0.5,
    inclinacion: 0,
  },
  escuchando: {
    escalaBase: 0.96,
    pulsoAmp: 0.03,
    pulsoFreq: 3,
    envPeso: 0,
    brilloBase: 1.15,
    brilloAmp: 0.05,
    brilloEnv: 0,
    ruidoVel: 2,
    haloEscala: 0.72,
    r: 1,
    g: 0.93,
    b: 0.8,
    velSat: 0.8,
    radSat: 0.9,
    ondasAmp: 0.7,
    ondasDir: -1,
    ondasVel: 0.8,
    inclinacion: 0.4,
  },
  pensando: {
    escalaBase: 0.98,
    pulsoAmp: 0.04,
    pulsoFreq: 4,
    envPeso: 0,
    brilloBase: 0.85,
    brilloAmp: 0.4,
    brilloEnv: 0,
    ruidoVel: 7,
    haloEscala: 1,
    r: 0.55,
    g: 0.92,
    b: 0.88,
    velSat: 3.2,
    radSat: 0.62,
    ondasAmp: 0,
    ondasDir: 1,
    ondasVel: 0.5,
    inclinacion: 0.1,
  },
  hablando: {
    escalaBase: 1.06,
    pulsoAmp: 0.2,
    pulsoFreq: 15,
    envPeso: 1,
    brilloBase: 1.05,
    brilloAmp: 0,
    brilloEnv: 0.3,
    ruidoVel: 1,
    haloEscala: 1.25,
    r: 1,
    g: 0.82,
    b: 0.45,
    velSat: 1.4,
    radSat: 1.1,
    ondasAmp: 0.8,
    ondasDir: 1,
    ondasVel: 1.1,
    inclinacion: 0,
  },
  esperando_decision: {
    escalaBase: 1,
    pulsoAmp: 0.08,
    pulsoFreq: 1.1,
    envPeso: 0,
    brilloBase: 0.8,
    brilloAmp: 0.5,
    brilloEnv: 0,
    ruidoVel: 5,
    haloEscala: 1.15,
    r: 1,
    g: 0.7,
    b: 0.3,
    velSat: 0.5,
    radSat: 1,
    ondasAmp: 0,
    ondasDir: 1,
    ondasVel: 0.5,
    inclinacion: 0,
  },
};

const RASGOS = Object.keys(PERFILES.reposo) as (keyof Perfil)[];
/** Rasgos que se atenúan con `prefers-reduced-motion`. */
const ATENUABLES: ReadonlySet<keyof Perfil> = new Set([
  'pulsoAmp',
  'brilloAmp',
  'ondasAmp',
  'inclinacion',
  'velSat',
]);

/** Constante de tiempo (s) con la que los rasgos alcanzan su destino. */
const TAU = 0.25;
/** Constante de tiempo (s) del nivel de voz que llega de fuera. */
const TAU_NIVEL = 0.04;
/** Un cuadro más largo que esto (pestaña oculta) se recorta. */
const DT_MAX = 0.1;

/** Estado vivo de la presencia: rasgos suavizados, fases acumuladas y magnitudes de salida. */
export interface EstadoPresencia extends Perfil {
  fasePulso: number;
  faseRuido: number;
  faseSat: number;
  faseOnda: number;
  nivel: number;
  /** Salida: escala del núcleo y brillo del halo de este cuadro. */
  escala: number;
  brillo: number;
}

export function crearPresencia(): EstadoPresencia {
  return {
    ...PERFILES.reposo,
    fasePulso: 0,
    faseRuido: 0,
    faseSat: 0,
    faseOnda: 0,
    nivel: 0,
    escala: 1,
    brillo: 1,
  };
}

const ruido = (f: number) =>
  (Math.sin(f) + 0.6 * Math.sin(f * 2.7 + 1.3) + 0.4 * Math.sin(f * 5.1 + 0.4)) / 2;

/**
 * Avanza la presencia `dt` segundos. Los rasgos se interpolan hacia el perfil del estado
 * (sin saltos) y las fases se integran, así cambiar de velocidad no da tirones.
 * `nivel` (0..1) es el volumen de la voz de Jules; sin él, `hablando` usa un ritmo sintético.
 * `amplitud` (0..1) atenúa los movimientos (`prefers-reduced-motion`).
 * Muta `p` y no crea objetos.
 */
export function avanzarPresencia(
  p: EstadoPresencia,
  presencia: PresenciaJules,
  nivel: number | undefined,
  dt: number,
  amplitud: number,
): void {
  const paso = Math.min(Math.max(dt, 0), DT_MAX);
  const destino = PERFILES[presencia];
  const k = 1 - Math.exp(-paso / TAU);
  for (const rasgo of RASGOS) {
    const meta = ATENUABLES.has(rasgo) ? destino[rasgo] * amplitud : destino[rasgo];
    p[rasgo] += (meta - p[rasgo]) * k;
  }

  const objetivoNivel = Math.min(Math.max(nivel ?? 0, 0), 1);
  p.nivel += (objetivoNivel - p.nivel) * (1 - Math.exp(-paso / TAU_NIVEL));

  p.fasePulso += paso * p.pulsoFreq;
  p.faseRuido += paso * p.ruidoVel;
  p.faseSat += paso * p.velSat;
  p.faseOnda = (p.faseOnda + paso * p.ondasVel) % 1;

  const silaba =
    Math.max(0, Math.sin(p.fasePulso)) * (0.65 + 0.35 * Math.sin(p.fasePulso * 0.37 + 1));
  const envolvente = nivel === undefined ? silaba : p.nivel;
  const onda = (1 - p.envPeso) * Math.sin(p.fasePulso) + p.envPeso * envolvente;
  p.escala = p.escalaBase + p.pulsoAmp * onda;
  p.brillo = p.brilloBase + p.brilloAmp * ruido(p.faseRuido) + p.brilloEnv * envolvente;
}
