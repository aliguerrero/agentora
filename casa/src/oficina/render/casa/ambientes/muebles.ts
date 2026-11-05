import type { Mueble } from '../../../mansion/plano';
import { ASIENTOS } from './asientos';
import { DATOS, LAMINA, rectCodigo, TODO } from './atlas';
import { arco, pista, placaConAgujero, plano } from './formas';
import { colocarLibros } from './libros';
import type { Taller } from './taller';

/**
 * Un dibujo por tipo de mueble del plano. Cada dibujo trabaja en las coordenadas locales del
 * mueble: origen en el centro de su huella sobre el piso, ancho a lo largo de x, fondo a lo
 * largo de z con el frente hacia +z (hacia donde mira quien lo usa) y alto en y. Lo que va
 * encima (monitores, lámparas, tazas) se anota como `<id>:encima` y la luz pintada sin dueño:
 * así las pruebas comprueban que el cuerpo del mueble respeta su huella.
 */

const PI = Math.PI;
/** Cuero coñac de los sillones y taburetes. */
const COGNAC = '#8e4a26';

type Dibujo = (t: Taller, m: Mueble, i: number) => void;

function encima(t: Taller, m: Mueble, fn: () => void): void {
  const antes = t.dueno;
  t.dueno = `${m.id}:encima`;
  fn();
  t.dueno = antes;
}

/** Luz pintada (halos): sin dueño, puede salirse de la huella. */
export function luz(t: Taller, fn: () => void): void {
  const antes = t.dueno;
  t.dueno = null;
  fn();
  t.dueno = antes;
}

/** Halo horizontal (charco de luz) de `w × d` a la altura `y`. */
export function charco(
  t: Taller,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  color: string,
): void {
  t.pieza('halo', plano(), x, y, z, w, d, 1, { rect: TODO, color, rx: -PI / 2 });
}

/** Halo vertical (resplandor) de `w × h` que mira a +z. */
export function resplandor(
  t: Taller,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  color: string,
  ry = 0,
): void {
  t.pieza('halo', plano(), x, y, z, w, h, 1, { rect: TODO, color, ry });
}

/**
 * Dorso terminado de una pieza colgada del muro cortina (se ve al orbitar por detrás): paño de
 * nogal con un filete de latón, en vez de una placa negra.
 */
function dorso(t: Taller, w: number, h: number, z: number): void {
  t.bloque('nogal', 0, 0, z, w, h, 0.018);
  t.bloque('laton', 0, h / 2, z - 0.01, w - 0.1, 0.012, 0.004);
}

/** Pantalla con marco: caja negra y, delante, el plano emisivo con la región del atlas. */
function pantalla(
  t: Taller,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  contenido: { clave: 'codigo' | 'datos'; rect: Parameters<Taller['pieza']>[8] },
  ry = 0,
  marco = 0.018,
): void {
  t.en(x, y, z, ry, () => {
    t.caja('acero', 0, 0, -0.012, w + marco * 2, h + marco * 2, 0.024);
    t.pieza(contenido.clave, plano(), 0, 0, 0.0015, w, h, 1, contenido.rect);
  });
}

// --- Trabajo ---

const escritorioNogal: Dibujo = (t, m, i) => {
  const { ancho: w, fondo: d } = m;
  t.bloque('nogal', 0, 0.7, 0, w, 0.04, d);
  // Un costado en cascada de nogal y, del otro, dos patas finas de acero: se lee flotante.
  t.bloque('nogal', -w / 2 + 0.02, 0, 0, 0.04, 0.7, d);
  for (const z of [-d / 2 + 0.06, d / 2 - 0.06])
    t.bloque('acero', w / 2 - 0.08, 0, z, 0.03, 0.7, 0.03);
  t.bloque('acero', w / 2 - 0.08, 0.66, 0, 0.03, 0.03, d - 0.12);
  t.bloque('nogal', -w / 2 + 0.26, 0.56, -0.04, 0.44, 0.14, d - 0.14);
  t.bloque('laton', -w / 2 + 0.26, 0.62, d / 2 - 0.105, 0.18, 0.012, 0.012);
  encima(t, m, () => {
    const desarrollo = m.ambiente === 'desarrollo';
    if (desarrollo) {
      for (const [k, s] of [
        [0, -1],
        [1, 1],
      ] as const) {
        t.en(s * 0.3, 0.74, -d / 2 + 0.16, -s * 0.2, () => {
          t.bloque('acero', 0, 0, 0, 0.2, 0.012, 0.14);
          t.bloque('acero', 0, 0, -0.03, 0.035, 0.24, 0.02);
          pantalla(t, 0, 0.36, 0, 0.56, 0.32, {
            clave: 'codigo',
            rect: { rect: rectCodigo(i * 2 + k, 0.56 / 0.32, (i * 0.37 + k * 0.21) % 1) },
          });
        });
      }
    } else {
      t.en(0.1, 0.74, -d / 2 + 0.16, 0, () => {
        t.bloque('acero', 0, 0, 0, 0.22, 0.012, 0.15);
        t.bloque('acero', 0, 0, -0.03, 0.035, 0.24, 0.02);
        pantalla(t, 0, 0.36, 0, 0.62, 0.35, {
          clave: 'datos',
          rect: { rect: i % 2 ? DATOS.onda : DATOS.kpi },
        });
      });
      // Micrófono de pódcast en brazo articulado.
      t.en(-w / 2 + 0.2, 0.74, -d / 2 + 0.12, 0, () => {
        t.cilindro('acero', 0, 0.01, 0, 0.05, 0.05, 0.02, 12);
        t.caja('acero', 0, 0.2, 0, 0.018, 0.4, 0.018);
        t.caja('acero', 0, 0.42, 0.14, 0.018, 0.018, 0.3, { rx: 0.35 });
        t.cilindro('tinte', 0, 0.42, 0.3, 0.035, 0.035, 0.14, 12, { color: '#1a1b1e' });
        t.cilindro('laton', 0, 0.42, 0.3, 0.037, 0.037, 0.02, 12);
      });
    }
    // Teclado, ratón y taza.
    t.bloque('tinte-brillo', 0, 0.74, 0.1, 0.42, 0.014, 0.13, { color: '#2a2c30' });
    t.bloque('tinte-brillo', 0.3, 0.74, 0.12, 0.06, 0.02, 0.1, { color: '#2a2c30' });
    if (i % 2 === 0) {
      t.cilindro('tinte-brillo', 0.52, 0.79, -0.05, 0.04, 0.035, 0.1, 12, {
        color: i % 4 ? '#f3efe8' : '#2f4a3a',
      });
    }
    // Lámpara de escritorio de latón con su charco de luz.
    t.en(w / 2 - 0.14, 0.74, -d / 2 + 0.12, 0, () => {
      t.cilindro('laton', 0, 0.008, 0, 0.065, 0.07, 0.016, 16);
      t.cilindro('laton', 0, 0.2, 0, 0.007, 0.007, 0.38, 6);
      t.cilindro('laton', 0, 0.39, 0.07, 0.006, 0.006, 0.16, 6, { rx: PI / 2 - 0.4 });
      t.cilindro('laton', 0, 0.42, 0.15, 0.025, 0.07, 0.1, 16);
      t.cilindro('emisivo', 0, 0.37, 0.15, 0.05, 0.05, 0.004, 12, { color: '#fff1d0' });
    });
  });
  luz(t, () => charco(t, w / 2 - 0.2, 0.745, -0.02, 0.7, 0.55, '#7a5a30'));
};

/** Silla de oficina: base de cinco radios, cojín sobre bandeja y respaldo de malla curvo. */
const sillaMalla: Dibujo = (t) => {
  const { arriba, abajo } = ASIENTOS['silla-malla'];
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * PI) / 5;
    t.en(0, 0, 0, a, () => {
      t.caja('acero', 0, 0.065, 0.11, 0.035, 0.03, 0.2, { rx: 0.08 });
      t.esfera('tinte', 0, 0.025, 0.21, 0.025, 8, 1, { color: '#141516' });
    });
  }
  t.cilindro('laton', 0, 0.09, 0, 0.045, 0.06, 0.04, 16);
  t.cilindro('acero', 0, (0.1 + abajo) / 2, 0, 0.022, 0.022, abajo - 0.1, 10);
  t.cojin(
    'tinte-brillo',
    0,
    abajo + (arriba - abajo - 0.07) / 2,
    0,
    0.44,
    arriba - abajo - 0.07,
    0.44,
    0.03,
    {
      color: '#1e1f22',
    },
  );
  t.cojin('tinte', 0, arriba - 0.04, 0.01, 0.48, 0.08, 0.47, 0.035, { color: '#34373c' });
  // Respaldo: espinazo de acero y malla curva que abraza la espalda.
  t.caja('acero', 0, (abajo + 0.6) / 2, -0.215, 0.05, 0.6 - abajo, 0.025);
  t.pieza('tinte', arco(0.3, 0.025, 0.72, 0.36), 0, 0.53, 0.09, 1, 1, 1, { color: '#2b2e33' });
  t.pieza('acero', arco(0.3, 0.035, 0.74, 0.02), 0, 0.89, 0.085);
};

/** Silla de biblioteca: patas de nogal, faldón, cojín tapizado y respaldo de media luna. */
const sillaMadera: Dibujo = (t, m) => {
  const { arriba, abajo } = ASIENTOS['silla-madera'];
  const tapiz = m.ambiente === 'finanzas' ? '#2f4a3a' : '#25324d';
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.19, 0.19]) t.cilindro('nogal', x, abajo / 2, z, 0.019, 0.014, abajo, 8);
  }
  const alto = arriba - 0.06 - abajo;
  t.bloque('nogal', 0, abajo, 0.21, 0.46, alto, 0.03);
  t.bloque('nogal', 0, abajo, -0.21, 0.46, alto, 0.03);
  t.bloque('nogal', 0.215, abajo, 0, 0.03, alto, 0.4);
  t.bloque('nogal', -0.215, abajo, 0, 0.03, alto, 0.4);
  t.bloque('nogal', 0, abajo + 0.02, 0, 0.4, alto - 0.02, 0.4);
  t.cojin('tinte', 0, arriba - 0.035, 0.005, 0.47, 0.07, 0.45, 0.025, { color: tapiz });
  for (const x of [-0.19, 0.19])
    t.cilindro('nogal', x, (arriba + 0.84) / 2, -0.2, 0.016, 0.018, 0.84 - arriba, 8);
  t.pieza('nogal', arco(0.27, 0.035, 0.78, 0.12), 0, 0.72, 0.06);
  t.caja('nogal', 0, (arriba + 0.72) / 2, -0.215, 0.08, 0.72 - arriba, 0.02);
};

/** Mesa de lectura de nogal con cubierta de cuero, lámpara de banquero y libros. */
const mesaLectura: Dibujo = (t, m, i) => {
  const { ancho: w, fondo: d } = m;
  t.bloque('nogal', 0, 0.7, 0, w, 0.05, d);
  t.bloque('tinte', 0, 0.75, 0.04, w - 0.3, 0.004, d - 0.36, { color: '#24402f' });
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) {
    for (const z of [-d / 2 + 0.07, d / 2 - 0.07]) t.bloque('nogal', x, 0, z, 0.06, 0.7, 0.06);
  }
  t.bloque('nogal', 0, 0.6, d / 2 - 0.05, w - 0.14, 0.1, 0.025);
  t.bloque('nogal', 0, 0.6, -d / 2 + 0.05, w - 0.14, 0.1, 0.025);
  encima(t, m, () => {
    // Lámpara de banquero: base de latón y pantalla verde.
    t.en(-w / 2 + 0.25, 0.75, -d / 2 + 0.16, 0, () => {
      t.bloque('laton', 0, 0, 0, 0.16, 0.02, 0.1);
      t.cilindro('laton', 0, 0.16, 0, 0.008, 0.008, 0.3, 6);
      t.cilindro('tinte-brillo', 0, 0.33, 0.04, 0.09, 0.09, 0.3, 14, {
        rz: PI / 2,
        color: '#1f5a3a',
      });
      t.caja('emisivo', 0, 0.3, 0.06, 0.24, 0.006, 0.04, { color: '#fff0c8' });
    });
    // Pila de libros y un libro abierto.
    const colores = ['#6e1f1c', '#1d2a44', '#c9a35a', '#2c4a3a'];
    colores.forEach((color, k) =>
      t.bloque('tinte', w / 2 - 0.25, 0.75 + k * 0.035, -0.15, 0.24 - k * 0.02, 0.034, 0.17, {
        color,
        ry: k * 0.12,
      }),
    );
    t.bloque('tinte', 0.05, 0.752, 0.12, 0.2, 0.012, 0.26, { color: '#efe8d8', rz: 0.06 });
    t.bloque('tinte', -0.15, 0.752, 0.12, 0.2, 0.012, 0.26, { color: '#efe8d8', rz: -0.06 });
    if (i % 2 === 0)
      t.cilindro('tinte-brillo', 0.4, 0.8, 0.2, 0.04, 0.035, 0.1, 12, { color: '#f3efe8' });
  });
  luz(t, () => charco(t, -w / 2 + 0.3, 0.755, 0, 0.7, 0.6, '#6e5a2a'));
};

/** Mesa de cartas celestes: nogal, carta bajo vidrio, compás de latón y un globo celeste. */
const mesaCartas: Dibujo = (t, m, i) => {
  const { ancho: w, fondo: d } = m;
  t.bloque('nogal', 0, 0.7, 0, w, 0.05, d);
  t.pieza('lamina', plano(), 0, 0.752, 0, w - 0.16, d - 0.16, 1, {
    rect: LAMINA.estrellas,
    rx: -PI / 2,
  });
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    t.bloque('nogal', x, 0, 0, 0.06, 0.7, 0.07);
    t.bloque('nogal', x, 0, 0, 0.1, 0.05, d - 0.08);
  }
  t.bloque('nogal', 0, 0.12, 0, w - 0.2, 0.04, 0.05);
  encima(t, m, () => {
    // Compás de puntas abierto.
    t.caja('laton', 0.15, 0.758, 0.05, 0.2, 0.008, 0.012, { ry: 0.5 });
    t.caja('laton', 0.18, 0.758, 0.02, 0.2, 0.008, 0.012, { ry: -0.4 });
    if (i % 2 === 0) {
      t.en(w / 2 - 0.22, 0.75, -d / 2 + 0.2, 0, () => {
        t.cilindro('nogal', 0, 0.015, 0, 0.08, 0.09, 0.03, 16);
        t.cilindro('laton', 0, 0.09, 0, 0.008, 0.008, 0.14, 6);
        t.esfera('tinte-brillo', 0, 0.25, 0, 0.12, 18, 1, { color: '#1d2a44' });
        t.toro('laton', 0, 0.25, 0, 0.135, 0.006, 32, { ry: 0.4 });
      });
    } else {
      t.bloque('tinte', -w / 2 + 0.3, 0.75, -0.2, 0.22, 0.04, 0.3, { color: '#5a3a26' });
    }
  });
};

/** Mesa de mezcla: cuerpo negro, consola inclinada con faders y medidores, monitores de estudio. */
const mesaMezcla: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) t.bloque('nogal', x, 0, 0, 0.05, 0.95, d);
  t.bloque('nogal', 0, 0.7, 0.08, w - 0.1, 0.04, d - 0.16);
  t.bloque('acero', 0, 0.3, -d / 2 + 0.04, w - 0.1, 0.4, 0.06);
  // Consola inclinada hacia quien se sienta.
  t.en(0, 0.83, -0.18, 0, () => {
    t.caja('acero', 0, 0, 0, w - 0.12, 0.05, 0.42, { rx: 0.42 });
    for (let k = 0; k < 12; k++) {
      const x = -w / 2 + 0.16 + k * 0.095;
      t.caja('tinte', x, 0.026, 0.02, 0.012, 0.004, 0.24, { rx: 0.42, color: '#0d0e10' });
      t.caja('tinte-brillo', x, 0.04 - (k % 3) * 0.02, 0.02 + (k % 3) * 0.04, 0.03, 0.02, 0.018, {
        rx: 0.42,
        color: '#d7dade',
      });
      t.caja('emisivo', x, 0.1, -0.15, 0.012, 0.01, 0.05, {
        rx: 0.42,
        color: k % 5 === 4 ? '#ff4a3a' : k % 3 ? '#4fe08a' : '#f2c24b',
      });
    }
  });
  encima(t, m, () => {
    for (const s of [-1, 1]) {
      t.en(s * (w / 2 - 0.16), 0.95, -d / 2 + 0.14, -s * 0.25, () => {
        t.bloque('tinte', 0, 0, 0, 0.18, 0.28, 0.2, { color: '#151618' });
        t.cilindro('tinte-brillo', 0, 0.1, 0.101, 0.06, 0.06, 0.004, 16, {
          rx: PI / 2,
          color: '#2a2b2e',
        });
        t.cilindro('laton', 0, 0.22, 0.101, 0.022, 0.022, 0.004, 12, { rx: PI / 2 });
      });
    }
    t.en(0, 0.95, -d / 2 + 0.08, 0, () => {
      t.bloque('acero', 0, 0, 0, 0.04, 0.16, 0.03);
      pantalla(t, 0, 0.32, 0.02, 0.62, 0.32, { clave: 'datos', rect: { rect: DATOS.onda } });
    });
  });
};

/** Sillón club de cuero coñac, capitoné, con tachas de latón en los brazos. */
const sillonCuero: Dibujo = (t) => {
  const { arriba, abajo } = ASIENTOS['sillon-cuero'];
  for (const x of [-0.37, 0.37]) {
    for (const z of [-0.37, 0.37]) t.cilindro('laton', x, abajo / 2, z, 0.022, 0.016, abajo, 10);
  }
  const base = arriba - 0.12;
  t.cojin('piel', 0, (abajo + base) / 2, 0, 0.88, base - abajo, 0.86, 0.04, { color: COGNAC });
  t.cojin('piel', 0, (base + arriba) / 2, 0.08, 0.6, arriba - base, 0.66, 0.05, { color: COGNAC });
  for (const s of [-1, 1]) {
    t.cojin('piel', s * 0.375, (abajo + 0.56) / 2, 0.02, 0.13, 0.56 - abajo, 0.84, 0.05, {
      color: COGNAC,
    });
    for (let k = 0; k < 6; k++) t.esfera('laton', s * 0.375, 0.17 + k * 0.06, 0.443, 0.007, 6);
  }
  t.cojin('piel', 0, (base + 0.85) / 2, -0.36, 0.88, 0.85 - base, 0.18, 0.06, { color: COGNAC });
  t.cojin('piel', 0, (arriba + 0.76) / 2, -0.225, 0.6, 0.76 - arriba, 0.12, 0.05, {
    color: COGNAC,
  });
  // Capitoné: botones en rombo sobre el respaldo.
  for (const [x, y] of [
    [-0.2, 0.53],
    [0, 0.53],
    [0.2, 0.53],
    [-0.1, 0.62],
    [0.1, 0.62],
    [-0.2, 0.71],
    [0, 0.71],
    [0.2, 0.71],
  ] as const) {
    t.esfera('tinte', x, y, -0.163, 0.011, 6, 1, { color: '#3a1d10' });
  }
};

/** Mesa de reuniones: cubierta de mármol de puntas redondas sobre dos pedestales. */
const mesaMarmol: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  t.pieza('marmol', pista(w, d, 0.05), 0, 0.7, 0);
  for (const x of [-w / 2 + 0.85, w / 2 - 0.85]) {
    t.cilindro('marmol', x, 0.35, 0, 0.2, 0.24, 0.66, 28);
    t.cilindro('laton', x, 0.015, 0, 0.27, 0.27, 0.03, 28);
  }
  encima(t, m, () => {
    // Un portátil abierto, cuadernos y tazas frente a cada puesto (los puestos van a lo largo de x).
    for (const [x, s] of [
      [-1.4, 1],
      [0, -1],
      [1.4, 1],
      [-1.4, -1],
      [0, 1],
      [1.4, -1],
    ] as const) {
      t.cilindro('tinte-brillo', x + 0.18, 0.795, s * 0.36, 0.04, 0.035, 0.09, 12, {
        color: '#f3efe8',
      });
      t.cilindro('tinte-brillo', x + 0.18, 0.752, s * 0.36, 0.07, 0.07, 0.006, 16, {
        color: '#f3efe8',
      });
    }
    t.en(-0.2, 0.75, 0.32, PI, () => {
      t.bloque('tinte-brillo', 0, 0, 0, 0.34, 0.014, 0.23, { color: '#b9bcc0' });
      t.en(0, 0.014, -0.115, 0, () => {
        t.caja('tinte-brillo', 0, 0.11, -0.04, 0.34, 0.23, 0.01, { rx: -0.3, color: '#b9bcc0' });
        t.pieza('datos', plano(), 0, 0.11, -0.033, 0.31, 0.2, 1, { rect: DATOS.grafico, rx: -0.3 });
      });
    });
    t.bloque('tinte', 0.5, 0.75, -0.28, 0.22, 0.02, 0.3, { color: '#1d2a44', ry: 0.2 });
    // Jarrón de cerámica con ramas al centro.
    t.cilindro('tinte-brillo', 0, 0.86, 0, 0.07, 0.09, 0.22, 16, { color: '#1b1c1e' });
    for (let k = 0; k < 5; k++) {
      t.cilindro('tinte', 0, 1.1, 0, 0.004, 0.004, 0.42, 4, {
        rz: (k - 2) * 0.16,
        rx: (k % 2) * 0.2 - 0.1,
        color: '#5b4632',
      });
    }
  });
};

/** Carro de bar de latón con dos bandejas, botellas, licorera y copas. */
const carroBar: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  for (const x of [-w / 2 + 0.05, w / 2 - 0.15]) {
    for (const z of [-d / 2 + 0.04, d / 2 - 0.04])
      t.cilindro('laton', x, 0.47, z, 0.011, 0.011, 0.86, 8);
  }
  for (const y of [0.2, 0.6]) {
    t.bloque('tinte-brillo', -0.05, y, 0, w - 0.2, 0.012, d - 0.04, { color: '#3a3833' });
    t.bloque('laton', -0.05, y + 0.012, d / 2 - 0.025, w - 0.2, 0.03, 0.008);
    t.bloque('laton', -0.05, y + 0.012, -d / 2 + 0.025, w - 0.2, 0.03, 0.008);
  }
  t.cilindro('laton', w / 2 - 0.08, 0.9, 0, 0.012, 0.012, d - 0.06, 8, { rx: PI / 2 });
  for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) {
    t.toro('acero', -w / 2 + 0.1, 0.097, z, 0.08, 0.016, 18);
  }
  const botellas = [
    ['#8a4a12', 0.24],
    ['#2f4f2a', 0.22],
    ['#cfd8d6', 0.2],
    ['#5b1a1a', 0.19],
    ['#d9a441', 0.23],
  ] as const;
  botellas.forEach(([color, alto], k) => {
    const x = -w / 2 + 0.16 + k * 0.13;
    const z = (k % 2 ? 1 : -1) * 0.08;
    t.cilindro('tinte-brillo', x, 0.612 + alto / 2, z, 0.04, 0.04, alto, 12, { color });
    t.cilindro('tinte-brillo', x, 0.612 + alto + 0.04, z, 0.012, 0.018, 0.1, 8, { color });
  });
  t.esfera('tinte-brillo', 0.42, 0.7, 0, 0.08, 14, 1, { color: '#e1e7e6' });
  t.cilindro('laton', 0.18, 0.68, 0.1, 0.06, 0.05, 0.14, 14);
  for (let k = 0; k < 4; k++)
    t.cilindro('tinte-brillo', -0.3 + k * 0.12, 0.27, 0.06, 0.03, 0.025, 0.08, 10, {
      color: '#dfe6e8',
    });
  t.bloque('tinte', 0.2, 0.232, -0.05, 0.3, 0.06, 0.2, { color: '#6e1f1c' });
};

/** Pantalla grande del pipeline de ventas, enmarcada con un filete de latón. */
const pantallaPipeline: Dibujo = (t, m) => {
  const { ancho: w, alto: h } = m;
  t.bloque('acero', 0, 0, -0.04, w, h, 0.08);
  dorso(t, w, h, -0.09);
  t.bloque('laton', 0, 0, 0.0, w + 0.02, 0.012, 0.02);
  t.bloque('laton', 0, h - 0.012, 0.0, w + 0.02, 0.012, 0.02);
  t.pieza('datos', plano(), 0, h / 2, 0.0015, w - 0.08, h - 0.08, 1, { rect: DATOS.pipeline });
  luz(t, () => charco(t, 0, -m.y + 0.012, 1.2, w + 0.6, 2.2, '#1d3a6a'));
};

/** Videowall curvo de 3 × 2: las columnas de los costados se adelantan hacia la sala. */
const videowall: Dibujo = (t, m) => {
  const { ancho: w, alto: h } = m;
  const pw = w / 3 - 0.02;
  const ph = h / 2 - 0.03;
  dorso(t, w, h, -0.09);
  const contenidos = [
    { clave: 'codigo', rect: rectCodigo(0, pw / ph, 0.1) },
    { clave: 'datos', rect: DATOS.grafico },
    { clave: 'codigo', rect: rectCodigo(2, pw / ph, 0.55) },
    { clave: 'datos', rect: DATOS.kpi },
    { clave: 'codigo', rect: rectCodigo(1, pw / ph, 0.3) },
    { clave: 'datos', rect: DATOS.velas },
  ] as const;
  [-1, 0, 1].forEach((col, c) => {
    const ry = -col * 0.075;
    t.en(col * (w / 3), 0, col === 0 ? -0.05 : 0, ry, () => {
      [0, 1].forEach((fila) => {
        const k = fila * 3 + c;
        const cont = contenidos[k] as (typeof contenidos)[number];
        pantalla(
          t,
          0,
          0.02 + ph / 2 + fila * (ph + 0.03),
          0.02,
          pw - 0.03,
          ph - 0.03,
          {
            clave: cont.clave,
            rect: { rect: cont.rect },
          },
          0,
          0.012,
        );
      });
    });
  });
  luz(t, () => charco(t, 0, -m.y + 0.012, 1.6, w + 1.2, 3.4, '#173a8a'));
};

// --- Contenido ---

const ACENTOS_FIELTRO = ['#8e4a32', '#b88a3a', '#4d5d6e', '#a8746b'];

/** Panel acústico de 6 × 6 losetas de fieltro en relieve, con un dibujo distinto por panel. */
const panelAcustico: Dibujo = (t, m, i) => {
  const { ancho: w, alto: h } = m;
  t.bloque('nogal', 0, 0, -0.08, w, h, 0.04);
  t.bloque('laton', 0, h / 2, -0.1, w - 0.1, 0.012, 0.004);
  const n = 6;
  const lado = w / n;
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      const patron = [(f + c) % 4 === 0, Math.abs(c - 2.5) + f < 3.2, (f * c + f) % 5 === 0][i % 3];
      const acento = ACENTOS_FIELTRO[(f + c + i) % ACENTOS_FIELTRO.length] as string;
      const fondo = (f + c) % 2 ? 0.06 : 0.1;
      const x = -w / 2 + lado * (c + 0.5);
      const y = lado * (f + 0.5);
      if (patron) {
        t.caja('tinte', x, y, -0.06 + fondo / 2, lado - 0.02, lado - 0.02, fondo, {
          color: acento,
        });
      } else {
        t.caja('fieltro', x, y, -0.06 + fondo / 2, lado - 0.02, lado - 0.02, fondo);
      }
    }
  }
};

/** Trazos de cada letra en una celda de 1 × 1 (para el neón). */
const TRAZOS: Record<string, readonly (readonly [number, number, number, number])[]> = {
  A: [
    [0, 0, 0.5, 1],
    [0.5, 1, 1, 0],
    [0.22, 0.42, 0.78, 0.42],
  ],
  L: [
    [0, 1, 0, 0],
    [0, 0, 0.8, 0],
  ],
  I: [[0.5, 0, 0.5, 1]],
  R: [
    [0, 0, 0, 1],
    [0, 1, 0.72, 1],
    [0.72, 1, 0.9, 0.84],
    [0.9, 0.84, 0.9, 0.66],
    [0.9, 0.66, 0.72, 0.5],
    [0.72, 0.5, 0, 0.5],
    [0.4, 0.5, 0.9, 0],
  ],
  E: [
    [0, 0, 0, 1],
    [0, 1, 0.8, 1],
    [0, 0.5, 0.65, 0.5],
    [0, 0, 0.8, 0],
  ],
};

/** Letrero de neón «AL AIRE» rojo sobre una placa negra con separadores de latón. */
const letreroNeon: Dibujo = (t, m) => {
  const { ancho: w, alto: h } = m;
  t.bloque('acero', 0, 0, -0.035, w - 0.06, h, 0.02);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
    for (const y of [0.08, h - 0.08])
      t.cilindro('laton', x, y, -0.015, 0.012, 0.012, 0.03, 8, { rx: PI / 2 });
  }
  const texto = 'AL AIRE';
  const celda = 0.19;
  const paso = 0.225;
  const alto = 0.34;
  const total = texto.length * paso - (paso - celda);
  [...texto].forEach((letra, k) => {
    const x0 = -total / 2 + k * paso;
    for (const [a, b, c, d] of TRAZOS[letra] ?? []) {
      const [xa, ya, xb, yb] = [x0 + a * celda, 0.13 + b * alto, x0 + c * celda, 0.13 + d * alto];
      const largo = Math.hypot(xb - xa, yb - ya);
      t.caja('emisivo', (xa + xb) / 2, (ya + yb) / 2, 0.01, largo + 0.02, 0.022, 0.02, {
        rz: Math.atan2(yb - ya, xb - xa),
        color: '#ff2b3c',
      });
    }
  });
  luz(t, () => {
    resplandor(t, 0, h / 2, 0.04, w + 1.2, h + 1.0, '#a8101c');
    resplandor(t, 0, h / 2, -0.05, w + 2.4, h + 1.8, '#5a0810');
  });
};

/** Aro de luz sobre trípode, con el soporte del teléfono al centro. */
const aroLuz: Dibujo = (t) => {
  for (let k = 0; k < 3; k++) {
    t.en(0, 0, 0, (k * 2 * PI) / 3, () =>
      t.caja('acero', 0, 0.42, 0.12, 0.018, 0.86, 0.018, { rx: 0.3 }),
    );
  }
  t.cilindro('acero', 0, 1.2, 0, 0.014, 0.014, 0.8, 8);
  t.en(0, 1.62, 0, PI / 2, () => {
    t.toro('emisivo', 0, 0, 0, 0.23, 0.022, 36, { color: '#f4f6ff' });
    t.toro('acero', 0, 0, -0.02, 0.23, 0.028, 36);
    t.bloque('tinte', 0, -0.08, 0, 0.08, 0.16, 0.012, { color: '#111214' });
  });
  luz(t, () => resplandor(t, -0.05, 1.62, 0, 1.4, 1.4, '#3c4250', -PI / 2));
};

/** Cámara de cine sobre trípode, con piloto rojo de grabación y monitor de campo. */
const camaraTripode: Dibujo = (t) => {
  for (let k = 0; k < 3; k++) {
    t.en(0, 0, 0, (k * 2 * PI) / 3 + 0.3, () =>
      t.caja('acero', 0, 0.62, 0.14, 0.022, 1.26, 0.022, { rx: 0.24 }),
    );
  }
  t.cilindro('acero', 0, 1.3, 0, 0.03, 0.04, 0.08, 10);
  t.en(0, 1.4, 0, -PI / 2, () => {
    t.cojin('tinte', 0, 0, -0.02, 0.14, 0.14, 0.24, 0.015, { color: '#16171a' });
    t.cilindro('tinte', 0, 0, 0.17, 0.05, 0.055, 0.14, 16, { rx: PI / 2, color: '#0e0f11' });
    t.cilindro('laton', 0, 0, 0.24, 0.056, 0.056, 0.012, 16, { rx: PI / 2 });
    t.esfera('emisivo', 0.05, 0.06, 0.1, 0.008, 6, 1, { color: '#ff2020' });
    pantalla(
      t,
      0,
      0.13,
      -0.08,
      0.13,
      0.08,
      { clave: 'datos', rect: { rect: DATOS.onda } },
      PI,
      0.008,
    );
  });
};

// --- Finanzas ---

/** Librero de nogal de piso a casi el cielo, lleno de lomos, objetos en los huecos y riel de latón. */
const librero: Dibujo = (t, m, i) => {
  const { ancho: w, fondo: d, alto: h } = m;
  const lateral = 0.04;
  const zocalo = 0.1;
  const tapa = 0.05;
  const baldas = 6;
  const espesor = 0.03;
  t.bloque('nogal', 0, 0, -d / 2 + 0.01, w, h, 0.02);
  for (const x of [-w / 2 + lateral / 2, 0, w / 2 - lateral / 2])
    t.bloque('nogal', x, 0, 0, lateral, h, d);
  t.bloque('nogal', 0, 0, 0, w, zocalo, d);
  t.bloque('nogal', 0, h - tapa, 0, w, tapa, d);
  const util = (h - zocalo - tapa - (baldas - 1) * espesor) / baldas;
  for (let b = 0; b < baldas; b++) {
    const y = zocalo + b * (util + espesor);
    if (b > 0) t.bloque('nogal', 0, y - espesor, 0, w, espesor, d);
    for (const [x0, x1, lado] of [
      [-w / 2 + lateral, -lateral / 2, 0],
      [lateral / 2, w / 2 - lateral, 1],
    ] as const) {
      const { libros, huecos } = colocarLibros(
        { x0, x1, alto: util, fondo: d - 0.06 },
        i * 97 + b * 13 + lado * 7 + 1,
      );
      for (const l of libros) {
        t.bloque('tinte', l.x, y, -d / 2 + 0.03 + l.fondo / 2, l.ancho, l.alto, l.fondo, {
          color: l.color,
        });
      }
      huecos.forEach((h0, k) => {
        const cx = (h0.x0 + h0.x1) / 2;
        const tipo = (i + b + k + lado) % 3;
        if (tipo === 0) {
          t.cilindro('tinte-brillo', cx, y + 0.11, 0, 0.05, 0.035, 0.22, 14, {
            color: ['#e9e4da', '#b5562f', '#1b1c1e'][(b + k) % 3],
          });
        } else if (tipo === 1) {
          t.esfera('laton', cx, y + 0.07, 0, 0.065, 14);
          t.bloque('tinte', cx, y, 0, 0.1, 0.012, 0.1, { color: '#1b1c1e' });
        } else {
          for (let s = 0; s < 3; s++) {
            t.bloque('tinte', cx, y + s * 0.03, 0, 0.18 - s * 0.02, 0.028, 0.24, {
              color: ['#e7dcc6', '#6e1f1c', '#1d2a44'][s],
            });
          }
        }
      });
    }
  }
  // Riel de latón para la escalera corredera (en los libreros del muro de fondo).
  if (m.giro === 0) {
    t.cilindro('laton', 0, h - 0.32, d / 2 - 0.02, 0.012, 0.012, w - 0.06, 8, { rz: PI / 2 });
  }
  luz(t, () => resplandor(t, 0, h - tapa - 0.2, d / 2 + 0.01, w, 0.5, '#3a2a12'));
};

/** Bóveda de acero: puerta redonda entreabierta, volante de latón y lingotes con brillo dorado. */
const boveda: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  const radio = 0.68;
  const cy = h / 2 + 0.05;
  t.pieza('acero', placaConAgujero(w, h, radio, 0.14), 0, h / 2, d / 2 - 0.14);
  t.bloque('acero', -w / 2 + 0.06, 0, 0, 0.12, h, d - 0.02);
  t.bloque('acero', w / 2 - 0.06, 0, 0, 0.12, h, d - 0.02);
  t.bloque('acero', 0, h - 0.12, 0, w, 0.12, d - 0.02);
  t.bloque('acero', 0, 0, 0, w, 0.12, d - 0.02);
  t.bloque('acero', 0, 0, -d / 2 + 0.06, w, h, 0.12);
  t.toro('laton', 0, cy - (cy - h / 2), d / 2 + 0.005, radio + 0.04, 0.025, 40);
  // Interior forrado de terciopelo, con baldas de lingotes.
  t.bloque('tinte', 0, 0.12, -d / 2 + 0.13, w - 0.24, h - 0.24, 0.02, { color: '#4a1016' });
  for (const y of [0.62, 1.12]) {
    t.bloque('acero', 0, y - 0.03, -0.1, w - 0.3, 0.03, d - 0.5);
    for (let k = 0; k < 7; k++) {
      const fila = k < 4 ? 0 : 1;
      const x = (fila ? -0.3 : -0.45) + (fila ? k - 4 : k) * 0.3;
      t.bloque('laton', x, y + fila * 0.055, -0.15, 0.24, 0.055, 0.11);
    }
  }
  t.caja('emisivo', 0, h - 0.3, -0.1, w - 0.6, 0.02, 0.02, { color: '#ffd68a' });
  // Puerta entreabierta, girada sobre su bisagra.
  t.en(-radio, h / 2, d / 2, -0.42, () => {
    t.en(radio, 0, 0.12, 0, () => {
      t.cilindro('acero', 0, 0, 0, radio + 0.02, radio + 0.02, 0.22, 40, { rx: PI / 2 });
      t.toro('laton', 0, 0, 0.112, radio - 0.08, 0.02, 40);
      for (let k = 0; k < 10; k++) {
        const a = (k * 2 * PI) / 10;
        t.cilindro(
          'laton',
          Math.cos(a) * (radio - 0.18),
          Math.sin(a) * (radio - 0.18),
          0.115,
          0.025,
          0.025,
          0.03,
          10,
          {
            rx: PI / 2,
          },
        );
      }
      t.toro('laton', 0, 0, 0.18, 0.2, 0.018, 28);
      for (let k = 0; k < 3; k++)
        t.caja('laton', 0, 0, 0.18, 0.4, 0.024, 0.024, { rz: (k * PI) / 3 });
      t.cilindro('laton', 0, 0, 0.15, 0.05, 0.06, 0.08, 16, { rx: PI / 2 });
      for (const z of [-0.09, 0.09]) t.cilindro('acero', -radio + 0.02, 0, z, 0.04, 0.04, 0.12, 10);
    });
  });
  luz(t, () => {
    resplandor(t, 0, h / 2, d / 2 + 0.02, 1.9, 1.9, '#a87418');
    resplandor(t, 0, h / 2, -0.2, 1.4, 1.4, '#d49a2a');
    charco(t, 0, 0.01, d / 2 + 0.8, 2.2, 1.6, '#6a4a12');
  });
};

// --- Investigación ---

/** Telescopio refractor de latón sobre trípode de nogal, apuntando a la ranura de la cúpula. */
const telescopio: Dibujo = (t) => {
  const apice = 1.05;
  for (let k = 0; k < 3; k++) {
    t.en(0, 0, 0, (k * 2 * PI) / 3 + PI / 6, () => {
      t.caja('nogal', 0, apice / 2, 0.17, 0.035, 1.09, 0.035, { rx: 0.31 });
      t.cilindro('laton', 0, 0.02, 0.33, 0.02, 0.02, 0.04, 8);
    });
  }
  t.cilindro('laton', 0, apice + 0.04, 0, 0.06, 0.07, 0.08, 16);
  // Tubo a 45° hacia el fondo (-z), donde se abre la cúpula.
  t.en(
    0,
    apice + 0.14,
    0,
    0,
    () => {
      t.cilindro('laton', 0, 0, 0, 0.055, 0.05, 0.86, 20);
      t.cilindro('laton', 0, 0.38, 0, 0.068, 0.068, 0.14, 20);
      t.cilindro('acero', 0, -0.43, 0, 0.03, 0.03, 0.05, 10);
      t.cilindro('tinte', 0, -0.48, 0, 0.018, 0.022, 0.07, 10, { color: '#1a1b1e' });
      t.cilindro('laton', 0.08, 0.15, 0, 0.018, 0.018, 0.3, 10);
      t.toro('acero', 0, 0.2, 0, 0.058, 0.01, 20, { rx: PI / 2 });
      t.toro('acero', 0, -0.25, 0, 0.058, 0.01, 20, { rx: PI / 2 });
    },
    -PI / 4,
  );
};

// --- Personal ---

/** Máquina de poleas: marco negro, columna de placas, guías cromadas y asiento de cuero. */
const maquinaGimnasio: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
    t.bloque('acero', x, 0, -d / 2 + 0.1, 0.07, h, 0.07);
    t.bloque('acero', x, 0, 0, 0.07, 0.05, d - 0.04);
  }
  t.bloque('acero', 0, h - 0.07, -d / 2 + 0.1, w, 0.07, 0.07);
  t.bloque('acero', 0, 0, -d / 2 + 0.1, w, 0.05, 0.12);
  for (let k = 0; k < 12; k++)
    t.bloque('acero', 0, 0.06 + k * 0.045, -d / 2 + 0.1, 0.3, 0.04, 0.12);
  t.bloque('laton', 0.17, 0.06, -d / 2 + 0.1, 0.012, 0.54, 0.02);
  for (const x of [-0.11, 0.11])
    t.cilindro('tinte-brillo', x, h / 2, -d / 2 + 0.1, 0.012, 0.012, h - 0.1, 8, {
      color: '#c9ccd0',
    });
  t.cilindro('acero', 0, h - 0.14, -d / 2 + 0.2, 0.06, 0.06, 0.04, 16, { rx: PI / 2 });
  t.cilindro('tinte', 0, h - 0.47, -d / 2 + 0.28, 0.005, 0.005, 0.6, 4, {
    color: '#121314',
    rx: 0.25,
  });
  t.cilindro('tinte-brillo', 0, h - 0.78, -d / 2 + 0.36, 0.014, 0.014, 0.6, 8, {
    rz: PI / 2,
    color: '#c9ccd0',
  });
  // Banco: poste, asiento y respaldo tapizados.
  t.bloque('acero', 0, 0, 0.18, 0.07, 0.42, 0.07);
  t.cojin('piel', 0, 0.46, 0.2, 0.36, 0.08, 0.36, 0.03, { color: COGNAC });
  t.bloque('acero', 0, 0.45, 0.02, 0.05, 0.5, 0.05);
  t.cojin('piel', 0, 0.8, 0.0, 0.32, 0.5, 0.07, 0.03, { color: COGNAC });
};

/** Banco plano de pesas con pies de acero. */
const bancoPesas: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    t.bloque('acero', x, 0, 0, 0.06, 0.04, d - 0.04);
    t.bloque('acero', x, 0.04, 0, 0.06, 0.34, 0.06);
  }
  t.bloque('acero', 0, 0.34, 0, w - 0.3, 0.04, 0.06);
  t.cojin('piel', 0, 0.43, 0, w - 0.1, 0.1, 0.3, 0.035, { color: COGNAC });
};

/** Rack de dos niveles con pares de mancuernas hexagonales. */
const rackMancuernas: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) {
    t.bloque('acero', x, 0, 0, 0.05, 0.05, d);
    t.bloque('acero', x, 0, -0.05, 0.05, 0.86, 0.05);
  }
  for (const [y, z] of [
    [0.42, 0.08],
    [0.71, -0.05],
  ] as const) {
    t.bloque('acero', 0, y, z, w - 0.04, 0.03, 0.2, { rx: 0.2 });
    for (let k = 0; k < 6; k++) {
      const x = -w / 2 + 0.2 + k * 0.28;
      const r = 0.045 + k * 0.006;
      t.cilindro('tinte-brillo', x, y + 0.03 + r, z, 0.013, 0.013, 0.2, 8, {
        rx: PI / 2,
        color: '#c9ccd0',
      });
      for (const s of [-1, 1]) {
        t.cilindro('tinte', x, y + 0.03 + r, z + s * 0.11, r, r, 0.05, 6, {
          rx: PI / 2,
          color: '#1a1b1d',
        });
      }
    }
  }
};

/** Muro de espejo del gimnasio con marco negro fino. */
const espejoGimnasio: Dibujo = (t, m) => {
  const { ancho: w, alto: h } = m;
  t.bloque('nogal', 0, 0, -0.012, w, h, 0.02);
  t.bloque('espejo-gym', 0, 0.03, 0.004, w - 0.06, h - 0.06, 0.008, { rect: TODO });
};

/** Chimenea lineal de hormigón con caja de fuego negra, lecho de piedras y llamas. */
const chimenea: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  const [y0, y1] = [0.36, 0.72];
  const hueco = w - 0.6;
  t.bloque('hormigon', 0, 0, 0, w, y0, d);
  t.bloque('hormigon', 0, y1, 0, w, h - y1, d);
  for (const s of [-1, 1])
    t.bloque('hormigon', s * (hueco / 2 + (w - hueco) / 4), y0, 0, (w - hueco) / 2, y1 - y0, d);
  t.bloque('acero', 0, y0, -d / 2 + 0.05, hueco, y1 - y0, 0.1);
  t.bloque('acero', 0, y0, 0, hueco, 0.012, d);
  for (let k = 0; k < 26; k++) {
    const x = -hueco / 2 + 0.08 + ((k * 0.37) % 1) * (hueco - 0.16);
    t.esfera(
      k % 3 ? 'tinte' : 'emisivo',
      x,
      y0 + 0.025,
      -0.02 + ((k * 0.61) % 1) * 0.12,
      0.03,
      6,
      0.6,
      {
        color: k % 3 ? '#2a2826' : '#ff6a1a',
      },
    );
  }
  for (const [z, alto] of [
    [-0.04, 0.3],
    [0.04, 0.24],
  ] as const) {
    t.pieza('fuego', plano(), 0, y0 + 0.02 + alto / 2, z, hueco - 0.1, alto, 1, {
      rect: TODO,
      color: '#ffffff',
    });
  }
  luz(t, () => {
    resplandor(t, 0, (y0 + y1) / 2 + 0.05, d / 2 + 0.02, hueco + 0.8, 1.3, '#b0501a');
    charco(t, 0, 0.012, d / 2 + 1.0, w + 0.8, 2.6, '#7a3a10');
  });
};

/** Sofá modular de bouclé: zócalo hundido, tres cojines de asiento y tres de respaldo. */
const sofaModular: Dibujo = (t, m) => {
  const { arriba, abajo } = ASIENTOS['sofa-modular'];
  const { ancho: w, fondo: d } = m;
  const tela = '#e6dfd2';
  t.bloque('tinte', 0, 0, 0, w - 0.1, abajo, d - 0.1, { color: '#2a2622' });
  const base = arriba - 0.14;
  t.cojin('tinte', 0, (abajo + base) / 2, 0, w, base - abajo, d, 0.04, { color: tela });
  const brazo = 0.16;
  for (const s of [-1, 1])
    t.cojin('tinte', s * (w / 2 - brazo / 2), (abajo + 0.58) / 2, 0, brazo, 0.58 - abajo, d, 0.06, {
      color: tela,
    });
  const interior = w - brazo * 2;
  for (let k = 0; k < 3; k++) {
    const x = -interior / 2 + interior * ((k + 0.5) / 3);
    t.cojin(
      'tinte',
      x,
      (base + arriba) / 2,
      0.1,
      interior / 3 - 0.01,
      arriba - base,
      d - 0.24,
      0.05,
      { color: tela },
    );
    t.cojin('tinte', x, 0.6, -d / 2 + 0.17, interior / 3 - 0.02, 0.36, 0.17, 0.07, {
      color: tela,
      rx: -0.12,
    });
  }
  t.cojin('tinte', 0, (base + 0.62) / 2, -d / 2 + 0.06, w, 0.62 - base, 0.12, 0.04, {
    color: tela,
  });
  // Manta doblada sobre un brazo.
  t.cojin('tinte', w / 2 - brazo / 2, 0.6, 0.05, brazo + 0.04, 0.035, 0.5, 0.012, {
    color: '#9a5a3a',
  });
};

/** Mesa de centro de mármol, con libros de arte, un cuenco y una vela. */
const mesaCentro: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  t.bloque('marmol', 0, 0, 0, w - 0.36, h - 0.07, d - 0.3);
  t.bloque('marmol', 0, h - 0.07, 0, w, 0.07, d);
  encima(t, m, () => {
    t.bloque('tinte', -0.35, h, 0.05, 0.32, 0.03, 0.24, { color: '#e7dcc6', ry: 0.1 });
    t.bloque('tinte', -0.35, h + 0.03, 0.05, 0.28, 0.025, 0.22, { color: '#1d2a44', ry: 0.2 });
    t.cilindro('tinte-brillo', 0.25, h + 0.05, -0.1, 0.13, 0.07, 0.1, 18, { color: '#1b1c1e' });
    t.cilindro('tinte', 0.3, h + 0.05, 0.22, 0.03, 0.03, 0.1, 10, { color: '#efe8d8' });
    t.cilindro('emisivo', 0.3, h + 0.11, 0.22, 0.004, 0.006, 0.02, 6, { color: '#ffd28a' });
  });
};

// --- Cocina ---

/** Isla de mármol en cascada sobre un cuerpo de nogal, con frutero, jarrón y tazas. */
const islaCocina: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  t.bloque('marmol', 0, h - 0.05, 0, w, 0.05, d);
  for (const s of [-1, 1]) t.bloque('marmol', s * (w / 2 - 0.025), 0, 0, 0.05, h - 0.05, d);
  t.bloque('nogal', 0, 0.08, -0.12, w - 0.1, h - 0.13, d - 0.36);
  t.bloque('tinte', 0, 0, -0.12, w - 0.14, 0.08, d - 0.42, { color: '#1b1a18' });
  for (let k = 0; k < 4; k++)
    t.bloque('laton', -w / 2 + 0.45 + k * 0.7, h - 0.2, -d / 2 - 0.005 + 0.06, 0.2, 0.012, 0.012);
  encima(t, m, () => {
    t.cilindro('laton', -0.6, h + 0.04, -0.1, 0.16, 0.1, 0.08, 20);
    for (let k = 0; k < 5; k++) {
      t.esfera(
        'tinte-brillo',
        -0.6 + Math.cos(k * 1.3) * 0.07,
        h + 0.1 + (k % 2) * 0.03,
        -0.1 + Math.sin(k * 1.3) * 0.07,
        0.04,
        10,
        1,
        {
          color: k % 2 ? '#e8c43a' : '#d9b02a',
        },
      );
    }
    t.cilindro('tinte-brillo', 0.5, h + 0.14, -0.15, 0.06, 0.08, 0.28, 16, { color: '#e9e4da' });
    for (let k = 0; k < 6; k++) {
      t.cilindro('tinte', 0.5, h + 0.44, -0.15, 0.003, 0.003, 0.36, 4, {
        rz: (k - 2.5) * 0.14,
        rx: (k % 3) * 0.12 - 0.12,
        color: '#5b6b3a',
      });
      t.esfera('tinte', 0.5 + (k - 2.5) * 0.05, h + 0.6, -0.15 + ((k % 3) - 1) * 0.04, 0.03, 6, 1, {
        color: '#f1ece2',
      });
    }
    for (const x of [-0.05, 0.12])
      t.cilindro('tinte-brillo', x, h + 0.045, 0.3, 0.04, 0.035, 0.09, 12, { color: '#f3efe8' });
  });
};

/** Taburete alto: asiento redondo de cuero, patas finas negras y aro de latón para los pies. */
const taburete: Dibujo = (t, m) => {
  const h = m.alto;
  t.cilindro('piel', 0, h - 0.035, 0, 0.18, 0.17, 0.07, 24, { color: COGNAC });
  for (const [x, z] of [
    [-0.13, -0.13],
    [0.13, -0.13],
    [-0.13, 0.13],
    [0.13, 0.13],
  ] as const) {
    t.cilindro('acero', x, (h - 0.07) / 2, z, 0.012, 0.014, h - 0.07, 6);
  }
  t.toro('laton', 0, 0.26, 0, 0.185, 0.011, 28, { rx: PI / 2 });
};

/** Muebles bajos de cocina: frentes de nogal con tiradores de latón, cubierta de mármol, lavaplatos y encimera. */
const muebleCocina: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  t.bloque('tinte', 0, 0, -0.03, w - 0.04, 0.1, d - 0.08, { color: '#1b1a18' });
  t.bloque('nogal', 0, 0.1, -0.01, w, h - 0.15, d - 0.04);
  const puertas = Math.round(w / 0.6);
  for (let k = 1; k < puertas; k++) {
    const x = -w / 2 + (w * k) / puertas;
    t.bloque('tinte', x, 0.12, d / 2 - 0.028, 0.006, h - 0.19, 0.004, { color: '#2a1a10' });
  }
  for (let k = 0; k < puertas; k++) {
    const x = -w / 2 + (w * (k + 0.5)) / puertas;
    t.bloque('laton', x, h - 0.16, d / 2 - 0.02, 0.22, 0.012, 0.014);
  }
  t.bloque('marmol', 0, h - 0.05, 0, w, 0.05, d);
  encima(t, m, () => {
    t.bloque('acero', -1.4, h - 0.002, 0.02, 0.72, 0.006, 0.44);
    t.en(-1.4, h, -0.24, 0, () => {
      t.cilindro('laton', 0, 0.16, 0, 0.016, 0.02, 0.32, 10);
      t.toro('laton', 0, 0.32, 0.07, 0.07, 0.012, 14, { ry: PI / 2 });
    });
    t.bloque('tinte-brillo', 1.6, h, 0.0, 0.76, 0.006, 0.5, { color: '#0c0d0f' });
    for (const [x, z] of [
      [1.42, -0.1],
      [1.78, -0.1],
      [1.42, 0.12],
      [1.78, 0.12],
    ] as const) {
      t.toro('tinte', x, h + 0.008, z, 0.07, 0.004, 20, { rx: PI / 2, color: '#3a3c40' });
    }
    t.bloque('nogal', -0.3, h, 0.05, 0.5, 0.03, 0.32);
    for (const [x, color] of [
      [0.4, '#4c5b2a'],
      [0.55, '#9a6a1e'],
    ] as const) {
      t.cilindro('tinte-brillo', x, h + 0.13, -0.18, 0.035, 0.035, 0.26, 12, { color });
    }
    for (let k = 0; k < 3; k++) {
      t.cilindro('tinte-brillo', -3 + k * 0.22, h + 0.06, -0.15, 0.06, 0.05, 0.12, 14, {
        color: '#d9d2c4',
      });
      t.esfera('tinte', -3 + k * 0.22, h + 0.16, -0.15, 0.07, 8, 0.8, { color: '#4f6b34' });
    }
  });
};

/** Barra de café: frente acanalado de nogal, cubierta de mármol, máquina de espresso de latón. */
const barraCafe: Dibujo = (t, m) => {
  const { ancho: w, fondo: d, alto: h } = m;
  t.bloque('tinte', 0, 0, -0.03, w - 0.04, 0.1, d - 0.1, { color: '#1b1a18' });
  t.bloque('nogal', 0, 0.1, -0.02, w, h - 0.15, d - 0.06);
  for (let x = -w / 2 + 0.03; x < w / 2 - 0.02; x += 0.06) {
    t.cilindro('nogal', x, 0.1 + (h - 0.15) / 2, d / 2 - 0.05, 0.022, 0.022, h - 0.15, 6);
  }
  t.bloque('marmol', 0, h - 0.05, 0, w, 0.05, d);
  encima(t, m, () => {
    t.en(0.4, h, -0.1, 0, () => {
      t.cojin('laton', 0, 0.21, -0.02, 0.72, 0.42, 0.36, 0.04);
      t.bloque('acero', 0, 0.42, -0.02, 0.66, 0.02, 0.3);
      for (let k = 0; k < 5; k++)
        t.cilindro('tinte-brillo', -0.24 + k * 0.12, 0.47, -0.05, 0.035, 0.03, 0.06, 10, {
          color: '#f3efe8',
        });
      for (const x of [-0.16, 0.16]) {
        t.cilindro('acero', x, 0.27, 0.19, 0.045, 0.05, 0.06, 14);
        t.caja('tinte', x, 0.23, 0.27, 0.03, 0.03, 0.12, { color: '#151515' });
        t.cilindro('tinte-brillo', x, 0.05, 0.19, 0.035, 0.03, 0.07, 10, { color: '#f3efe8' });
      }
      for (const x of [-0.1, 0.1]) {
        t.cilindro('tinte-brillo', x, 0.36, 0.162, 0.04, 0.04, 0.01, 16, {
          rx: PI / 2,
          color: '#f5f2ea',
        });
      }
      t.cilindro('acero', 0.31, 0.2, 0.18, 0.008, 0.008, 0.24, 6, { rz: 0.2 });
      t.bloque('acero', 0, 0, 0.19, 0.6, 0.02, 0.12);
    });
    t.en(-0.35, h, -0.08, 0, () => {
      t.bloque('tinte', 0, 0, 0, 0.18, 0.32, 0.22, { color: '#18191b' });
      t.cilindro('tinte-brillo', 0, 0.42, 0, 0.07, 0.04, 0.2, 14, { color: '#5a3a20' });
    });
    for (let k = 0; k < 3; k++) {
      t.cilindro('tinte-brillo', -0.9 - k * 0.16, h + 0.1, -0.12, 0.055, 0.055, 0.2, 14, {
        color: '#c9b79a',
      });
      t.cilindro('laton', -0.9 - k * 0.16, h + 0.205, -0.12, 0.057, 0.057, 0.015, 14);
    }
    t.cilindro('tinte-brillo', -1.6, h + 0.12, 0, 0.16, 0.1, 0.24, 20, { color: '#e9e4da' });
    t.esfera('tinte', -1.6, h + 0.26, 0, 0.12, 12, 0.5, { color: '#b77a3a' });
  });
  luz(t, () => charco(t, 0, h + 0.004, 0, w * 0.9, d * 1.4, '#6e5530'));
};

// --- Terraza ---

/** Reposera de teca: listones, ruedas en la cabecera, cojín crudo y respaldo levantado. */
const reposera: Dibujo = (t, m) => {
  const { ancho: w, fondo: d } = m;
  for (const s of [-1, 1]) t.bloque('deck', s * (w / 2 - 0.03), 0.16, 0, 0.05, 0.1, d);
  for (const z of [-d / 2 + 0.12, d / 2 - 0.1]) {
    for (const s of [-1, 1]) t.bloque('deck', s * (w / 2 - 0.05), 0, z, 0.05, 0.16, 0.05);
  }
  for (let z = -d / 2 + 0.7; z < d / 2 - 0.05; z += 0.09)
    t.bloque('deck', 0, 0.24, z, w - 0.1, 0.02, 0.06);
  for (const s of [-1, 1])
    t.cilindro('acero', s * (w / 2 - 0.016), 0.07, -d / 2 + 0.1, 0.07, 0.07, 0.03, 16, {
      rz: PI / 2,
    });
  t.cojin('tinte', 0, 0.29, 0.28, w - 0.12, 0.07, d - 0.72, 0.03, { color: '#ece6da' });
  // Respaldo levantado desde la bisagra, hacia la cabecera (-z).
  t.en(
    0,
    0.26,
    -d / 2 + 0.68,
    0,
    () => {
      t.bloque('deck', 0, 0, -0.3, w - 0.1, 0.03, 0.6);
      t.cojin('tinte', 0, 0.06, -0.3, w - 0.12, 0.07, 0.6, 0.03, { color: '#ece6da' });
    },
    0.55,
  );
  t.bloque('tinte', 0, 0.33, 0.6, w - 0.2, 0.04, 0.4, { color: '#c9b79a' });
};

const DIBUJOS: Record<string, Dibujo> = {
  'escritorio-nogal': escritorioNogal,
  'silla-malla': sillaMalla,
  'silla-madera': sillaMadera,
  'mesa-lectura': mesaLectura,
  'mesa-cartas': mesaCartas,
  'mesa-mezcla': mesaMezcla,
  'sillon-cuero': sillonCuero,
  'mesa-marmol': mesaMarmol,
  videowall,
  'panel-acustico': panelAcustico,
  'letrero-neon': letreroNeon,
  'aro-luz': aroLuz,
  'camara-tripode': camaraTripode,
  librero,
  boveda,
  'pantalla-pipeline': pantallaPipeline,
  'carro-bar': carroBar,
  telescopio,
  'maquina-gimnasio': maquinaGimnasio,
  'banco-pesas': bancoPesas,
  'rack-mancuernas': rackMancuernas,
  'espejo-gimnasio': espejoGimnasio,
  chimenea,
  'sofa-modular': sofaModular,
  'mesa-centro': mesaCentro,
  'isla-cocina': islaCocina,
  taburete,
  'mueble-cocina': muebleCocina,
  'barra-cafe': barraCafe,
  reposera,
};

/** Tipos del plano que dibuja otra parte de la casa (el espejo de agua del atrio, en `Casa.tsx`). */
export const DIBUJADOS_APARTE: ReadonlySet<string> = new Set(['espejo-agua']);

export const tiposDibujados = (): string[] => Object.keys(DIBUJOS);

/**
 * Dibuja un mueble del plano en su lugar: origen en su huella, sobre el piso de su ambiente,
 * girado `giro`. `i` es su número dentro de su tipo (varía detalles y contenidos).
 */
export function dibujarMueble(t: Taller, m: Mueble, yPiso: number, i: number): void {
  const dibujo = DIBUJOS[m.tipo];
  if (!dibujo) {
    if (DIBUJADOS_APARTE.has(m.tipo)) return;
    throw new Error(`Mueble sin dibujo: ${m.tipo}`);
  }
  const antes = t.dueno;
  t.dueno = m.id;
  t.en(m.x, yPiso + m.y, m.z, m.giro, () => dibujo(t, m, i));
  t.dueno = antes;
}
