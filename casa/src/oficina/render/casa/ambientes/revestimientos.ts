import { alasConstruidas, ambienteDe, plano } from '../../../mansion/plano';
import type { Ambiente } from '../../../mansion/plano';
import { ALTO_LIBRE, ALTO_VANO } from '../arquitectura';
import { LAMINA } from './atlas';
import { plano as planoUnitario } from './formas';
import { charco, luz, resplandor } from './muebles';
import type { ClaveAmbiente, Lado, Taller } from './taller';

/**
 * Revestimientos de cada ambiente: el material dominante sobre sus muros laterales (nunca
 * sobre el muro cortina de vidrio del fondo), el piso cuando cambia (caucho del gimnasio) y
 * las alfombras de las zonas de estar. Los revestimientos de un muro exterior llevan su
 * etiqueta de corte (lado y nivel) para ocultarse junto con ese muro; lo interior, no.
 */

/** La cara interior de un muro lateral de un ambiente. */
export interface Cara {
  ambiente: Ambiente;
  /** x de la cara del muro que mira al ambiente. */
  x: number;
  /** Hacia dónde crece el revestimiento: +1 hacia +x (muro oeste del ambiente), -1 al revés. */
  dir: 1 | -1;
  z0: number;
  z1: number;
  /** Paso libre de la puerta (z) si el muro tiene vano. */
  vano: readonly [number, number] | null;
  /** Muro de la envolvente: su revestimiento se oculta con él. */
  exterior: boolean;
  lado: Extract<Lado, 'este' | 'oeste'>;
}

const EPS = 1e-6;
/** Los revestimientos llegan hasta el cielo de fieltro (2,5 cm bajo la losa). */
const ALTO = ALTO_LIBRE - 0.025;

/** Caras laterales de un ambiente, derivadas de los muros del plano. */
export function carasDe(a: Ambiente): Cara[] {
  return plano.muros
    .filter(
      (m) =>
        m.nivel === a.nivel &&
        m.eje === 'x' &&
        m.tipo !== 'baranda' &&
        (Math.abs(m.pos - a.x0) < EPS || Math.abs(m.pos - a.x1) < EPS) &&
        m.hasta > a.z0 + EPS &&
        m.desde < a.z1 - EPS,
    )
    .map((m): Cara => {
      const oeste = Math.abs(m.pos - a.x0) < EPS;
      const exterior = m.tipo === 'borde';
      const dir = oeste ? 1 : -1;
      return {
        ambiente: a,
        x: exterior ? m.pos : m.pos + dir * 0.1,
        dir,
        z0: Math.max(m.desde, a.z0),
        z1: Math.min(m.hasta, a.z1),
        vano: m.vano ? [m.vano.centro - m.vano.ancho / 2, m.vano.centro + m.vano.ancho / 2] : null,
        exterior,
        lado: oeste ? 'oeste' : 'este',
      };
    });
}

/** Rectángulos (z0, z1, y0, y1) de la cara que no son vano. */
function tramos(c: Cara, y0 = 0, y1 = ALTO): [number, number, number, number][] {
  if (!c.vano) return [[c.z0, c.z1, y0, y1]];
  const [a, b] = c.vano;
  const lista: [number, number, number, number][] = [
    [c.z0, Math.min(a, c.z1), y0, y1],
    [Math.max(b, c.z0), c.z1, y0, y1],
  ];
  if (y1 > ALTO_VANO)
    lista.push([Math.max(a, c.z0), Math.min(b, c.z1), Math.max(y0, ALTO_VANO), y1]);
  return lista.filter(([z0, z1, ya, yb]) => z1 - z0 > 0.01 && yb - ya > 0.01);
}

const enVano = (c: Cara, z: number, ancho: number) =>
  c.vano !== null && z + ancho / 2 > c.vano[0] && z - ancho / 2 < c.vano[1];

/** Dibuja en la cara con su etiqueta de corte puesta (si es exterior). */
function enCara(t: Taller, c: Cara, fn: () => void): void {
  const antes = t.etiqueta;
  t.etiqueta = c.exterior ? { lado: c.lado, nivel: c.ambiente.nivel } : null;
  fn();
  t.etiqueta = antes;
}

/** Caja pegada a la cara: de `desde` a `desde + grosor` hacia el ambiente. */
function contra(
  t: Taller,
  c: Cara,
  clave: ClaveAmbiente,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  desde: number,
  grosor: number,
  color?: string,
): void {
  const x = c.x + c.dir * (desde + grosor / 2);
  const o = color ? { color } : undefined;
  t.caja(clave, x, c.ambiente.y + (y0 + y1) / 2, (z0 + z1) / 2, grosor, y1 - y0, z1 - z0, o);
}

/** Revestimiento liso de toda la cara (menos el vano). */
function liso(t: Taller, c: Cara, clave: ClaveAmbiente, grosor: number, color?: string): void {
  for (const [z0, z1, y0, y1] of tramos(c)) contra(t, c, clave, z0, z1, y0, y1, 0, grosor, color);
}

/** Listones verticales sobre un fondo: `paso` entre ejes, `ancho` y `relieve` de cada listón. */
function listones(
  t: Taller,
  c: Cara,
  clave: ClaveAmbiente,
  paso: number,
  ancho: number,
  relieve: number,
  desde: number,
  color?: string,
): void {
  for (let z = c.z0 + paso / 2; z < c.z1 - ancho / 2; z += paso) {
    const y0 = enVano(c, z, ancho) ? ALTO_VANO : 0;
    contra(t, c, clave, z - ancho / 2, z + ancho / 2, y0, ALTO, desde, relieve, color);
  }
}

/** Boiserie: rectángulos de moldura en dos alturas (zócalo y paños altos) y un guardasillas. */
function boiserie(t: Taller, c: Cara, desde: number): void {
  const moldura = 0.028;
  const relieve = 0.014;
  const largo = c.z1 - c.z0;
  const n = Math.max(1, Math.round(largo / 1.25));
  const paso = largo / n;
  const marco = (z0: number, z1: number, y0: number, y1: number) => {
    contra(t, c, 'nogal', z0, z1, y0, y0 + moldura, desde, relieve);
    contra(t, c, 'nogal', z0, z1, y1 - moldura, y1, desde, relieve);
    contra(t, c, 'nogal', z0, z0 + moldura, y0, y1, desde, relieve);
    contra(t, c, 'nogal', z1 - moldura, z1, y0, y1, desde, relieve);
  };
  for (let k = 0; k < n; k++) {
    const z0 = c.z0 + k * paso + 0.12;
    const z1 = c.z0 + (k + 1) * paso - 0.12;
    if (c.vano && z1 > c.vano[0] - 0.05 && z0 < c.vano[1] + 0.05) continue;
    marco(z0, z1, 0.18, 0.86);
    marco(z0, z1, 1.08, ALTO - 0.32);
  }
  for (const [z0, z1] of tramos(c, 0, ALTO_VANO).map(([a, b]) => [a, b] as const)) {
    contra(t, c, 'nogal', z0, z1, 0.94, 0.99, desde, relieve * 1.6);
    contra(t, c, 'nogal', z0, z1, 0, 0.12, desde, relieve * 1.4);
  }
}

/** Cuadro enmarcado colgado en una cara, con su lámpara de latón encima. */
function cuadro(
  t: Taller,
  c: Cara,
  z: number,
  yCentro: number,
  w: number,
  h: number,
  rect: (typeof LAMINA)[keyof typeof LAMINA],
  lampara = true,
): void {
  const ry = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  const desde = 0.03;
  contra(
    t,
    c,
    'nogal',
    z - w / 2 - 0.035,
    z + w / 2 + 0.035,
    yCentro - h / 2 - 0.035,
    yCentro + h / 2 + 0.035,
    desde,
    0.035,
  );
  t.pieza(
    'lamina',
    planoUnitario(),
    c.x + c.dir * (desde + 0.036),
    c.ambiente.y + yCentro,
    z,
    w,
    h,
    1,
    { rect, ry },
  );
  if (lampara) {
    contra(
      t,
      c,
      'laton',
      z - w * 0.3,
      z + w * 0.3,
      yCentro + h / 2 + 0.12,
      yCentro + h / 2 + 0.16,
      desde + 0.08,
      0.05,
    );
    contra(
      t,
      c,
      'laton',
      z - 0.01,
      z + 0.01,
      yCentro + h / 2 + 0.05,
      yCentro + h / 2 + 0.14,
      desde,
      0.1,
    );
    luz(t, () =>
      resplandor(
        t,
        c.x + c.dir * (desde + 0.05),
        c.ambiente.y + yCentro + h * 0.2,
        z,
        w * 1.2,
        h * 0.9,
        '#4a3418',
        ry,
      ),
    );
  }
}

/** Alfombra de lana con guarda: campo, borde y un filete, apenas sobre el piso. */
function alfombra(
  t: Taller,
  a: Ambiente,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  campo: string,
  guarda: string,
  filete: string,
): void {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const [w, d] = [x1 - x0, z1 - z0];
  t.bloque('tinte', cx, a.y, cz, w, 0.012, d, { color: guarda });
  t.bloque('tinte', cx, a.y + 0.012, cz, w - 0.36, 0.002, d - 0.36, { color: filete });
  t.bloque('tinte', cx, a.y + 0.013, cz, w - 0.44, 0.002, d - 0.44, { color: campo });
}

const caras = (id: string) => carasDe(ambienteDe(id));
const cara = (id: string, lado: Cara['lado']) => caras(id).filter((c) => c.lado === lado);

/** Gimnasio: muros de grafito con listones, piso de losetas de caucho y un mueble de pesas. */
function gimnasio(t: Taller): void {
  const a = ambienteDe('gimnasio');
  for (const c of caras('gimnasio')) {
    enCara(t, c, () => {
      liso(t, c, 'tinte', 0.02, '#2a2c2f');
      listones(t, c, 'tinte', 0.12, 0.05, 0.03, 0.02, '#3a3d41');
    });
  }
  for (let x = a.x0 + 0.5; x < a.x1; x += 1) {
    for (let z = a.z0 + 0.5; z < a.z1; z += 1) {
      const par = (Math.floor(x) + Math.floor(z)) % 2 === 0;
      t.bloque('tinte', x, a.y, z, 0.99, 0.012, 0.99, { color: par ? '#1d1e20' : '#232427' });
    }
  }
  gimnasioMueble(t, a);
  luz(t, () => charco(t, -14.4, a.y + 0.02, -0.9, 3.2, 4.4, '#2e3442'));
}

/** Mueble bajo de nogal junto al muro oeste: pesas rusas arriba, esterillas enrolladas al lado. */
function gimnasioMueble(t: Taller, a: Ambiente): void {
  // Si se abre una puerta a un ala en ese muro, el mueble le dejaría el paso cerrado.
  if (plano.vanos.some((v) => v.nivel === a.nivel && v.pos === a.x0)) return;
  const [x, z0, z1] = [a.x0 + 0.24, 1.3, 2.9];
  t.bloque('nogal', x, a.y, (z0 + z1) / 2, 0.4, 0.42, z1 - z0);
  t.bloque('laton', x + 0.2, a.y + 0.2, (z0 + z1) / 2, 0.006, 0.012, z1 - z0 - 0.1);
  [0.11, 0.13, 0.15, 0.17].forEach((r, k) => {
    const z = z0 + 0.22 + k * 0.38;
    t.esfera('tinte-brillo', x, a.y + 0.42 + r, z, r, 12, 0.95, { color: '#1b1c1e' });
    t.toro('acero', x, a.y + 0.42 + r * 1.9, z, r * 0.6, 0.016, 14, { ry: Math.PI / 2 });
  });
  for (const [dz, color] of [
    [-0.12, '#b5562f'],
    [0.12, '#6b6d3c'],
  ] as const) {
    t.cilindro('tinte', x, a.y + 0.33, z1 + 0.3 + dz, 0.07, 0.07, 0.62, 14, { color });
  }
}

/** Living: pecho de hormigón de la chimenea hasta el cielo, listones de nogal y alfombra de lana. */
function living(t: Taller): void {
  const a = ambienteDe('living');
  const chimenea = plano.muebles.find((m) => m.tipo === 'chimenea');
  for (const c of caras('living')) {
    enCara(t, c, () => {
      liso(t, c, 'tinte', 0.02, '#3b2a1f');
      listones(t, c, 'nogal', 0.09, 0.055, 0.035, 0.02);
      if (c.lado === 'oeste' && chimenea) {
        const h = chimenea.ancho / 2 + 0.1;
        contra(t, c, 'hormigon', chimenea.z - h, chimenea.z + h, 0, ALTO, 0.02, 0.1);
      }
    });
  }
  const este = cara('living', 'este')[0];
  if (este) cuadro(t, este, -0.5, 1.75, 1.5, 1.5, LAMINA.cuadrado);
  alfombra(t, a, -9.35, -5.95, -2.5, 1.5, '#e6ddcb', '#b9a98d', '#cfc3ad');
}

/** Cocina: muros de mármol y repisas de nogal con tazas y frascos sobre la barra de café. */
function cocina(t: Taller): void {
  for (const c of caras('cocina')) {
    enCara(t, c, () => {
      liso(t, c, 'marmol', 0.025);
      if (c.lado === 'este') {
        for (const y of [1.55, 2.05]) {
          contra(t, c, 'nogal', -2.6, 1.6, y, y + 0.04, 0.025, 0.26);
          for (let k = 0; k < 9; k++) {
            const z = -2.4 + k * 0.45;
            const x = c.x + c.dir * 0.15;
            if (k % 3 === 2) {
              t.cilindro('tinte-brillo', x, c.ambiente.y + y + 0.13, z, 0.05, 0.05, 0.18, 12, {
                color: '#c9b79a',
              });
            } else {
              t.cilindro('tinte-brillo', x, c.ambiente.y + y + 0.08, z, 0.045, 0.04, 0.08, 12, {
                color: y > 2 ? '#2f4a3a' : '#f3efe8',
              });
            }
          }
        }
      }
      if (c.lado === 'oeste') despensa(t, c);
    });
  }
}

/**
 * Muro de columnas de cocina en nogal: despensas de piso a 2,7 m con tiradores largos de latón,
 * dos hornos de vidrio negro y un nicho iluminado con frascos. Deja libre el vano de la puerta.
 */
function despensa(t: Taller, c: Cara): void {
  const [z0, z1] = [c.z0 + 0.05, 1.6];
  const fondo = 0.6;
  const frente = 0.025 + fondo;
  contra(t, c, 'tinte', z0, z1, 0, 0.1, 0.025, fondo - 0.05, '#1b1a18');
  contra(t, c, 'nogal', z0, z1, 0.1, 2.7, 0.025, fondo);
  const puertas = Math.round((z1 - z0) / 0.6);
  const paso = (z1 - z0) / puertas;
  for (let k = 0; k < puertas; k++) {
    const za = z0 + k * paso;
    if (k > 0) contra(t, c, 'tinte', za - 0.003, za + 0.003, 0.12, 2.68, frente, 0.003, '#2a1a10');
    if (k === 2 || k === 6) continue;
    const zt = za + (k % 2 ? 0.06 : paso - 0.06);
    contra(t, c, 'laton', zt - 0.008, zt + 0.008, 0.95, 1.75, frente, 0.025);
  }
  // Hornos en la tercera columna, nicho iluminado en la séptima.
  const horno = z0 + 2 * paso;
  for (const y of [0.95, 1.6]) {
    contra(
      t,
      c,
      'tinte-brillo',
      horno + 0.03,
      horno + paso - 0.03,
      y,
      y + 0.55,
      frente,
      0.006,
      '#0c0d0f',
    );
    contra(
      t,
      c,
      'laton',
      horno + 0.08,
      horno + paso - 0.08,
      y + 0.47,
      y + 0.49,
      frente + 0.006,
      0.03,
    );
  }
  const nicho = z0 + 6 * paso;
  if (nicho + paso <= z1 + 1e-6) {
    contra(
      t,
      c,
      'tinte',
      nicho + 0.04,
      nicho + paso - 0.04,
      1.0,
      1.9,
      frente - 0.003,
      0.004,
      '#2a1a10',
    );
    contra(
      t,
      c,
      'emisivo',
      nicho + 0.06,
      nicho + paso - 0.06,
      1.86,
      1.875,
      frente,
      0.01,
      '#ffd9a0',
    );
    contra(t, c, 'marmol', nicho + 0.04, nicho + paso - 0.04, 1.36, 1.38, frente, 0.2);
    for (let k = 0; k < 3; k++) {
      const z = nicho + 0.15 + k * 0.15;
      const x = c.x + c.dir * (frente + 0.1);
      t.cilindro('tinte-brillo', x, c.ambiente.y + 1.08, z, 0.05, 0.05, 0.16, 12, {
        color: '#c9b79a',
      });
      t.cilindro('tinte-brillo', x, c.ambiente.y + 1.46, z, 0.045, 0.04, 0.16, 12, {
        color: k === 1 ? '#2f4a3a' : '#e9e4da',
      });
    }
  }
}

/** Finanzas: muros de nogal de tablas verticales con tapajuntas y alfombra persa. */
function finanzas(t: Taller): void {
  const a = ambienteDe('finanzas');
  for (const c of caras('finanzas')) {
    enCara(t, c, () => {
      liso(t, c, 'nogal', 0.025);
      listones(t, c, 'nogal', 0.4, 0.03, 0.012, 0.025);
    });
  }
  const este = cara('finanzas', 'este')[0];
  if (este) cuadro(t, este, -3.25, 1.7, 0.6, 1.2, LAMINA.vertical1);
  alfombra(t, a, -13.6, -6.2, -3.05, 1.55, '#6b1e1e', '#1f2a44', '#b8893a');
  // Escalera corredera de nogal apoyada en el riel de los libreros del fondo.
  const libreros = plano.muebles.filter((m) => m.tipo === 'librero' && m.giro === 0);
  const medio = libreros[1];
  if (medio) {
    const x = medio.x + 0.6;
    const [zPie, zArriba, yArriba] = [-3.1, -3.58, a.y + 2.7];
    const largo = Math.hypot(zArriba - zPie, yArriba - a.y);
    const inclinacion = Math.atan2(zPie - zArriba, yArriba - a.y);
    t.en(
      x,
      a.y,
      zPie,
      0,
      () => {
        for (const s of [-1, 1]) t.caja('nogal', s * 0.22, largo / 2, 0, 0.04, largo, 0.05);
        for (let k = 1; k < 9; k++)
          t.cilindro('laton', 0, k * (largo / 9), 0, 0.012, 0.012, 0.44, 8, { rz: Math.PI / 2 });
      },
      -inclinacion,
    );
  }
}

/** Ventas: boiserie de nogal, un cuadro con lámpara de latón y una alfombra óxido. */
function ventas(t: Taller): void {
  const a = ambienteDe('ventas');
  for (const c of caras('ventas')) {
    enCara(t, c, () => {
      liso(t, c, 'nogal', 0.02);
      boiserie(t, c, 0.02);
    });
  }
  const oeste = cara('ventas', 'oeste')[0];
  if (oeste) cuadro(t, oeste, -3.25, 1.75, 0.6, 1.2, LAMINA.vertical2);
  alfombra(t, a, 7.0, 13.0, -2.75, 1.75, '#7e3a24', '#e6dccb', '#c9a25a');
}

/** Desarrollo: tinta azul noche con una línea de luz fría y el resplandor del videowall. */
function desarrollo(t: Taller): void {
  for (const c of caras('desarrollo')) {
    enCara(t, c, () => {
      liso(t, c, 'tinte', 0.02, '#151b27');
      listones(t, c, 'tinte', 0.6, 0.012, 0.012, 0.02, '#1f2738');
      contra(t, c, 'emisivo', c.z0, c.vano ? c.vano[0] : c.z1, 2.9, 2.915, 0.03, 0.012, '#3f7cff');
      contra(t, c, 'emisivo', c.z0, c.vano ? c.vano[0] : c.z1, 0.12, 0.13, 0.03, 0.012, '#2a58c8');
    });
  }
  const a = ambienteDe('desarrollo');
  alfombra(t, a, -15.4, -5.2, -3.2, 1.6, '#23272e', '#1a1d22', '#2c3a5c');
}

/** Contenido: paños de fieltro antracita en retícula, tiras de luz fría y alfombra acústica. */
function contenido(t: Taller): void {
  for (const c of caras('contenido')) {
    enCara(t, c, () => {
      liso(t, c, 'fieltro', 0.015);
      for (const [z0, z1, y0, y1] of tramos(c)) {
        for (let z = z0 + 0.02; z < z1 - 0.2; z += 0.62) {
          for (let y = y0 + 0.02; y < y1 - 0.2; y += 0.6) {
            contra(
              t,
              c,
              'fieltro',
              z,
              Math.min(z + 0.6, z1 - 0.02),
              y,
              Math.min(y + 0.58, y1 - 0.02),
              0.015,
              0.05,
            );
          }
        }
      }
      if (c.lado === 'oeste') contra(t, c, 'emisivo', -3.6, 1.8, 3.3, 3.32, 0.07, 0.012, '#e8f0ff');
    });
  }
  const a = ambienteDe('contenido');
  alfombra(t, a, 5.2, 13.2, -3.1, 1.5, '#2b2d31', '#202226', '#5a3a2c');
  luz(t, () => charco(t, 14.2, a.y + 0.02, -0.7, 2.6, 3, '#28303e'));
}

/** Observatorio: carta estelar mural con marco de latón, nogal enfrente y alfombra redonda. */
function observatorio(t: Taller): void {
  const a = ambienteDe('investigacion');
  for (const c of caras('investigacion')) {
    enCara(t, c, () => {
      if (c.lado === 'oeste') {
        const [z0, z1, y0, y1] = [c.z0 + 0.12, c.z1 - 0.08, 0.12, ALTO - 0.12];
        t.pieza(
          'lamina',
          planoUnitario(),
          c.x + c.dir * 0.031,
          a.y + (y0 + y1) / 2,
          (z0 + z1) / 2,
          z1 - z0,
          y1 - y0,
          1,
          { rect: LAMINA.estrellas, ry: Math.PI / 2 },
        );
        for (const [za, zb, ya, yb] of [
          [z0 - 0.04, z1 + 0.04, y0 - 0.04, y0],
          [z0 - 0.04, z1 + 0.04, y1, y1 + 0.04],
          [z0 - 0.04, z0, y0, y1],
          [z1, z1 + 0.04, y0, y1],
        ] as const) {
          contra(t, c, 'laton', za, zb, ya, yb, 0.02, 0.02);
        }
      } else {
        liso(t, c, 'nogal', 0.025);
        listones(t, c, 'nogal', 0.14, 0.06, 0.02, 0.025);
      }
    });
  }
  t.cilindro('tinte', -0.6, a.y + 0.006, -2.0, 1.9, 1.9, 0.012, 40, { color: '#1d2a44' });
  t.cilindro('tinte', -0.6, a.y + 0.013, -2.0, 1.75, 1.75, 0.002, 40, { color: '#c9a25a' });
  t.cilindro('tinte', -0.6, a.y + 0.014, -2.0, 1.7, 1.7, 0.002, 40, { color: '#22325a' });
}

/** Las salas construidas: un solo revestimiento de la casa, según su estilo, en sus dos muros. */
function alaConstruida(t: Taller, a: Ambiente): void {
  const lado = a.ala as Cara['lado'];
  const muroCasa: Cara = {
    ambiente: a,
    x: lado === 'este' ? a.x0 : a.x1,
    dir: lado === 'este' ? 1 : -1,
    z0: a.z0,
    z1: a.z1,
    vano: [2.4, 3.6],
    exterior: true,
    lado,
  };
  for (const c of [muroCasa, ...carasDe(a)]) {
    enCara(t, c, () => {
      if (a.revestimiento === 'fieltro') {
        liso(t, c, 'fieltro', 0.015);
      } else if (a.revestimiento === 'nogal') {
        liso(t, c, 'nogal', 0.02);
        boiserie(t, c, 0.02);
      } else {
        liso(t, c, 'tinte', 0.02, '#151b27');
        listones(t, c, 'tinte', 0.6, 0.012, 0.012, 0.02, '#1f2738');
      }
    });
  }
  if (a.revestimiento === 'nogal') alfombra(t, a, a.x0 + 0.7, a.x1 - 0.7, -3.2, 1.9, '#7e3a24', '#e6dccb', '#c9a25a');
  if (a.revestimiento === 'fieltro') alfombra(t, a, a.x0 + 0.7, a.x1 - 0.7, -3.2, 1.9, '#23272e', '#1a1d22', '#2c3a5c');
}

/** Todos los revestimientos de la casa. */
export function revestir(t: Taller): void {
  gimnasio(t);
  living(t);
  cocina(t);
  finanzas(t);
  ventas(t);
  desarrollo(t);
  contenido(t);
  observatorio(t);
  for (const ala of alasConstruidas()) alaConstruida(t, ala.ambiente);
}
