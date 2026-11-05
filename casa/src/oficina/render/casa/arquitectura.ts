import { ESPESOR_LOSA, NIVEL_Y, plano } from '../../mansion/plano';
import type { Ambiente, Caja, Escalera, Muro, Nivel, Tramo } from '../../mansion/plano';

/**
 * La arquitectura de la mansión como cajas, derivada del plano (`mansion/plano.ts`): losas con
 * su canto de hormigón, acabados de piso, muros con sus vanos, muro cortina con montantes,
 * cielos de listones de nogal con tiras LED, barandas de vidrio, escaleras y el terreno
 * cortado con la terraza. Lógica pura (sin three): `Casa.tsx` fusiona las cajas por material.
 */

export type ClaveMaterial =
  | 'hormigon'
  | 'pulido'
  | 'marmol'
  | 'travertino'
  | 'nogal'
  | 'parquet'
  | 'fieltro'
  | 'vidrio'
  | 'acero'
  | 'laton'
  | 'led'
  | 'roca'
  | 'tierra'
  | 'cesped'
  | 'deck'
  | 'cobre'
  | 'cuero';

/** Costado de la casa: norte es el fondo (z = -4), sur el frente (z = +4), este x+ y oeste x-. */
export type LadoCorte = 'norte' | 'sur' | 'este' | 'oeste';

/** Para qué está la caja: los tests miran qué se pisa, qué corta el paso y qué es de escalera. */
export type Rol =
  'piso' | 'muro' | 'cielo' | 'baranda' | 'peldano' | 'escalera' | 'terreno' | 'jardin';

/**
 * Caja alineada con los ejes. Con `pendiente` la caja se cizalla en y a lo largo de z (sube
 * `pendiente` metros por metro de z, centrada en su z medio): así se dibujan, con cortes a
 * plomo, el espinazo y las barandas de una escalera.
 */
export interface Bloque {
  material: ClaveMaterial;
  rol: Rol;
  /** Costado de la casa al que pertenece; la cámara lo oculta cuando mira desde ese lado. */
  lado?: LadoCorte;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  pendiente?: number;
}

export const ESPESOR_MURO = 0.2;
/** Alto de paso de las puertas; sobre él, el dintel de hormigón llega al cielo. */
export const ALTO_VANO = 2.7;
/** Contrahuella máxima de cualquier escalera. */
export const CONTRAHUELLA_MAX = 0.19;
/** Altura libre de cada piso (bajo la losa del nivel siguiente). */
export const ALTO_LIBRE = NIVEL_Y.piso2 - NIVEL_Y.piso1 - ESPESOR_LOSA;

const ACABADO = 0.02;
const ALTO_BARANDA = 1.05;
const VIDRIO = 0.024;
/** Muro cortina trasero: plano del vidrio y fondo de los montantes. */
const Z_VIDRIO = -4.1;
/** Huella de la casa con los muros de borde y el muro cortina incluidos. */
export const HUELLA: Caja = { x0: -16 - ESPESOR_MURO, x1: 16 + ESPESOR_MURO, z0: -4.2, z1: 4 };

/** Terreno cortado bajo la casa (maqueta): roca, tierra y la capa de terminaciones. */
export const TERRENO = { x0: -22, x1: 22, z0: -10, z1: 9.6, fondo: -4 };

/** Acabado de piso de cada ambiente: su material dominante. */
const PISO_DE: Record<string, ClaveMaterial> = {
  gimnasio: 'pulido',
  living: 'parquet',
  atrio: 'marmol',
  cocina: 'marmol',
  finanzas: 'parquet',
  pasarela: 'vidrio',
  ventas: 'parquet',
  desarrollo: 'pulido',
  rellano: 'marmol',
  contenido: 'parquet',
  investigacion: 'parquet',
};

const NIVELES: readonly Nivel[] = ['piso1', 'piso2', 'piso3', 'torre'];

function bloque(
  material: ClaveMaterial,
  rol: Rol,
  c: Caja,
  y0: number,
  y1: number,
  pendiente?: number,
): Bloque {
  const b: Bloque = { material, rol, x0: c.x0, x1: c.x1, y0, y1, z0: c.z0, z1: c.z1 };
  if (pendiente !== undefined) b.pendiente = pendiente;
  return b;
}

/**
 * El costado al que pertenece una caja de la estructura, o `undefined` si no tapa la vista
 * desde ninguno: el muro cortina y el antepecho del fondo son del norte; los muros de los
 * costados y los vuelos de las losas, del este o del oeste. Un muro interior (fino en x) es
 * del lado de la casa donde está: con la cámara en ese costado queda entre ella y el interior.
 */
export function ladoDeBloque(b: Pick<Bloque, 'rol' | 'x0' | 'x1' | 'z1'>): LadoCorte | undefined {
  if (b.rol === 'piso') {
    if (b.x0 >= HUELLA.x1 - 1e-6) return 'este';
    return b.x1 <= HUELLA.x0 + 1e-6 ? 'oeste' : undefined;
  }
  if (b.rol !== 'muro') return undefined;
  if (b.z1 <= -4) return 'norte';
  if (b.x1 - b.x0 > 0.25) return undefined;
  return (b.x0 + b.x1) / 2 > 0 ? 'este' : 'oeste';
}

const cruzan = (a: Caja, b: Caja) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const area = (c: Caja) => (c.x1 - c.x0) * (c.z1 - c.z0);

/** Una caja menos un hueco: hasta 4 cajas que no se solapan (o la misma, si no se tocan). */
export function restarCaja(c: Caja, h: Caja): Caja[] {
  if (!cruzan(c, h)) return [c];
  const ix0 = Math.max(c.x0, h.x0);
  const ix1 = Math.min(c.x1, h.x1);
  const iz0 = Math.max(c.z0, h.z0);
  const iz1 = Math.min(c.z1, h.z1);
  const partes: Caja[] = [
    { x0: c.x0, x1: ix0, z0: c.z0, z1: c.z1 },
    { x0: ix1, x1: c.x1, z0: c.z0, z1: c.z1 },
    { x0: ix0, x1: ix1, z0: c.z0, z1: iz0 },
    { x0: ix0, x1: ix1, z0: iz1, z1: c.z1 },
  ];
  return partes.filter((p) => area(p) > 1e-9);
}

export const restarCajas = (cajas: readonly Caja[], huecos: readonly Caja[]): Caja[] =>
  huecos.reduce<Caja[]>((resto, h) => resto.flatMap((c) => restarCaja(c, h)), [...cajas]);

/** Extiende hasta la huella los bordes de un ambiente que tocan la envolvente. */
function aHuella(c: Caja): Caja {
  return {
    x0: c.x0 <= -16 ? HUELLA.x0 : c.x0,
    x1: c.x1 >= 16 ? HUELLA.x1 : c.x1,
    z0: c.z0 <= -4 ? HUELLA.z0 : c.z0,
    z1: c.z1,
  };
}

/** Los ambientes de la casa original: las salas construidas tienen su propia estructura (`estructuraAlas`). */
const interiores = (nivel: Nivel) =>
  plano.ambientes.filter((a) => a.nivel === nivel && a.alto > 0 && !a.ala);
const huecosEn = (y: number) => plano.huecos.filter((h) => Math.abs(h.y - y) < 1e-6);

/** Piso de un nivel: el primero y el techo de la torre cubren la huella; los otros, sus ambientes. */
function regionesLosa(nivel: Nivel): { caja: Caja; ambiente: Ambiente | null }[] {
  const y = NIVEL_Y[nivel];
  const huecos = huecosEn(y);
  const ambientes = interiores(nivel).map((a) => ({ caja: aHuella(a), ambiente: a }));
  const cubiertos =
    nivel === 'piso1' || nivel === 'torre'
      ? [
          ...ambientes,
          ...restarCajas(
            [HUELLA],
            ambientes.map((a) => a.caja),
          ).map((caja) => ({ caja, ambiente: null })),
        ]
      : ambientes;
  return cubiertos.flatMap(({ caja, ambiente }) =>
    restarCajas([caja], huecos).map((c) => ({ caja: c, ambiente })),
  );
}

/** Cuánto vuelan las losas altas más allá de los muros de los costados. */
export const VUELO = 1.6;
const ANTEPECHO = { alto: 0.35, espesor: 0.15 };

/**
 * Losa de un nivel: cuerpo de hormigón (o vidrio en la pasarela) y acabado del ambiente. Las
 * losas de arriba vuelan sobre los costados; el techo (fuera de la torre) es un techo verde.
 */
function losa(nivel: Nivel): Bloque[] {
  const y = NIVEL_Y[nivel];
  // Donde hay un ala, su propia losa ocupa el lugar del vuelo.
  const alaTapa = alasQueCubren(nivel).map(cajaAla);
  const vuelos: Bloque[] =
    nivel === 'piso1'
      ? []
      : restarCajas(
          [
            { x0: HUELLA.x0 - VUELO, x1: HUELLA.x0, z0: HUELLA.z0, z1: HUELLA.z1 },
            { x0: HUELLA.x1, x1: HUELLA.x1 + VUELO, z0: HUELLA.z0, z1: HUELLA.z1 },
          ],
          alaTapa,
        ).map((c) => bloque('hormigon', 'piso', c, y - ESPESOR_LOSA, y));
  if (nivel === 'torre') {
    // Antepecho del techo: costados, fondo y frente, fuera de la torre.
    const torre = interiores('torre').map(aHuella);
    const { alto, espesor } = ANTEPECHO;
    const bordes: Caja[] = [
      { x0: HUELLA.x0 - VUELO, x1: HUELLA.x0 - VUELO + espesor, z0: HUELLA.z0, z1: HUELLA.z1 },
      { x0: HUELLA.x1 + VUELO - espesor, x1: HUELLA.x1 + VUELO, z0: HUELLA.z0, z1: HUELLA.z1 },
      ...restarCajas(
        [{ x0: HUELLA.x0 - VUELO, x1: HUELLA.x1 + VUELO, z0: HUELLA.z0, z1: HUELLA.z0 + espesor }],
        torre,
      ),
      { x0: HUELLA.x0 - VUELO, x1: HUELLA.x1 + VUELO, z0: HUELLA.z1 - espesor, z1: HUELLA.z1 },
    ];
    for (const b of restarCajas(bordes, alaTapa)) vuelos.push(bloque('hormigon', 'muro', b, y, y + alto));
  }
  return [...vuelos, ...losaInterior(nivel)];
}

function losaInterior(nivel: Nivel): Bloque[] {
  const y = NIVEL_Y[nivel];
  return regionesLosa(nivel).flatMap(({ caja, ambiente }): Bloque[] => {
    const acabado = ambiente
      ? (PISO_DE[ambiente.id] ?? 'hormigon')
      : nivel === 'torre'
        ? 'cesped'
        : 'hormigon';
    if (acabado === 'vidrio') {
      // Pasarela: losa de vidrio templado sobre un marco de vigas de acero.
      return [
        bloque('vidrio', 'piso', caja, y - 0.06, y),
        bloque('acero', 'piso', { ...caja, z0: caja.z1 - 0.12 }, y - ESPESOR_LOSA, y - 0.06),
        bloque('acero', 'piso', { ...caja, z1: caja.z0 + 0.12 }, y - ESPESOR_LOSA, y - 0.06),
      ];
    }
    return [
      bloque('hormigon', 'piso', caja, y - ESPESOR_LOSA, y - ACABADO),
      bloque(acabado, 'piso', caja, y - ACABADO, y),
    ];
  });
}

const PASO_LISTON = 0.16;
const ANCHO_LISTON = 0.045;
/** Cada cuántos listones va una tira LED. */
const CADA_LED = 12;

/** Cielo bajo una losa: fieltro antracita con listones de nogal a lo largo de z y tiras LED. */
function cielo(nivel: Nivel): Bloque[] {
  const abajo = NIVEL_Y[nivel] - ESPESOR_LOSA;
  return regionesLosa(nivel)
    .filter(({ ambiente }) => !ambiente || PISO_DE[ambiente.id] !== 'vidrio')
    .flatMap(({ caja }) => cieloDe(caja, abajo));
}

function cieloDe(caja: Caja, abajo: number): Bloque[] {
  const bloques: Bloque[] = [bloque('fieltro', 'cielo', caja, abajo - 0.025, abajo)];
  const primero = Math.ceil((caja.x0 + 0.05) / PASO_LISTON);
  const ultimo = Math.floor((caja.x1 - 0.05) / PASO_LISTON);
  for (let k = primero; k <= ultimo; k++) {
    const x = k * PASO_LISTON;
    const franja = { ...caja, x0: x - ANCHO_LISTON / 2, x1: x + ANCHO_LISTON / 2 };
    if (k % CADA_LED === 0) {
      bloques.push(
        bloque(
          'led',
          'cielo',
          { ...franja, x0: x - 0.015, x1: x + 0.015 },
          abajo - 0.05,
          abajo - 0.025,
        ),
      );
    } else {
      bloques.push(bloque('nogal', 'cielo', franja, abajo - 0.085, abajo - 0.025));
    }
  }
  return bloques;
}

/** Baranda de vidrio con pasamanos de latón, a lo largo de x (eje 'z') o de z (eje 'x'). */
function baranda(eje: 'x' | 'z', pos: number, desde: number, hasta: number, y: number): Bloque[] {
  const c: Caja =
    eje === 'x'
      ? { x0: pos - VIDRIO / 2, x1: pos + VIDRIO / 2, z0: desde, z1: hasta }
      : { x0: desde, x1: hasta, z0: pos - VIDRIO / 2, z1: pos + VIDRIO / 2 };
  const pasamanos: Caja =
    eje === 'x'
      ? { ...c, x0: pos - 0.025, x1: pos + 0.025 }
      : { ...c, z0: pos - 0.025, z1: pos + 0.025 };
  return [
    bloque('vidrio', 'baranda', c, y, y + ALTO_BARANDA),
    bloque('laton', 'baranda', pasamanos, y + ALTO_BARANDA, y + ALTO_BARANDA + 0.04),
  ];
}

/**
 * Un muro del plano. Los de eje x son de hormigón (los de borde por fuera de la huella) y dejan
 * su vano libre hasta `ALTO_VANO`, con un dintel encima; las barandas son de vidrio. El fondo
 * (eje z) es el muro cortina, que dibuja `muroCortina`.
 */
export function segmentosMuro(muro: Muro): Bloque[] {
  const y = NIVEL_Y[muro.nivel];
  if (muro.eje === 'z') return muroCortina(muro);
  if (muro.tipo === 'baranda') return baranda('x', muro.pos, muro.desde, muro.hasta, y);
  const borde = muro.tipo === 'borde';
  const x0 = borde
    ? muro.pos < 0
      ? muro.pos - ESPESOR_MURO
      : muro.pos
    : muro.pos - ESPESOR_MURO / 2;
  const x1 = x0 + ESPESOR_MURO;
  const z0 = borde && muro.desde <= -4 ? HUELLA.z0 : muro.desde;
  const z1 = muro.hasta;
  const techo = y + ALTO_LIBRE;
  const v = muro.vano;
  if (!v) return [bloque('hormigon', 'muro', { x0, x1, z0, z1 }, y, techo)];
  const a = v.centro - v.ancho / 2;
  const b = v.centro + v.ancho / 2;
  return [
    bloque('hormigon', 'muro', { x0, x1, z0, z1: a }, y, techo),
    bloque('hormigon', 'muro', { x0, x1, z0: b, z1 }, y, techo),
    bloque('hormigon', 'muro', { x0, x1, z0: a, z1: b }, y + ALTO_VANO, techo),
  ].filter((m) => m.z1 - m.z0 > 1e-9);
}

/** Muro cortina: vidrio de piso a cielo con montantes de acero negro cada ≤ 1,6 m. */
function muroCortina(muro: Muro): Bloque[] {
  const y = NIVEL_Y[muro.nivel];
  const techo = y + ALTO_LIBRE;
  const largo = muro.hasta - muro.desde;
  const vidrio = bloque(
    'vidrio',
    'muro',
    { x0: muro.desde, x1: muro.hasta, z0: Z_VIDRIO - VIDRIO / 2, z1: Z_VIDRIO + VIDRIO / 2 },
    y,
    techo,
  );
  const n = Math.ceil(largo / 1.6);
  const montantes = Array.from({ length: n + 1 }, (_, i) => {
    const x = muro.desde + (largo * i) / n;
    return bloque(
      'acero',
      'muro',
      { x0: x - 0.03, x1: x + 0.03, z0: HUELLA.z0, z1: -4.02 },
      y,
      techo,
    );
  });
  return [vidrio, ...montantes];
}

// --- escaleras ---

export interface Peldano {
  /** Punto de la línea de paso en el centro del escalón y altura de su cara superior. */
  x: number;
  y: number;
  z: number;
  /** Índice del tramo de la escalera. */
  tramo: number;
  /** Huella a lo largo del avance y ancho a lo largo del escalón. */
  huella: number;
  ancho: number;
  /** En una escalera de caracol: el sector del escalón alrededor del eje. */
  sector: { cx: number; cz: number; desde: number; hasta: number } | null;
}

/** Centro del círculo que pasa por tres puntos en planta (o `null` si están alineados). */
function circuncentro(a: Tramo['desde'], b: Tramo['desde'], c: Tramo['desde']) {
  const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.z * a.z;
  const b2 = b.x * b.x + b.z * b.z;
  const c2 = c.x * c.x + c.z * c.z;
  return {
    x: (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / d,
    z: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/** Si los extremos de los tramos están sobre un mismo círculo, es una escalera de caracol. */
function eje(escalera: Escalera) {
  const puntos = [escalera.tramos[0]?.desde, ...escalera.tramos.map((t) => t.hasta)];
  if (puntos.length < 4 || puntos.some((p) => !p)) return null;
  const [a, b, c] = puntos as Tramo['desde'][];
  const centro = circuncentro(a as Tramo['desde'], b as Tramo['desde'], c as Tramo['desde']);
  if (!centro) return null;
  const radio = Math.hypot((a as Tramo['desde']).x - centro.x, (a as Tramo['desde']).z - centro.z);
  const enCirculo = (puntos as Tramo['desde'][]).every(
    (p) => Math.abs(Math.hypot(p.x - centro.x, p.z - centro.z) - radio) < 0.01,
  );
  return enCirculo ? { ...centro, radio } : null;
}

/**
 * Escalones de una escalera, de abajo hacia arriba: cada tramo se divide en el mínimo de
 * contrahuellas iguales que no pasan de `CONTRAHUELLA_MAX`, y el último escalón queda a la
 * altura de llegada. Los tramos rectos dan escalones a lo largo de su recta; los de caracol,
 * sectores alrededor del eje que pasa por el círculo de sus extremos.
 */
export function peldanos(escalera: Escalera): Peldano[] {
  const caracol = eje(escalera);
  let anguloPrevio: number | null = null;
  return escalera.tramos.flatMap((t, i): Peldano[] => {
    const subida = t.hasta.y - t.desde.y;
    const n = Math.max(1, Math.ceil(Math.abs(subida) / CONTRAHUELLA_MAX - 1e-9));
    const h = subida / n;
    const largo = Math.hypot(t.hasta.x - t.desde.x, t.hasta.z - t.desde.z);
    if (caracol) {
      const desenrollar = (a: number) => {
        if (anguloPrevio === null) return a;
        let x = a;
        while (x - anguloPrevio > Math.PI) x -= 2 * Math.PI;
        while (anguloPrevio - x > Math.PI) x += 2 * Math.PI;
        return x;
      };
      const a0 = desenrollar(Math.atan2(t.desde.z - caracol.z, t.desde.x - caracol.x));
      anguloPrevio = a0;
      const a1 = desenrollar(Math.atan2(t.hasta.z - caracol.z, t.hasta.x - caracol.x));
      anguloPrevio = a1;
      const paso = (a1 - a0) / n;
      return Array.from({ length: n }, (_, j) => {
        const medio = a0 + (j + 0.5) * paso;
        return {
          x: caracol.x + caracol.radio * Math.cos(medio),
          y: t.desde.y + (j + 1) * h,
          z: caracol.z + caracol.radio * Math.sin(medio),
          tramo: i,
          huella: Math.abs(paso) * caracol.radio,
          ancho: t.ancho,
          sector: {
            cx: caracol.x,
            cz: caracol.z,
            desde: a0 + j * paso,
            hasta: a0 + (j + 1) * paso,
          },
        };
      });
    }
    return Array.from({ length: n }, (_, j) => {
      const k = (j + 0.5) / n;
      return {
        x: t.desde.x + (t.hasta.x - t.desde.x) * k,
        y: t.desde.y + (j + 1) * h,
        z: t.desde.z + (t.hasta.z - t.desde.z) * k,
        tramo: i,
        huella: largo / n,
        ancho: t.ancho,
        sector: null,
      };
    });
  });
}

const ESPESOR_PELDANO = 0.06;
const NARIZ = 0.02;

/**
 * Escalera escultórica (tramos rectos a lo largo de z): peldaños volados de nogal sobre un
 * espinazo de acero negro y barandas de vidrio a ambos lados con pasamanos de latón. El último
 * escalón se recorta contra la losa de llegada para no duplicar su cara. Los de caracol los
 * dibuja `Casa.tsx` (sectores, columna y pasamanos helicoidal).
 */
function escalera(e: Escalera): Bloque[] {
  if (eje(e)) return [];
  const losasLlegada = (y: number) =>
    NIVELES.filter((n) => Math.abs(NIVEL_Y[n] - y) < 1e-6).flatMap((n) =>
      regionesLosa(n).map((r) => r.caja),
    );
  const escalones = peldanos(e).flatMap((p): Bloque[] => {
    const t = e.tramos[p.tramo] as Tramo;
    if (Math.abs(t.hasta.x - t.desde.x) > 1e-6) {
      throw new Error(`Tramo no alineado con z en la escalera ${e.id}`);
    }
    const huella: Caja = {
      x0: p.x - p.ancho / 2,
      x1: p.x + p.ancho / 2,
      z0: p.z - p.huella / 2 - NARIZ,
      z1: p.z + p.huella / 2 + NARIZ,
    };
    const llegada = Math.abs(p.y - t.hasta.y) < 1e-6 ? losasLlegada(p.y) : [];
    return restarCajas([huella], llegada).map((c) =>
      bloque('nogal', 'peldano', c, p.y - ESPESOR_PELDANO, p.y),
    );
  });
  const estructura = e.tramos.flatMap((t): Bloque[] => {
    const z0 = Math.min(t.desde.z, t.hasta.z);
    const z1 = Math.max(t.desde.z, t.hasta.z);
    const pendiente = (t.hasta.y - t.desde.y) / (t.hasta.z - t.desde.z);
    const medio = (t.desde.y + t.hasta.y) / 2;
    const x = t.desde.x;
    const nivel = NIVELES.find((n) => Math.abs(NIVEL_Y[n] - Math.min(t.desde.y, t.hasta.y)) < 1e-6);
    const lado = (s: 1 | -1): Bloque[] => {
      const px = x + s * (t.ancho / 2 + 0.03);
      // Del lado de un muro la baranda sobra (y le quitaría paso a su vano).
      const conMuro = plano.muros.some(
        (m) =>
          m.nivel === nivel &&
          m.eje === 'x' &&
          m.tipo !== 'baranda' &&
          Math.abs(m.pos - px) < 0.35 &&
          m.desde <= z0 &&
          m.hasta >= z1,
      );
      if (conMuro) return [];
      // Junto a un vano (la llegada al lado de una puerta) la baranda se corta para dejarle paso.
      const vanos = plano.vanos
        .filter((v) => Math.abs(v.pos - px) < 0.35)
        .map((v) => [v.centro - v.ancho / 2, v.centro + v.ancho / 2] as const);
      return tramosLibres(z0, z1, vanos).flatMap(([a, b]) => [
        cizallado(
          'vidrio',
          { x0: px - VIDRIO / 2, x1: px + VIDRIO / 2, z0: a, z1: b },
          medio - 0.02,
          medio + 0.95,
        ),
        cizallado(
          'laton',
          { x0: px - 0.025, x1: px + 0.025, z0: a, z1: b },
          medio + 0.95,
          medio + 0.99,
        ),
      ]);
    };
    /** Caja cizallada por la pendiente del tramo; y0/y1 se dan en el z medio del tramo. */
    const cizallado = (material: ClaveMaterial, c: Caja, y0: number, y1: number) => {
      const dy = pendiente * ((c.z0 + c.z1) / 2 - (z0 + z1) / 2);
      return bloque(material, 'escalera', c, y0 + dy, y1 + dy, pendiente);
    };
    return [
      bloque(
        'acero',
        'escalera',
        { x0: x - 0.07, x1: x + 0.07, z0, z1 },
        medio - 0.3,
        medio - 0.02,
        pendiente,
      ),
      ...lado(1),
      ...lado(-1),
    ];
  });
  return [...escalones, ...estructura];
}

/** El intervalo [desde, hasta] menos los intervalos ocupados. */
function tramosLibres(
  desde: number,
  hasta: number,
  ocupados: readonly (readonly [number, number])[],
): [number, number][] {
  return ocupados.reduce<[number, number][]>(
    (libres, [a, b]) =>
      libres.flatMap(([x, y]): [number, number][] =>
        b <= x || a >= y
          ? [[x, y]]
          : (
              [
                [x, Math.min(a, y)],
                [Math.max(b, x), y],
              ] as [number, number][]
            ).filter(([p, q]) => q - p > 1e-6),
      ),
    [[desde, hasta]],
  );
}

/** Puntos donde una escalera toca un nivel (para no cerrar con baranda su llegada). */
function llegadas(y: number) {
  return plano.escaleras.flatMap((e) =>
    e.tramos.flatMap((t) => [t.desde, t.hasta]).filter((p) => Math.abs(p.y - y) < 1e-6),
  );
}

/**
 * Barandas que el plano no trae como muro: el borde de la pasarela sobre el atrio (salvo donde
 * llegan las escaleras) y el perímetro de cada hueco de losa (salvo el lado de la llegada y el
 * que ya cierra un muro).
 */
function barandasDeBorde(): Bloque[] {
  const bloques: Bloque[] = [];
  const pasarela = plano.ambientes.find((a) => a.id === 'pasarela');
  if (pasarela) {
    const libres = llegadas(pasarela.y)
      .filter((p) => Math.abs(p.z - pasarela.z1) < 0.35)
      .map((p) => ({ x0: p.x - 0.7, x1: p.x + 0.7, z0: pasarela.z1 - 1, z1: pasarela.z1 + 1 }));
    const borde = restarCajas(
      [{ x0: pasarela.x0, x1: pasarela.x1, z0: pasarela.z1 - 0.01, z1: pasarela.z1 + 0.01 }],
      libres,
    );
    for (const c of borde) bloques.push(...baranda('z', pasarela.z1, c.x0, c.x1, pasarela.y));
  }
  for (const h of plano.huecos) {
    const nivel = NIVELES.find((n) => Math.abs(NIVEL_Y[n] - h.y) < 1e-6);
    const muros = plano.muros.filter(
      (m) => m.nivel === nivel && m.eje === 'x' && m.tipo !== 'baranda',
    );
    const puntos = llegadas(h.y);
    const lados = [
      { eje: 'x' as const, pos: h.x0, desde: h.z0, hasta: h.z1 },
      { eje: 'x' as const, pos: h.x1, desde: h.z0, hasta: h.z1 },
      { eje: 'z' as const, pos: h.z0, desde: h.x0, hasta: h.x1 },
      { eje: 'z' as const, pos: h.z1, desde: h.x0, hasta: h.x1 },
    ];
    for (const lado of lados) {
      const llega = puntos.some((p) => {
        const [a, b] = lado.eje === 'x' ? [p.x, p.z] : [p.z, p.x];
        return Math.abs(a - lado.pos) < 0.35 && b >= lado.desde - 0.01 && b <= lado.hasta + 0.01;
      });
      const cerrado =
        lado.eje === 'x' &&
        muros.some(
          (m) => Math.abs(m.pos - lado.pos) < 0.3 && m.desde <= lado.desde && m.hasta >= lado.hasta,
        );
      if (!llega && !cerrado)
        bloques.push(...baranda(lado.eje, lado.pos, lado.desde, lado.hasta, h.y));
    }
  }
  return bloques;
}

// --- salas construidas: alas laterales con el mismo hormigón, cielo y muro cortina de la casa ---

/** Vuelo de la losa sobre el muro exterior de un ala: más corto que el de la casa, por el terreno. */
const VUELO_ALA = 0.4;
const LADO_PILAR = 0.28;

const alasEn = (nivel: Nivel) => plano.ambientes.filter((a) => a.ala && a.nivel === nivel);
const nivelDebajo = (nivel: Nivel): Nivel | undefined => NIVELES[NIVELES.indexOf(nivel) - 1];

/** Planta de un ala con su muro exterior, desde el muro de la casa. */
function cajaAla(a: Ambiente): Caja {
  return a.ala === 'este'
    ? { x0: HUELLA.x1, x1: a.x1 + ESPESOR_MURO, z0: HUELLA.z0, z1: HUELLA.z1 }
    : { x0: a.x0 - ESPESOR_MURO, x1: HUELLA.x0, z0: HUELLA.z0, z1: HUELLA.z1 };
}

/** Las alas cuyo piso o cuyo techo está en este nivel. */
function alasQueCubren(nivel: Nivel): Ambiente[] {
  const debajo = nivelDebajo(nivel);
  return [...alasEn(nivel), ...(debajo ? alasEn(debajo) : [])];
}

/** Losa de un nivel en un costado: el piso del ala de arriba y el techo del ala de abajo. */
function losaDeAla(nivel: Nivel, lado: 'este' | 'oeste'): Bloque[] {
  const y = NIVEL_Y[nivel];
  const aqui = alasEn(nivel).find((a) => a.ala === lado);
  const debajo = nivelDebajo(nivel);
  const abajo = debajo ? alasEn(debajo).find((a) => a.ala === lado) : undefined;
  const cajas = [aqui, abajo].filter((a): a is Ambiente => !!a).map(cajaAla);
  if (!cajas.length) return [];
  const caja: Caja = {
    x0: Math.min(...cajas.map((c) => c.x0)),
    x1: Math.max(...cajas.map((c) => c.x1)),
    z0: HUELLA.z0,
    z1: HUELLA.z1,
  };
  const bloques = [bloque('hormigon', 'piso', caja, y - ESPESOR_LOSA, y - ACABADO)];
  if (aqui) bloques.push(bloque((aqui.piso ?? 'hormigon') as ClaveMaterial, 'piso', cajaAla(aqui), y - ACABADO, y));
  // Lo que queda a la intemperie es techo verde con su antepecho, como el techo de la casa.
  const { alto, espesor } = ANTEPECHO;
  for (const c of restarCajas([caja], aqui ? [cajaAla(aqui)] : [])) {
    bloques.push(bloque('cesped', 'piso', c, y - ACABADO, y));
    const afuera = lado === 'este' ? { x0: c.x1 - espesor, x1: c.x1 } : { x0: c.x0, x1: c.x0 + espesor };
    bloques.push(bloque('hormigon', 'muro', { ...c, ...afuera }, y, y + alto));
    for (const borde of [{ z0: c.z0, z1: c.z0 + espesor }, { z0: c.z1 - espesor, z1: c.z1 }]) {
      bloques.push(bloque('hormigon', 'muro', { ...c, ...borde }, y, y + alto));
    }
  }
  if (abajo) {
    const dentro: Caja = { x0: abajo.x0, x1: abajo.x1, z0: HUELLA.z0, z1: HUELLA.z1 };
    bloques.push(...cieloDe(dentro, y - ESPESOR_LOSA));
  }
  if (nivel !== 'piso1') {
    // El vuelo se oculta con su costado, igual que los de la casa.
    const vuelo = lado === 'este' ? { x0: caja.x1, x1: caja.x1 + VUELO_ALA } : { x0: caja.x0 - VUELO_ALA, x1: caja.x0 };
    bloques.push({ ...bloque('hormigon', 'piso', { ...caja, ...vuelo }, y - ESPESOR_LOSA, y), lado });
  }
  return bloques;
}

/** Pilares en las esquinas exteriores de un ala que no apoya entera sobre otra. */
function pilaresDeAla(a: Ambiente): Bloque[] {
  const debajo = nivelDebajo(a.nivel);
  if (!debajo) return [];
  const caja = cajaAla(a);
  const x = a.ala === 'este' ? { x0: caja.x1 - LADO_PILAR, x1: caja.x1 } : { x0: caja.x0, x1: caja.x0 + LADO_PILAR };
  const cubre = (o: Ambiente) => {
    const c = cajaAla(o);
    return o.ala === a.ala && c.x0 <= x.x0 && c.x1 >= x.x1;
  };
  if (alasEn(debajo).some(cubre)) return [];
  // Baja hasta el techo del ala más alta que tenga debajo o, si no hay, hasta el suelo.
  let apoyo = 0;
  for (const nivel of NIVELES.slice(0, NIVELES.indexOf(debajo))) {
    if (alasEn(nivel).some(cubre)) apoyo = NIVEL_Y[NIVELES[NIVELES.indexOf(nivel) + 1] as Nivel];
  }
  return [HUELLA.z0, HUELLA.z1 - LADO_PILAR].map((z0) =>
    bloque('hormigon', 'muro', { ...x, z0, z1: z0 + LADO_PILAR }, apoyo, a.y - ESPESOR_LOSA),
  );
}

function estructuraAlas(): Bloque[] {
  return NIVELES.flatMap((nivel) => [
    ...losaDeAla(nivel, 'este'),
    ...losaDeAla(nivel, 'oeste'),
    ...alasEn(nivel).flatMap(pilaresDeAla),
  ]);
}

/** Toda la casa: losas, cielos, muros, barandas y escaleras. */
export function estructura(): Bloque[] {
  const bloques = [
    ...NIVELES.flatMap(losa),
    ...NIVELES.filter((n) => n !== 'piso1').flatMap(cielo),
    ...plano.muros.flatMap(segmentosMuro),
    ...barandasDeBorde(),
    ...plano.escaleras.flatMap(escalera),
  ];
  return [
    ...bloques.map((b) => {
      const lado = ladoDeBloque(b);
      return lado ? { ...b, lado } : b;
    }),
    // Van aparte: el piso de un ala queda fuera de la huella, pero no es un vuelo que se oculta.
    ...estructuraAlas(),
  ];
}

// --- exterior ---

const TABLA = 0.14;
const JUNTA = 0.008;

/**
 * El terreno cortado y la terraza: roca y tierra en sección hasta `TERRENO.fondo`; encima,
 * pasto a los costados y atrás, piedra travertino alrededor de la piscina, deck de tablas al
 * oeste y jardineras de hormigón al este. La lámina de agua y el rebosadero los dibuja
 * `Piscina.tsx`; aquí quedan abiertos.
 */
export function exterior(): Bloque[] {
  const { piscina } = plano;
  const terreno: Caja = TERRENO;
  const terraza: Caja = { x0: -16, x1: 16, z0: HUELLA.z1, z1: TERRENO.z1 };
  const agua: Caja = { x0: piscina.x0, x1: piscina.x1, z0: piscina.z0, z1: TERRENO.z1 };
  const deck: Caja = { x0: terraza.x0, x1: piscina.x0 - 0.6, z0: terraza.z0, z1: terraza.z1 };
  const bloques: Bloque[] = [
    bloque('roca', 'terreno', terreno, TERRENO.fondo, -1.1),
    bloque('tierra', 'terreno', terreno, -1.1, -0.3),
  ];
  // Pasto: todo lo que no es casa ni terraza.
  for (const c of restarCajas([terreno], [HUELLA, terraza, ...alasEn('piso1').map(cajaAla)])) {
    bloques.push(bloque('cesped', 'piso', c, -0.3, 0));
  }
  // Travertino: la terraza menos el agua y el deck. Sin labio al frente: el borde de la
  // piscina infinita es el agua misma, que se derrama al canal (ver `Piscina.tsx`).
  for (const c of restarCajas([terraza], [agua, deck])) {
    bloques.push(bloque('travertino', 'piso', c, -0.3, 0));
  }
  // Deck: tablas a lo largo de z sobre una estructura oscura.
  bloques.push(bloque('acero', 'piso', deck, -0.3, -0.04));
  for (let x = deck.x0; x + TABLA <= deck.x1 + 1e-6; x += TABLA + JUNTA) {
    bloques.push(bloque('deck', 'piso', { ...deck, x0: x, x1: x + TABLA }, -0.04, 0));
  }
  // Jardineras de hormigón al este (muros de 10 cm y tierra hundida).
  for (const [z0, z1] of [
    [4.9, 6.9],
    [7.3, 9.3],
  ] as const) {
    const j: Caja = { x0: piscina.x1 + 1.1, x1: 15.8, z0, z1 };
    const muros: Caja[] = [
      { ...j, x1: j.x0 + 0.1 },
      { ...j, x0: j.x1 - 0.1 },
      { ...j, x0: j.x0 + 0.1, x1: j.x1 - 0.1, z1: j.z0 + 0.1 },
      { ...j, x0: j.x0 + 0.1, x1: j.x1 - 0.1, z0: j.z1 - 0.1 },
    ];
    for (const m of muros) bloques.push(bloque('hormigon', 'jardin', m, 0, 0.5));
    bloques.push(
      bloque(
        'tierra',
        'jardin',
        { x0: j.x0 + 0.1, x1: j.x1 - 0.1, z0: j.z0 + 0.1, z1: j.z1 - 0.1 },
        0,
        0.42,
      ),
    );
  }
  return bloques;
}

/** Jardineras del este (para plantar en ellas): su interior y la altura de la tierra. */
export function jardineras(): (Caja & { y: number })[] {
  return exterior()
    .filter((b) => b.rol === 'jardin' && b.material === 'tierra')
    .map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.y1 }));
}
