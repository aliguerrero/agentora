import { alasConstruidas, ambienteDe, plano } from '../../../mansion/plano';
import type { Taller } from './taller';

/**
 * Detalles con mesura: plantas en maceteros de cerámica en las esquinas libres de cada ambiente
 * y una mesita de teca entre las reposeras. Las posiciones están elegidas lejos de lugares,
 * salidas y muebles del plano (lo comprueban las pruebas).
 */

type Planta = 'ficus' | 'sansevieria' | 'palma' | 'olivo';

export interface Detalle {
  ambiente: string;
  x: number;
  z: number;
  /** Radio que ocupa en planta. */
  radio: number;
  tipo: Planta | 'mesita';
  maceta: string;
}

export const DETALLES: readonly Detalle[] = [
  { ambiente: 'living', x: -4.6, z: -3.4, radio: 0.35, tipo: 'olivo', maceta: '#d8cfc0' },
  { ambiente: 'gimnasio', x: -10.65, z: -3.5, radio: 0.25, tipo: 'sansevieria', maceta: '#1b1c1e' },
  { ambiente: 'finanzas', x: -4.75, z: -3.35, radio: 0.32, tipo: 'ficus', maceta: '#b5562f' },
  { ambiente: 'ventas', x: 4.75, z: -3.35, radio: 0.32, tipo: 'palma', maceta: '#e9e4da' },
  { ambiente: 'desarrollo', x: -4.7, z: -3.3, radio: 0.3, tipo: 'ficus', maceta: '#1b1c1e' },
  {
    ambiente: 'desarrollo',
    x: -15.45,
    z: -3.4,
    radio: 0.25,
    tipo: 'sansevieria',
    maceta: '#e9e4da',
  },
  { ambiente: 'contenido', x: 4.6, z: -3.35, radio: 0.25, tipo: 'sansevieria', maceta: '#b5562f' },
  { ambiente: 'cocina', x: 15.4, z: 3.2, radio: 0.32, tipo: 'olivo', maceta: '#e9e4da' },
  { ambiente: 'investigacion', x: 3.45, z: -3.45, radio: 0.3, tipo: 'palma', maceta: '#1d2a44' },
  { ambiente: 'terraza', x: -14.5, z: 5.4, radio: 0.2, tipo: 'mesita', maceta: '#000000' },
];

function semilla(n: number) {
  let s = n;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function planta(t: Taller, d: Detalle, y: number, n: number): void {
  const r = semilla(n * 131 + 7);
  const alto = d.radio * 1.4;
  t.cilindro('tinte-brillo', d.x, y + alto / 2, d.z, d.radio * 0.85, d.radio * 0.65, alto, 18, {
    color: d.maceta,
  });
  t.cilindro('tinte', d.x, y + alto - 0.02, d.z, d.radio * 0.8, d.radio * 0.8, 0.02, 14, {
    color: '#3a2a1e',
  });
  const base = y + alto;
  if (d.tipo === 'sansevieria') {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const h = 0.55 + r() * 0.45;
      t.caja(
        'tinte',
        d.x + Math.cos(a) * 0.06,
        base + h / 2,
        d.z + Math.sin(a) * 0.06,
        0.06,
        h,
        0.012,
        {
          ry: a,
          rx: (r() - 0.5) * 0.25,
          rz: (r() - 0.5) * 0.25,
          color: k % 3 ? '#3f5a2c' : '#566f34',
        },
      );
    }
    return;
  }
  if (d.tipo === 'palma') {
    t.cilindro('tinte', d.x, base + 0.35, d.z, 0.025, 0.035, 0.7, 6, { color: '#6b5a3a' });
    for (let k = 0; k < 9; k++) {
      const a = (k * 2 * Math.PI) / 9;
      t.en(d.x, base + 0.55 + (k % 3) * 0.12, d.z, a, () => {
        t.caja('tinte', 0, 0.12, 0.32, 0.16, 0.012, 0.7, {
          rx: -0.35 - (k % 2) * 0.25,
          color: '#4d6b30',
        });
      });
    }
    return;
  }
  const tronco = d.tipo === 'olivo' ? 1.1 : 1.3;
  t.cilindro('tinte', d.x, base + tronco / 2, d.z, 0.025, 0.04, tronco, 6, {
    color: d.tipo === 'olivo' ? '#6a5b48' : '#5a4632',
    rz: 0.06,
  });
  const verde =
    d.tipo === 'olivo' ? ['#7d8a5c', '#6b7a4c', '#8e9a6a'] : ['#2f5a24', '#3d6b2c', '#27491e'];
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2;
    const dist = 0.08 + r() * 0.18;
    t.esfera(
      'tinte',
      d.x + Math.cos(a) * dist,
      base + tronco * (0.6 + r() * 0.5),
      d.z + Math.sin(a) * dist,
      0.13 + r() * 0.09,
      7,
      0.8,
      { color: verde[k % 3] },
    );
  }
}

function mesita(t: Taller, d: Detalle, y: number): void {
  t.cilindro('deck', d.x, y + 0.42, d.z, d.radio, d.radio, 0.03, 20);
  t.cilindro('deck', d.x, y + 0.2, d.z, 0.03, 0.04, 0.4, 8);
  t.cilindro('deck', d.x, y + 0.01, d.z, 0.14, 0.14, 0.02, 16);
  t.cilindro('tinte-brillo', d.x - 0.06, y + 0.5, d.z, 0.03, 0.025, 0.13, 10, { color: '#e2b04a' });
  t.cilindro('tinte-brillo', d.x + 0.07, y + 0.49, d.z + 0.03, 0.028, 0.024, 0.11, 10, {
    color: '#e66a3a',
  });
}

/** Dibuja los detalles sobre el piso de su ambiente. */
export function detallar(t: Taller): void {
  DETALLES.forEach((d, n) => {
    const a = ambienteDe(d.ambiente);
    // Una maceta no se queda delante de la puerta de un ala nueva.
    const estorba = plano.vanos.some(
      (v) =>
        v.nivel === a.nivel &&
        Math.abs(v.pos) === 16 &&
        Math.abs(d.x - v.pos) < 1.2 &&
        Math.abs(d.z - v.centro) < 1,
    );
    if (estorba) return;
    if (d.tipo === 'mesita') mesita(t, d, a.y);
    else planta(t, d, a.y, n);
  });
  alasConstruidas().forEach((ala, i) => {
    const p = ala.planta;
    planta(t, { ...p, tipo: p.tipo as Planta }, ala.ambiente.y, 100 + i);
  });
}
