import type { Azar } from '../azar';
import type { EstadoAgente } from '../tipos';

/** Cada cuántos segundos se reevalúan las interacciones (4 Hz). */
export const PASO_EVALUACION = 0.25;
/** Distancia máxima (m) entre dos que pausan en el café para que conversen. */
export const DISTANCIA_CONVERSACION = 1.2;
/** Separación (m) entre dos que conversan. */
const SEPARACION_CONVERSACION = 1.1;

export type TipoInteraccion = 'ninguna' | 'conversa' | 'visita' | 'recibe';
export type FaseVisita = 'ir' | 'mostrar' | 'volver';

/** Lo que una persona está haciendo con otra. Un objeto por persona, reutilizado siempre. */
export interface Interaccion {
  tipo: TipoInteraccion;
  /** Índice del otro; -1 si no hay. */
  socio: number;
  /** Solo en `visita`. */
  fase: FaseVisita;
  inicio: number;
  /** Fin de la conversación o de la fase `mostrar`. */
  fin: number;
  /** En una conversación: a quién le toca hablar primero. */
  primerTurno: boolean;
  /** En una conversación: dónde se queda. */
  x: number;
  z: number;
  /** No empieza otra conversación antes de este instante (no retoma la que acaba de terminar). */
  descansaHasta: number;
}

/** Lo que el coordinador necesita saber de cada persona; lo escribe quien simula. */
export interface Vista {
  sala: number;
  estado: EstadoAgente;
  /** En su asiento, sentada y sin paseo. */
  sentado: boolean;
  /** En la fase de pausa del café, ya en el café. */
  enPausa: boolean;
  /** Visita: ya está en el costado del colega. */
  llego: boolean;
  /** Quieta: no está caminando entre nodos de su ruta. */
  quieta: boolean;
  /** No está enfocada, seleccionada ni atendiendo al enfocado (quien no lo está no inicia ni sigue interacciones). */
  disponible: boolean;
  x: number;
  z: number;
}

export interface Coordinador {
  interacciones: Interaccion[];
  vistas: Vista[];
  proximaEvaluacion: number;
  /** Por sala: instante desde el que puede haber otra visita. */
  visitaDesde: number[];
  /** Por sala (de uso interno de cada evaluación): ¿hay una visita en curso? */
  salaVisitada: boolean[];
}

const crearInteraccion = (): Interaccion => ({
  tipo: 'ninguna',
  socio: -1,
  fase: 'ir',
  inicio: 0,
  fin: 0,
  primerTurno: false,
  x: 0,
  z: 0,
  descansaHasta: 0,
});

const crearVista = (): Vista => ({
  sala: 0,
  estado: 'trabajando',
  sentado: false,
  enPausa: false,
  llego: false,
  quieta: true,
  disponible: true,
  x: 0,
  z: 0,
});

const esperaEntreVisitas = (azar: Azar) => 20 + azar() * 20;

/** Crea el coordinador de `agentes` personas repartidas en `salas` salas, en el instante `t`. */
export function crearCoordinador(
  agentes: number,
  salas: number,
  t: number,
  azar: Azar,
): Coordinador {
  return {
    interacciones: Array.from({ length: agentes }, crearInteraccion),
    vistas: Array.from({ length: agentes }, crearVista),
    proximaEvaluacion: t,
    visitaDesde: Array.from({ length: salas }, () => t + esperaEntreVisitas(azar)),
    salaVisitada: Array.from({ length: salas }, () => false),
  };
}

function liberar(i: Interaccion): void {
  i.tipo = 'ninguna';
  i.socio = -1;
}

/** Segundos que descansan dos personas tras una conversación antes de iniciar otra. */
const DESCANSO_CONVERSACION = 15;

/** Un agente puede empezar algo nuevo: está disponible, sin interacción y no acaba de conversar. */
const libreDeInteraccion = (c: Coordinador, i: number, t: number): boolean =>
  c.interacciones[i]?.tipo === 'ninguna' &&
  c.vistas[i]?.disponible === true &&
  t >= (c.interacciones[i]?.descansaHasta ?? 0);

function empezarConversacion(c: Coordinador, a: number, b: number, t: number, azar: Azar): void {
  const ia = c.interacciones[a];
  const ib = c.interacciones[b];
  const va = c.vistas[a];
  const vb = c.vistas[b];
  if (!ia || !ib || !va || !vb) return;
  const fin = t + 4 + azar() * 5;
  const primero = azar() < 0.5;
  // Se paran a ambos lados del punto medio, sobre el eje que los une.
  const dx = vb.x - va.x;
  const dz = vb.z - va.z;
  const largo = Math.hypot(dx, dz);
  const ux = largo > 0.01 ? dx / largo : 1;
  const uz = largo > 0.01 ? dz / largo : 0;
  const mx = (va.x + vb.x) / 2;
  const mz = (va.z + vb.z) / 2;
  const medio = SEPARACION_CONVERSACION / 2;
  for (const [yo, otro, signo, turno] of [
    [ia, b, -1, primero],
    [ib, a, 1, !primero],
  ] as const) {
    yo.tipo = 'conversa';
    yo.socio = otro;
    yo.inicio = t;
    yo.fin = fin;
    yo.primerTurno = turno;
    yo.x = mx + ux * medio * signo;
    yo.z = mz + uz * medio * signo;
  }
}

function empezarVisita(c: Coordinador, visitante: number, colega: number, t: number): void {
  const iv = c.interacciones[visitante];
  const ic = c.interacciones[colega];
  if (!iv || !ic) return;
  iv.tipo = 'visita';
  iv.socio = colega;
  iv.fase = 'ir';
  iv.inicio = t;
  ic.tipo = 'recibe';
  ic.socio = visitante;
  ic.inicio = t;
}

/** Mantiene las interacciones en curso: las termina cuando se cumplen o dejan de ser posibles. */
function mantener(c: Coordinador, n: number, t: number, azar: Azar): void {
  c.salaVisitada.fill(false);
  for (let i = 0; i < n; i++) {
    const yo = c.interacciones[i];
    const v = c.vistas[i];
    if (!yo || !v || yo.tipo === 'ninguna') continue;
    const otro = c.interacciones[yo.socio];
    const vo = c.vistas[yo.socio];
    if (yo.tipo === 'conversa') {
      const sigue =
        t < yo.fin &&
        otro?.tipo === 'conversa' &&
        otro.socio === i &&
        v.enPausa &&
        vo?.enPausa === true &&
        v.disponible &&
        vo.disponible;
      if (!sigue) {
        yo.descansaHasta = t + DESCANSO_CONVERSACION;
        liberar(yo);
        if (otro?.tipo === 'conversa' && otro.socio === i) {
          otro.descansaHasta = t + DESCANSO_CONVERSACION;
          liberar(otro);
        }
      }
    } else if (yo.tipo === 'recibe') {
      if (otro?.tipo !== 'visita' || otro.socio !== i || otro.fase === 'volver') liberar(yo);
    } else {
      c.salaVisitada[v.sala] = true;
      const posible =
        v.estado === 'libre' && v.disponible && vo?.estado === 'trabajando' && vo.disponible;
      if (yo.fase !== 'volver' && !posible) yo.fase = 'volver';
      if (yo.fase === 'ir' && v.llego) {
        yo.fase = 'mostrar';
        yo.fin = t + 4 + azar() * 3;
      } else if (yo.fase === 'mostrar' && t >= yo.fin) {
        yo.fase = 'volver';
      }
      if (yo.fase === 'volver') {
        if (otro?.tipo === 'recibe' && otro.socio === i) liberar(otro);
        if (v.sentado) {
          liberar(yo);
          c.salaVisitada[v.sala] = false;
          c.visitaDesde[v.sala] = t + esperaEntreVisitas(azar);
        }
      }
    }
  }
}

/** Elige el `k`-ésimo agente de la sala que cumple la condición (o -1). */
function elegir(
  c: Coordinador,
  n: number,
  t: number,
  sala: number,
  estado: EstadoAgente,
  k: number,
): number {
  let visto = 0;
  for (let i = 0; i < n; i++) {
    const v = c.vistas[i];
    if (
      !v ||
      v.sala !== sala ||
      v.estado !== estado ||
      !v.sentado ||
      !libreDeInteraccion(c, i, t)
    ) {
      continue;
    }
    if (visto++ === k) return i;
  }
  return -1;
}

function contar(c: Coordinador, n: number, t: number, sala: number, estado: EstadoAgente): number {
  let cuenta = 0;
  for (let i = 0; i < n; i++) {
    const v = c.vistas[i];
    if (v && v.sala === sala && v.estado === estado && v.sentado && libreDeInteraccion(c, i, t)) {
      cuenta++;
    }
  }
  return cuenta;
}

/**
 * Un paso del coordinador de interacciones (corre a 4 Hz; entre pasos no hace nada). Lee las
 * `vistas` que escribió quien simula y escribe las `interacciones` de cada persona:
 *
 * - dos libres que coinciden en la pausa del café, cerca, conversan 4–9 s;
 * - un libre sentado visita a un colega que trabaja en su sala (una por sala, con 20–40 s de
 *   espera entre visitas);
 * - nadie está en más de una interacción a la vez.
 *
 * Sin `permitido` (prefers-reduced-motion, calidad baja) cancela todo y no inicia nada. No crea
 * objetos: todo se escribe en las estructuras preasignadas.
 */
export function avanzarInteracciones(
  c: Coordinador,
  n: number,
  t: number,
  azar: Azar,
  permitido: boolean,
): void {
  if (t < c.proximaEvaluacion) return;
  c.proximaEvaluacion = t + PASO_EVALUACION;
  if (!permitido) {
    for (let i = 0; i < n; i++) {
      const yo = c.interacciones[i];
      if (yo) liberar(yo);
    }
    return;
  }
  mantener(c, n, t, azar);

  for (let a = 0; a < n; a++) {
    const va = c.vistas[a];
    if (!va || !va.enPausa || va.estado !== 'libre' || !libreDeInteraccion(c, a, t)) continue;
    for (let b = a + 1; b < n; b++) {
      const vb = c.vistas[b];
      if (
        !vb ||
        !vb.enPausa ||
        vb.estado !== 'libre' ||
        vb.sala !== va.sala ||
        !libreDeInteraccion(c, b, t) ||
        Math.hypot(va.x - vb.x, va.z - vb.z) > DISTANCIA_CONVERSACION
      ) {
        continue;
      }
      empezarConversacion(c, a, b, t, azar);
      break;
    }
  }

  for (let sala = 0; sala < c.visitaDesde.length; sala++) {
    if (c.salaVisitada[sala] || t < (c.visitaDesde[sala] ?? Infinity)) continue;
    const visitantes = contar(c, n, t, sala, 'libre');
    const colegas = contar(c, n, t, sala, 'trabajando');
    if (visitantes === 0 || colegas === 0) continue;
    const visitante = elegir(c, n, t, sala, 'libre', Math.floor(azar() * visitantes));
    const colega = elegir(c, n, t, sala, 'trabajando', Math.floor(azar() * colegas));
    if (visitante >= 0 && colega >= 0) empezarVisita(c, visitante, colega, t);
  }
}
