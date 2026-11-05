import type { Azar } from '../azar';
import type { Actividad, EstadoAgente } from '../tipos';

export type Postura = 'sentado' | 'de_pie' | 'caminando_cafe' | 'volviendo';
export type Objetivo = 'asiento' | 'de_pie' | 'cafe';

interface Paseo {
  fase: 'ir' | 'pausa' | 'volver';
  /** Segundos que faltan de pausa en el café. */
  espera: number;
}

export interface Maquina {
  /** Último instante visto (s); el reloj lo inyecta el llamador. */
  t: number;
  /** Segundos de tiempo "libre" que faltan para el próximo paseo. */
  faltaPaseo: number;
  paseo: Paseo | null;
}

export interface EntradaMaquina {
  t: number;
  estado: EstadoAgente;
  actividad?: Actividad;
  reduceMotion: boolean;
  /** El agente está seleccionado/enfocado: se pone de pie y no inicia paseos. */
  enfocado: boolean;
  /** El agente llegó al objetivo devuelto en el paso anterior. */
  enDestino: boolean;
  /**
   * Una interacción lo ocupa (conversa en el café o visita a un colega): congela la pausa del
   * café y no deja iniciar otro paseo.
   */
  retener?: boolean;
  /** Ritmo del reloj de paseo (1 normal, 0,5 la mitad de paseos). */
  ritmo?: number;
  /** Nadie sale de su sala: sin paseos al café (quien está fuera vuelve a su lugar). */
  sinPaseo?: boolean;
}

export interface SalidaMaquina {
  postura: Postura;
  objetivo: Objetivo;
  sentarse: boolean;
  paseando: boolean;
  /** `trabajando` sin actividad explícita equivale a `escribiendo`. */
  actividad: Actividad | undefined;
}

const proximoPaseo = (azar: Azar) => 15 + azar() * 25;

/** Crea la máquina de un agente en el instante `t`. */
export function crearMaquina(t: number, azar: Azar): Maquina {
  return { t, faltaPaseo: proximoPaseo(azar), paseo: null };
}

/**
 * Un paso de la máquina de estados (puro: devuelve una máquina nueva). Equivale a la
 * decisión de `updateAgent` del prototipo: sentado trabajando, de pie esperando, y solo
 * cuando está libre (y sin reduceMotion) pasea al café, pausa 3–6 s y vuelve.
 */
export function avanzarMaquina(
  maquina: Maquina,
  entrada: EntradaMaquina,
  azar: Azar,
): { maquina: Maquina; salida: SalidaMaquina } {
  const dt = Math.max(0, entrada.t - maquina.t);
  const puedePasear = entrada.estado === 'libre' && !entrada.reduceMotion && !entrada.sinPaseo;
  let faltaPaseo = maquina.faltaPaseo;
  let paseo = puedePasear && maquina.paseo ? { ...maquina.paseo } : null;

  if (paseo) {
    if (paseo.fase === 'ir' && entrada.enDestino) {
      paseo = { fase: 'pausa', espera: 3 + azar() * 3 };
    } else if (paseo.fase === 'pausa') {
      if (!entrada.retener) paseo.espera -= dt;
      if (paseo.espera <= 0) paseo = { fase: 'volver', espera: 0 };
    } else if (paseo.fase === 'volver' && entrada.enDestino) {
      paseo = null;
      faltaPaseo = proximoPaseo(azar);
    }
  } else if (puedePasear && !entrada.enfocado && !entrada.retener) {
    faltaPaseo -= dt * (entrada.ritmo ?? 1);
    if (faltaPaseo <= 0) paseo = { fase: 'ir', espera: 0 };
  }

  let postura: Postura;
  let objetivo: Objetivo;
  if (paseo) {
    postura = { ir: 'caminando_cafe', pausa: 'de_pie', volver: 'volviendo' }[paseo.fase] as Postura;
    objetivo = paseo.fase === 'volver' ? 'asiento' : 'cafe';
  } else if (entrada.estado === 'esperando_decision' || entrada.enfocado) {
    postura = 'de_pie';
    objetivo = 'de_pie';
  } else {
    postura = 'sentado';
    objetivo = 'asiento';
  }

  const actividad =
    entrada.estado === 'trabajando' ? (entrada.actividad ?? 'escribiendo') : entrada.actividad;
  return {
    maquina: { t: entrada.t, faltaPaseo, paseo },
    salida: {
      postura,
      objetivo,
      sentarse: postura === 'sentado',
      paseando: paseo !== null,
      actividad,
    },
  };
}
