import { ZONAS } from '../tipos';
import type { Atuendo, AtuendoResuelto, Catalogo, Pieza, Zona } from '../tipos';

type Aviso = (mensaje: string) => void;

const esZona = (zona: string): zona is Zona => (ZONAS as readonly string[]).includes(zona);

function texto(valor: unknown, defecto: string): string {
  return typeof valor === 'string' ? valor : defecto;
}

function opcion(
  valor: unknown,
  validos: { id: string }[],
  etiqueta: string,
  onAviso?: Aviso,
): string {
  const defecto = validos[0]?.id ?? '';
  if (valor === undefined) return defecto;
  if (typeof valor === 'string' && validos.some((o) => o.id === valor)) return valor;
  onAviso?.(`${etiqueta} desconocido: ${JSON.stringify(valor)}; se usa "${defecto}"`);
  return defecto;
}

/**
 * Normaliza un atuendo: completa faltantes, descarta campos extra y deja una sola
 * pieza por zona (gana la última de `acc`). No aplica exclusiones: el dato queda intacto.
 */
function normalizar(catalogo: Catalogo, entrada: unknown, onAviso?: Aviso): Atuendo {
  const src: Record<string, unknown> =
    typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>) : {};

  const porZona = new Map<Zona, string>();
  const crudo = Array.isArray(src['acc']) ? src['acc'] : [];
  for (const id of crudo) {
    if (typeof id !== 'string') continue;
    const pieza = catalogo.piezas.find((p) => p.id === id);
    if (!pieza) {
      onAviso?.(`Pieza desconocida descartada: "${id}"`);
      continue;
    }
    if (!esZona(pieza.zona)) {
      onAviso?.(`Pieza "${id}" descartada: zona desconocida "${String(pieza.zona)}"`);
      continue;
    }
    porZona.delete(pieza.zona);
    porZona.set(pieza.zona, id);
  }

  return {
    skin: texto(src['skin'], catalogo.pieles[0] ?? ''),
    face: opcion(src['face'], catalogo.caras, 'Cara', onAviso),
    hair: opcion(src['hair'], catalogo.peinados, 'Peinado', onAviso),
    hairColor: texto(src['hairColor'], catalogo.coloresPelo[0] ?? ''),
    top: opcion(src['top'], catalogo.tops, 'Top', onAviso),
    topColor: texto(src['topColor'], catalogo.coloresTop[0] ?? ''),
    print: texto(src['print'], ''),
    bottom: opcion(src['bottom'], catalogo.bottoms, 'Bottom', onAviso),
    bottomColor: texto(src['bottomColor'], catalogo.coloresBottom[0] ?? ''),
    shoes: texto(src['shoes'], catalogo.coloresZapatos[0] ?? ''),
    acc: [...porZona.values()],
  };
}

/**
 * Resuelve un atuendo (guardado, de rol o del vestidor) a su vista de render:
 * normaliza y aplica las exclusiones de zona de forma determinista, sin depender
 * del orden de `acc`. Las piezas con `excluye` tienen prioridad.
 * `onAviso` recibe cada pieza descartada o valor desconocido.
 */
export function resolverAtuendo(
  catalogo: Catalogo,
  entrada: unknown,
  onAviso?: Aviso,
): AtuendoResuelto {
  const atuendo = normalizar(catalogo, entrada, onAviso);
  const piezas = atuendo.acc
    .map((id, orden) => ({ pieza: catalogo.piezas.find((p) => p.id === id) as Pieza, orden }))
    .sort(
      (a, b) =>
        (b.pieza.excluye?.length ?? 0) - (a.pieza.excluye?.length ?? 0) || a.orden - b.orden,
    );

  const ocultas = new Set<Zona>();
  const visibles = new Set<string>();
  for (const { pieza } of piezas) {
    if (ocultas.has(pieza.zona)) continue;
    visibles.add(pieza.id);
    for (const zona of pieza.excluye ?? []) ocultas.add(zona);
  }

  return {
    ...atuendo,
    acc: atuendo.acc.filter((id) => visibles.has(id)),
    ocultas: ZONAS.filter((z) => ocultas.has(z)),
  };
}

/** Equipa o quita una pieza. Equipar reemplaza la pieza de su misma zona. Lanza si el id no existe. */
export function alternarPieza(catalogo: Catalogo, atuendo: Atuendo, id: string): Atuendo {
  if (!catalogo.piezas.some((p) => p.id === id)) {
    throw new Error(`Pieza no encontrada en el catálogo: "${id}"`);
  }
  const acc = atuendo.acc.includes(id) ? atuendo.acc.filter((x) => x !== id) : [...atuendo.acc, id];
  return normalizar(catalogo, { ...atuendo, acc });
}

/** Aplica un skin (atuendo parcial, p. ej. un disfraz) sobre el atuendo actual. */
export function aplicarSkin(
  catalogo: Catalogo,
  atuendo: Atuendo,
  parche: Partial<Atuendo>,
): Atuendo {
  return normalizar(catalogo, { ...atuendo, ...parche });
}
