// Qué sala de la casa ocupa cada departamento. La casa es una sola, pero cada proyecto reparte sus
// departamentos a su manera: en config casa.salas las claves son «proyecto:departamento». Una clave
// sin proyecto es de antes de existir esta separación y sigue valiendo para cualquier proyecto que
// no haya elegido otra cosa. Lógica pura, sin navegador: la prueban servidor/salas.test.mjs.

/** La sala donde se reúnen los agentes: es de todos, así que ningún departamento la ocupa. */
export const SALA_REUNIONES = 'ventas';
/** Las salas que puede ocupar un departamento (ids del plano). */
export const SALAS = ['desarrollo', 'finanzas', 'personal', 'contenido', 'investigacion'] as const;
export const NOMBRE_SALA: Record<string, string> = { desarrollo: 'Desarrollo (piso 3)', finanzas: 'Finanzas (piso 2)', personal: 'Living y gimnasio (piso 1)', ventas: 'Sala de reuniones (piso 2)', contenido: 'Contenido (piso 3)', investigacion: 'Observatorio (torre)', atrio: 'Atrio (sin sala)' };

/** Qué sala le toca a un departamento por su nombre; si no encaja, la primera libre. */
const AFINIDAD: [RegExp, (typeof SALAS)[number]][] = [
  [/plataforma|desarroll|ingenier|tecnolog|backend|frontend|qa|devops/i, 'desarrollo'],
  [/fiscal|finanz|contab|tribut|legal|cumplim/i, 'finanzas'],
  [/talento|personal|rrhh|cultura|contrat/i, 'personal'],
  [/contenido|marketing|marca|comunic|diseñ/i, 'contenido'],
  [/investig|producto|datos|ciencia|anál/i, 'investigacion'],
];

export interface DeptoSala {
  id: string;
  nombre: string;
  color: string;
}

export type Fijas = Record<string, string>;
/** Qué hacer con el departamento que ya estaba en la sala elegida. */
export type ModoOcupante = 'intercambiar' | 'atrio';

const clave = (proyecto: string | null | undefined, depto: string) => (proyecto ? `${proyecto}:${depto}` : depto);

/** La sala fijada para un departamento en este proyecto, si tiene. */
function fijaDe(fijas: Fijas, proyecto: string | null | undefined, depto: string): string | undefined {
  return fijas[clave(proyecto, depto)] ?? fijas[depto];
}

/**
 * Sala de cada departamento: primero las fijadas («atrio» = sin sala), luego por afinidad de nombre
 * y, al final, la primera libre. Quien se queda sin sala no aparece en el resultado.
 */
export function asignarSalas(deptos: readonly Pick<DeptoSala, 'id' | 'nombre'>[], fijas: Fijas = {}, proyecto?: string | null, construidas: readonly string[] = []): Record<string, string> {
  const salaDe: Record<string, string> = {};
  // Las construidas van después: una sala nueva no le cambia la suya a nadie.
  const libres = new Set<string>([...SALAS, ...construidas]);
  const enAtrio = new Set<string>();
  for (const d of deptos) {
    const fija = fijaDe(fijas, proyecto, d.id);
    if (fija === 'atrio') enAtrio.add(d.id);
    else if (fija && libres.has(fija)) {
      salaDe[d.id] = fija;
      libres.delete(fija);
    }
  }
  for (const d of deptos) {
    if (salaDe[d.id] || enAtrio.has(d.id)) continue;
    const texto = `${d.id} ${d.nombre}`;
    const sala = AFINIDAD.find(([re, s]) => re.test(texto) && libres.has(s))?.[1];
    if (sala) {
      salaDe[d.id] = sala;
      libres.delete(sala);
    }
  }
  for (const d of deptos) {
    if (salaDe[d.id] || enAtrio.has(d.id)) continue;
    const sala = libres.values().next().value;
    if (!sala) break; // Más departamentos que salas: el resto trabaja en el atrio.
    salaDe[d.id] = sala;
    libres.delete(sala);
  }
  return salaDe;
}

/**
 * Lleva un departamento a una sala (o a 'atrio') y devuelve el mapa completo para guardar. Fija el
 * reparto entero del proyecto: si no, al cambiar uno, los automáticos podrían saltar de sala solos.
 */
export function reasignar(
  deptos: readonly Pick<DeptoSala, 'id' | 'nombre'>[],
  fijas: Fijas,
  proyecto: string | null | undefined,
  depto: string,
  sala: string,
  modo: ModoOcupante = 'intercambiar',
  construidas: readonly string[] = [],
): Fijas {
  const salaDe = asignarSalas(deptos, fijas, proyecto, construidas);
  const anterior = salaDe[depto] ?? 'atrio';
  const ocupante = deptos.find((d) => d.id !== depto && salaDe[d.id] === sala)?.id;
  const fuera: Fijas = { ...fijas };
  for (const d of deptos) fuera[clave(proyecto, d.id)] = salaDe[d.id] ?? 'atrio';
  fuera[clave(proyecto, depto)] = sala;
  if (ocupante && sala !== 'atrio') fuera[clave(proyecto, ocupante)] = modo === 'intercambiar' ? anterior : 'atrio';
  return fuera;
}

/** Quita lo elegido a mano en este proyecto: vuelve al reparto automático. */
export function salasAutomaticas(fijas: Fijas, proyecto: string | null | undefined): Fijas {
  const prefijo = clave(proyecto, '');
  return Object.fromEntries(Object.entries(fijas).filter(([k]) => (proyecto ? !k.startsWith(prefijo) : k.includes(':'))));
}

/** ¿Este proyecto tiene salas elegidas a mano? */
export function tieneSalasFijas(fijas: Fijas, proyecto: string | null | undefined): boolean {
  return Object.keys(fijas).some((k) => (proyecto ? k.startsWith(`${proyecto}:`) : !k.includes(':')));
}
