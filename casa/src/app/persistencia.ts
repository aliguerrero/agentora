import type { Atuendo } from '@jules/oficina';

/** Misma clave y forma que el prototipo: `{ [idAgente]: atuendo }`. */
export const CLAVE_ATUENDOS = 'oficina-jules-avatares';

export type AtuendosGuardados = Record<string, Atuendo>;

export type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

/** `localStorage` si existe; en modo privado o con datos bloqueados acceder a él puede lanzar. */
export function almacenLocal(): Almacen | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lee los atuendos guardados. Sin almacenamiento, con JSON roto o con otra forma devuelve `{}`;
 * las entradas que no son objetos se descartan (el motor normaliza el resto al resolver).
 */
export function cargarAtuendos(almacen: Almacen | undefined = almacenLocal()): AtuendosGuardados {
  try {
    const crudo = almacen?.getItem(CLAVE_ATUENDOS);
    if (!crudo) return {};
    const dato: unknown = JSON.parse(crudo);
    if (!esObjeto(dato)) return {};
    const guardados: AtuendosGuardados = {};
    for (const [id, atuendo] of Object.entries(dato)) {
      if (esObjeto(atuendo)) guardados[id] = atuendo as unknown as Atuendo;
    }
    return guardados;
  } catch {
    return {};
  }
}

/** Guarda los atuendos. Si no hay almacenamiento o está lleno, los cambios viven solo en la sesión. */
export function guardarAtuendos(
  atuendos: AtuendosGuardados,
  almacen: Almacen | undefined = almacenLocal(),
): void {
  try {
    almacen?.setItem(CLAVE_ATUENDOS, JSON.stringify(atuendos));
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): el atuendo queda solo en esta sesión.
  }
}

export const CLAVE_AMBIENTE = 'oficina-jules-ambiente';

/**
 * Lee el ambiente en el que se quedó la cámara. Solo vale un id de `validos`: sin
 * almacenamiento, vacío o con un id que ya no existe en la casa devuelve `null` (casa completa).
 */
export function cargarAmbiente(
  validos: readonly string[],
  almacen: Almacen | undefined = almacenLocal(),
): string | null {
  try {
    const id = almacen?.getItem(CLAVE_AMBIENTE);
    return id && validos.includes(id) ? id : null;
  } catch {
    return null;
  }
}

/** Guarda el ambiente elegido; `null` (casa completa) guarda vacío, que se lee como sin preferencia. */
export function guardarAmbiente(
  id: string | null,
  almacen: Pick<Almacen, 'setItem'> | undefined = almacenLocal(),
): void {
  try {
    almacen?.setItem(CLAVE_AMBIENTE, id ?? '');
  } catch {
    // Sin almacenamiento (modo privado o cuota llena): el ambiente queda solo en esta sesión.
  }
}
