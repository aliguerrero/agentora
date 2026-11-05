import type { Catalogo, PaqueteSkins } from '../tipos';

/** Crea un catálogo a partir de los datos base (copia superficial, sin paquetes). */
export function crearCatalogo(base: Omit<Catalogo, 'paquetes'>): Catalogo {
  return { ...base, paquetes: [] };
}

function idsRepetidos(
  etiqueta: string,
  existentes: { id: string }[],
  nuevos: { id: string }[],
): void {
  const vistos = new Set(existentes.map((e) => e.id));
  for (const { id } of nuevos) {
    if (vistos.has(id)) throw new Error(`Id duplicado en ${etiqueta}: "${id}"`);
    vistos.add(id);
  }
}

/**
 * Registra un paquete de skins y devuelve un catálogo nuevo (el original no cambia).
 * Lanza si el paquete o alguno de sus ids ya existe.
 */
export function registrarPaquete(catalogo: Catalogo, paquete: PaqueteSkins): Catalogo {
  if (catalogo.paquetes.includes(paquete.id)) {
    throw new Error(`Paquete ya registrado: "${paquete.id}"`);
  }
  const piezas = paquete.piezas ?? [];
  const caras = paquete.caras ?? [];
  const tops = paquete.tops ?? [];
  const disfraces = paquete.disfraces ?? [];
  idsRepetidos(`piezas (paquete "${paquete.id}")`, catalogo.piezas, piezas);
  idsRepetidos(`caras (paquete "${paquete.id}")`, catalogo.caras, caras);
  idsRepetidos(`tops (paquete "${paquete.id}")`, catalogo.tops, tops);
  idsRepetidos(`disfraces (paquete "${paquete.id}")`, catalogo.disfraces, disfraces);
  return {
    ...catalogo,
    piezas: [...catalogo.piezas, ...piezas],
    caras: [...catalogo.caras, ...caras],
    tops: [...catalogo.tops, ...tops],
    disfraces: [...catalogo.disfraces, ...disfraces],
    paquetes: [...catalogo.paquetes, paquete.id],
  };
}
