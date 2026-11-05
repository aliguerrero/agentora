import type { Actividad } from '../tipos';
import { piernaEnFase } from './marcha';
import type { PiernaMarcha } from './marcha';

export const LIMITE_RODILLA = 2.4;
export const LIMITE_CODO = 2.5;
const REBOTE_PELVIS = 0.035;
const CONTRAFASE_BRAZO = 0.8;

export type PosturaCuerpo = 'sentado' | 'de_pie' | 'caminando';

export interface EntradaPose {
  /** Fase del ciclo de marcha (rad). */
  fase: number;
  postura: PosturaCuerpo;
  /** Escala de la marcha: 1 = paseo. */
  velocidad: number;
  actividad?: Actividad;
  /** Segundos; mueve la vibración de muñeca y los gestos. */
  t: number;
  llevaTaza?: boolean;
  saludando?: boolean;
}

export interface BrazoPose {
  /** Rotación en x: negativa = brazo hacia delante. */
  hombro: number;
  /** Separación lateral del tronco (magnitud; el render la espeja por lado). */
  abduccion: number;
  codo: number;
  muneca: number;
}

export interface Pose {
  /** [izquierda, derecha]. */
  piernas: [PiernaMarcha, PiernaMarcha];
  /** [izquierdo, derecho]. */
  brazos: [BrazoPose, BrazoPose];
  /** Cabeceo de la columna (rad), positivo = hacia delante. */
  columna: number;
  /** Rebote vertical de la pelvis (m). */
  pelvisY: number;
  /** Cabeceo de la cabeza propio de la actividad (rad), positivo = hacia arriba (como `Mirada`). */
  cabezaPitch: number;
  /** Giro de la cabeza propio de la actividad (rad) respecto del cuerpo. */
  cabezaYaw: number;
}

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

const crearBrazo = (): BrazoPose => ({ hombro: 0, abduccion: 0, codo: 0, muneca: 0 });
const crearPierna = (): PiernaMarcha => ({ cadera: 0, rodilla: 0 });

/** Una pose vacía para reutilizar como salida de `calcularPose` (se crea una vez por persona). */
export function crearPose(): Pose {
  return {
    piernas: [crearPierna(), crearPierna()],
    brazos: [crearBrazo(), crearBrazo()],
    columna: 0,
    pelvisY: 0,
    cabezaPitch: 0,
    cabezaYaw: 0,
  };
}

/** Escribe los ángulos de un brazo y lo devuelve. */
function brazo(
  salida: BrazoPose,
  hombro: number,
  codo: number,
  abduccion = 0.05,
  muneca = 0,
): BrazoPose {
  salida.hombro = hombro;
  salida.abduccion = abduccion;
  salida.codo = codo;
  salida.muneca = muneca;
  return salida;
}

function piernas(salida: Pose, cadera: number, rodilla: number): void {
  for (const pierna of salida.piernas) {
    pierna.cadera = cadera;
    pierna.rodilla = rodilla;
  }
}

/** Brazos (y cabeza) de las posturas sin marcha, según la actividad. */
function gestoEstatico(entrada: EntradaPose, salida: Pose): void {
  const { postura, actividad, t } = entrada;
  const [izquierdo, derecho] = salida.brazos;
  if (postura === 'sentado' && actividad === 'escribiendo') {
    brazo(izquierdo, -1.2, 1.3, 0.05, Math.sin(t * 17) * 0.1);
    brazo(derecho, -1.2, 1.3, 0.05, Math.sin(t * 17 + 1.6) * 0.1);
    return;
  }
  switch (actividad) {
    case 'leyendo':
      brazo(izquierdo, -0.9, 1.5);
      brazo(derecho, -0.9, 1.5);
      salida.cabezaPitch = -0.3;
      salida.columna = 0.1;
      break;
    case 'pensando':
      // La mano derecha al mentón, el brazo izquierdo apoyado hacia delante.
      brazo(izquierdo, -0.6, 0.9);
      brazo(derecho, -1.2, 2.3, 0.1);
      salida.cabezaPitch = 0.12;
      salida.cabezaYaw = 0.25;
      break;
    case 'hablando':
      // Gesticula con los dos brazos, desfasados, abriéndolos hacia los lados al subir.
      brazo(
        izquierdo,
        -0.8 + Math.sin(t * 2.6) * 0.5,
        1 + Math.sin(t * 2.6 + 1.2) * 0.5,
        0.25 + 0.2 * Math.sin(t * 2.6 + 0.4),
      );
      brazo(
        derecho,
        -0.8 + Math.sin(t * 3.1 + 2) * 0.5,
        1 + Math.sin(t * 3.1 + 3.2) * 0.5,
        0.25 + 0.2 * Math.sin(t * 3.1 + 2.4),
      );
      salida.cabezaPitch = Math.sin(t * 3.4) * 0.07;
      salida.cabezaYaw = Math.sin(t * 1.3) * 0.15;
      break;
    default:
      if (postura === 'sentado') {
        brazo(izquierdo, -0.55, 0.5);
        brazo(derecho, -0.55, 0.5);
      } else {
        brazo(izquierdo, 0, 0.15);
        brazo(derecho, 0, 0.15);
      }
  }
}

/**
 * Calcula los ángulos de todas las articulaciones para una postura, fase y actividad,
 * escribiéndolos en `salida` (que devuelve): se llama por persona y por cuadro, así que no
 * crea objetos. Invariantes: rodilla en [0, 2.4] rad y codo en [0, 2.5] rad, sea cual sea
 * la entrada.
 */
export function calcularPose(entrada: EntradaPose, salida: Pose): Pose {
  const { fase, postura, velocidad, t } = entrada;
  salida.columna = 0;
  salida.pelvisY = 0;
  salida.cabezaPitch = 0;
  salida.cabezaYaw = 0;

  if (postura === 'caminando') {
    piernaEnFase(fase, velocidad, salida.piernas[0]);
    piernaEnFase(fase + Math.PI, velocidad, salida.piernas[1]);
    for (let lado = 0; lado < 2; lado++) {
      const hombro = -CONTRAFASE_BRAZO * salida.piernas[lado as 0 | 1].cadera;
      brazo(salida.brazos[lado as 0 | 1], hombro, 0.3 + 0.8 * Math.max(0, -hombro));
    }
    salida.columna = 0.06 * velocidad;
    salida.pelvisY = Math.abs(Math.cos(fase)) * Math.min(Math.abs(velocidad), 1) * REBOTE_PELVIS;
  } else if (postura === 'sentado') {
    piernas(salida, -Math.PI / 2, Math.PI / 2);
    salida.columna = entrada.actividad === 'escribiendo' ? 0.12 : 0;
    gestoEstatico(entrada, salida);
  } else {
    piernas(salida, 0, 0);
    gestoEstatico(entrada, salida);
  }

  if (entrada.llevaTaza) brazo(salida.brazos[1], -0.9, 1.8);
  if (entrada.saludando) brazo(salida.brazos[1], 0, 0.4, 2.6 + Math.sin(t * 6) * 0.35);

  for (const pierna of salida.piernas) pierna.rodilla = limitar(pierna.rodilla, 0, LIMITE_RODILLA);
  for (const b of salida.brazos) b.codo = limitar(b.codo, 0, LIMITE_CODO);
  return salida;
}
