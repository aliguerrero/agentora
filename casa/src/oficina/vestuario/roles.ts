import { catalogoBase } from '../catalogo/base';
import type { Atuendo } from '../tipos';

export const LOOK_POR_ROL: Record<string, Partial<Atuendo>> = {
  'Front designer': {
    top: 'poleron',
    topColor: '#b98ad6',
    hair: 'corto',
    acc: ['gorro'],
    print: '',
  },
  Backend: { top: 'polera', topColor: '#2b2f36', hair: 'rizos', acc: ['audifonos'], print: '{ }' },
  QA: { top: 'camisa', topColor: '#7fc4de', hair: 'mono', acc: ['lentes'] },
  Integrador: { top: 'blazer', topColor: '#2f3e63', hair: 'corto', acc: [] },
  'Ejecutivo de ventas': { top: 'blazer', topColor: '#3b3f46', hair: 'corto', acc: ['audifonos'] },
  'Analista comercial': { top: 'camisa', topColor: '#e9ecef', hair: 'largo', acc: ['lentes'] },
  Redactor: { top: 'poleron', topColor: '#d9825f', hair: 'largo', acc: [] },
  Guionista: { top: 'polera', topColor: '#d8b56a', hair: 'rizos', acc: ['gorro'], print: '★' },
  'Editor de video': { top: 'poleron', topColor: '#151719', hair: 'corto', acc: ['gorra'] },
  Community: { top: 'polera', topColor: '#d9825f', hair: 'largo', acc: [], print: '♥' },
  Contador: { top: 'camisa', topColor: '#e9ecef', hair: 'rapado', acc: ['lentes', 'taza'] },
  Planificador: { top: 'blazer', topColor: '#3f6b52', hair: 'mono', acc: [] },
  Cobranza: { top: 'polera', topColor: '#79b98a', hair: 'corto', acc: [] },
  'Asistente personal': { top: 'blazer', topColor: '#8a5a2b', hair: 'mono', acc: [] },
  Coach: { top: 'deportiva', topColor: '#5b7fd6', bottom: 'short', hair: 'rapado', acc: [] },
  Compras: { top: 'polera', topColor: '#7fc4de', hair: 'corto', acc: ['gorra', 'mochila'] },
  Científico: { top: 'bata', topColor: '#e9ecef', hair: 'rizos', acc: ['lentes'] },
  'Vigía de novedades': { top: 'poleron', topColor: '#2f3e63', hair: 'largo', acc: ['audifonos'] },
  Verificador: { top: 'camisa', topColor: '#d8b56a', hair: 'corto', acc: ['lentes'] },
};

const CARAS_POR_INDICE = ['feliz', 'sonrisa', 'concentrado', 'guino', 'serio'];

/**
 * Atuendo por defecto de un rol (equivale a `defaultAvatar` del prototipo).
 * `indice` varía piel, cara, color de pelo, pantalón y zapatos entre agentes del mismo rol.
 */
export function atuendoPorRol(rol: string, indice: number): Atuendo {
  const look = LOOK_POR_ROL[rol] ?? {};
  const { pieles, coloresPelo, coloresBottom, coloresZapatos } = catalogoBase;
  return {
    skin: pieles[(indice * 7 + 2) % pieles.length] ?? '',
    face: CARAS_POR_INDICE[indice % CARAS_POR_INDICE.length] ?? 'feliz',
    hair: look.hair ?? 'corto',
    hairColor: coloresPelo[(indice * 3) % 6] ?? '',
    top: look.top ?? 'polera',
    topColor: look.topColor ?? '#5b7fd6',
    print: look.print ?? '',
    bottom: look.bottom ?? 'pantalon',
    bottomColor: coloresBottom[indice % 4] ?? '',
    shoes: coloresZapatos[indice % 3] ?? '',
    acc: [...(look.acc ?? [])],
  };
}
