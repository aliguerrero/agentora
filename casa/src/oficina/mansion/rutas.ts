/**
 * Rutas de las personas por la mansión. Para cada lugar de trabajo arma la cadena de nodos
 * (con altura) que `animacion/ruta.ts` recorre:
 *
 *   lugar → salida libre del mueble → pasillo del ambiente → [dos nodos de visita]
 *         → vano de puerta → … → (escaleras, tramo a tramo) → cocina → punto de pausa
 *
 * Quien trabaja en un piso alto baja por la escalera hasta la cocina del piso 1; la misma
 * cadena recorrida al revés es la vuelta. Todo se calcula una vez al crear a la persona: el
 * bucle por cuadro no vuelve a llamar a este módulo salvo para escribir una visita.
 */
import type { Nodo, PuntoXZ } from '../animacion/ruta';
import { NODO_PASILLO, NODO_VISITA } from '../animacion/ruta';
import { ambienteDe, NIVEL_Y, plano } from './plano';
import type { Ambiente, Escalera, Lugar, Vano } from './plano';

/** Cuánto se separa del muro del atrio el carril por el que se llega a la pasarela. */
const CARRIL_DE_PARED = 0.7;

function escalera(id: string): Escalera {
  const e = plano.escaleras.find((s) => s.id === id);
  if (!e) throw new Error(`Escalera desconocida: ${id}`);
  return e;
}

function vanoEntre(a: string, b: string): Vano {
  const v = plano.vanos.find((u) => u.entre.includes(a) && u.entre.includes(b));
  if (!v) throw new Error(`No hay vano entre ${a} y ${b}`);
  return v;
}

const baja12 = escalera('escultorica-1-2').tramos[0];
const baja23 = escalera('escultorica-2-3').tramos[0];
const caracol = escalera('caracol').tramos;
const PASARELA_Z = ambienteDe('pasarela').pasilloZ;

/** Escribe nodos y descarta los repetidos consecutivos. */
type Poner = (x: number, y: number, z: number) => void;

/** De la pasarela al piso 1 por la escultórica del este, y de ahí hasta la barra por los vanos. */
function bajarAlCafe(poner: Poner): void {
  if (!baja12) return;
  poner(baja12.hasta.x, baja12.hasta.y, PASARELA_Z);
  poner(baja12.hasta.x, baja12.hasta.y, baja12.hasta.z);
  poner(baja12.desde.x, baja12.desde.y, baja12.desde.z);
  poner(baja12.desde.x, NIVEL_Y.piso1, ambienteDe('atrio').pasilloZ);
  vanosAlEste(poner, baja12.desde.x);
}

/** Del rellano a la pasarela por la escultórica del oeste, y de ahí a `bajarAlCafe`. */
function bajarDelRellano(poner: Poner): void {
  if (!baja23) return;
  poner(baja23.hasta.x, baja23.hasta.y, ambienteDe('rellano').pasilloZ);
  poner(baja23.hasta.x, baja23.hasta.y, baja23.hasta.z);
  poner(baja23.desde.x, baja23.desde.y, baja23.desde.z);
  poner(baja23.desde.x, baja23.desde.y, PASARELA_Z);
  bajarAlCafe(poner);
}

/** Vanos del piso 1 al este de `x`, hasta la cocina. */
function vanosAlEste(poner: Poner, x: number): void {
  // Las puertas a las alas (en x = ±16) quedan fuera: no están en el camino a la cocina.
  const pasando = plano.vanos
    .filter((v) => v.nivel === 'piso1' && v.pos > x && Math.abs(v.pos) < 16)
    .sort((a, b) => a.pos - b.pos);
  for (const v of pasando) poner(v.pos, NIVEL_Y.piso1, v.centro);
}

/** Los nodos entre el pasillo del ambiente y el pasillo de la cocina (sin incluir el punto de pausa). */
function caminoAlCafe(poner: Poner, a: Ambiente, salidaX: number): void {
  const { y, pasilloZ } = a;
  if (a.vecina) {
    // Sala construida: por su puerta a la sala vecina y, desde ahí, el camino de esa sala.
    const v = vanoEntre(a.id, a.vecina);
    poner(v.pos, y, v.centro);
    caminoAlCafe(poner, ambienteDe(a.vecina), v.pos);
    return;
  }
  switch (a.id) {
    case 'finanzas': {
      const v = vanoEntre('finanzas', 'pasarela');
      poner(v.pos - CARRIL_DE_PARED, y, pasilloZ);
      poner(v.pos - CARRIL_DE_PARED, y, v.centro);
      poner(v.pos, y, v.centro);
      bajarAlCafe(poner);
      return;
    }
    case 'ventas': {
      const v = vanoEntre('pasarela', 'ventas');
      poner(v.pos + CARRIL_DE_PARED, y, pasilloZ);
      poner(v.pos + CARRIL_DE_PARED, y, v.centro);
      poner(v.pos, y, v.centro);
      bajarAlCafe(poner);
      return;
    }
    case 'desarrollo': {
      const v = vanoEntre('desarrollo', 'rellano');
      poner(v.pos, y, v.centro);
      bajarDelRellano(poner);
      return;
    }
    case 'contenido': {
      const v = vanoEntre('rellano', 'contenido');
      poner(v.pos, y, v.centro);
      bajarDelRellano(poner);
      return;
    }
    case 'investigacion': {
      const cima = caracol.at(-1)?.hasta;
      if (!cima) return;
      poner(cima.x, cima.y, cima.z);
      for (let i = caracol.length - 1; i >= 0; i--) {
        const d = (caracol[i] as (typeof caracol)[number]).desde;
        poner(d.x, d.y, d.z);
      }
      const base = (caracol[0] as (typeof caracol)[number]).desde;
      poner(base.x, base.y, ambienteDe('rellano').pasilloZ);
      bajarDelRellano(poner);
      return;
    }
    default:
      vanosAlEste(poner, salidaX);
  }
}

/**
 * La cadena de un lugar hasta su punto de pausa (la barra de café, o el aro de luz si
 * `aLaLuz`). Los nodos 0 a 2 son lugar, salida y pasillo; los nodos 3 y 4 repiten el pasillo
 * y quedan libres para `escribirVisita`. El último nodo es la pausa.
 */
export function crearRuta(lugar: Lugar, pausa: PuntoXZ, aLaLuz: boolean): Nodo[] {
  const a = ambienteDe(lugar.ambiente);
  const nodos: Nodo[] = [
    { x: lugar.x, y: lugar.y, z: lugar.z },
    { x: lugar.salida.x, y: lugar.y, z: lugar.salida.z },
    { x: lugar.salida.x, y: lugar.y, z: a.pasilloZ },
    { x: lugar.salida.x, y: lugar.y, z: a.pasilloZ },
    { x: lugar.salida.x, y: lugar.y, z: a.pasilloZ },
  ];
  const poner: Poner = (x, y, z) => {
    const ultimo = nodos[nodos.length - 1];
    if (ultimo && ultimo.x === x && ultimo.y === y && ultimo.z === z) return;
    nodos.push({ x, y, z });
  };
  if (aLaLuz) {
    poner(pausa.x, lugar.y, a.pasilloZ);
    poner(pausa.x, lugar.y, pausa.z);
    return nodos;
  }
  caminoAlCafe(poner, a, lugar.salida.x);
  poner(pausa.x, NIVEL_Y.piso1, ambienteDe('atrio').pasilloZ);
  poner(pausa.x, NIVEL_Y.piso1, pausa.z);
  return nodos;
}

/** Dónde se queda quien visita: el punto libre de la silla del colega. */
export function puestoDeVisita(colega: Lugar): PuntoXZ {
  return { x: colega.salida.x, z: colega.salida.z };
}

/**
 * Reescribe los nodos de visita para llegar a un colega del mismo ambiente: por el pasillo
 * hasta su altura y por su carril hasta su salida. No crea objetos.
 */
export function escribirVisita(nodos: Nodo[], colega: Lugar): void {
  const a = nodos[NODO_VISITA - 1];
  const b = nodos[NODO_VISITA];
  if (!a || !b) return;
  a.x = colega.salida.x;
  a.y = colega.y;
  a.z = ambienteDe(colega.ambiente).pasilloZ;
  b.x = colega.salida.x;
  b.y = colega.y;
  b.z = colega.salida.z;
}

/** Devuelve los nodos de visita al pasillo propio (donde no añaden recorrido). */
export function quitarVisita(nodos: Nodo[]): void {
  const pasillo = nodos[NODO_PASILLO];
  if (!pasillo) return;
  for (const i of [NODO_VISITA - 1, NODO_VISITA]) {
    const nodo = nodos[i];
    if (!nodo) continue;
    nodo.x = pasillo.x;
    nodo.y = pasillo.y;
    nodo.z = pasillo.z;
  }
}
