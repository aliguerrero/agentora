import { alasConstruidas, ESPESOR_LOSA, NIVEL_Y } from '../../mansion/plano';

/**
 * Oclusión barata de la casa, sin mapas de sombra: el sol (y la luna) solo entra a un piso
 * por sus aberturas, es decir, por el corte del frente (+z) o por el muro cortina del fondo
 * (-z). Si el rayo hacia el astro choca antes con la losa de arriba o con un muro de costado,
 * ese punto queda en sombra. Así, sin calcular nada pesado, a mediodía los pisos quedan en
 * sombra con una franja de sol junto al vidrio, y al atardecer el sol rasante entra hondo.
 * Además la luz del cielo (hemisferio y reflejos) baja hacia el fondo de cada piso.
 *
 * La misma lógica vive en TypeScript (probada) y en GLSL (`GLSL_OCLUSION`, que la usan los
 * materiales de la casa); los volúmenes se generan de esta misma lista para que no diverjan.
 */

export interface Volumen {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Piso terminado. */
  y0: number;
  /** Cara inferior de la losa de arriba (el cielo del piso). */
  y1: number;
}

export interface Dir3 {
  x: number;
  y: number;
  z: number;
}

const cielo = (nivelSiguiente: number) => nivelSiguiente - ESPESOR_LOSA;
/** Caras interiores de los muros de borde y del muro cortina, y el frente del corte. */
const BORDE = { x0: -16, x1: 16, z0: -4.1, z1: 4 };

/**
 * Volúmenes techados, del más específico al más general: el atrio de doble altura va antes
 * que el primer piso (su cielo es la losa del tercer piso).
 */
export const VOLUMENES: readonly Volumen[] = [
  { x0: -4, x1: 4, z0: BORDE.z0, z1: BORDE.z1, y0: NIVEL_Y.piso1, y1: cielo(NIVEL_Y.piso3) },
  { ...BORDE, y0: NIVEL_Y.piso1, y1: cielo(NIVEL_Y.piso2) },
  { ...BORDE, y0: NIVEL_Y.piso2, y1: cielo(NIVEL_Y.piso3) },
  { ...BORDE, y0: NIVEL_Y.piso3, y1: cielo(NIVEL_Y.torre) },
  { x0: -4, x1: 4, z0: BORDE.z0, z1: 2, y0: NIVEL_Y.torre, y1: NIVEL_Y.torre + 3.6 },
];

/** Los de la casa y, después, los de las salas construidas. */
export function volumenesActuales(): readonly Volumen[] {
  const alas = alasConstruidas();
  if (!alas.length) return VOLUMENES;
  return [
    ...VOLUMENES,
    ...alas.map(({ ambiente: a }) => ({ x0: a.x0, x1: a.x1, z0: BORDE.z0, z1: BORDE.z1, y0: a.y, y1: a.y + a.alto })),
  ];
}

/** Cuánto deja pasar el muro cortina del fondo. */
export const PASO_VIDRIO = 0.8;
/** Luz del cielo en lo más hondo de un piso (fracción de la de afuera). */
export const CIELO_FONDO = 0.42;
/** Media penumbra (m) del borde de las manchas de sol. */
const PENUMBRA = 0.35;
/** Metros desde una abertura en que la luz del cielo cae hasta `CIELO_FONDO`. */
const CAIDA_CIELO = 3;

const MARGEN = 0.01;

function volumenDe(p: Dir3): Volumen | null {
  for (const v of volumenesActuales()) {
    if (
      p.x > v.x0 + MARGEN &&
      p.x < v.x1 - MARGEN &&
      p.z > v.z0 + MARGEN &&
      p.z < v.z1 - MARGEN &&
      p.y >= v.y0 - MARGEN &&
      p.y < v.y1 - MARGEN
    ) {
      return v;
    }
  }
  return null;
}

function suave(desde: number, hasta: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - desde) / (hasta - desde)));
  return t * t * (3 - 2 * t);
}

/**
 * Fracción (0..1) de la luz directa de un astro en dirección `astro` (unitaria, hacia el
 * astro) que llega al punto `p`. Fuera de la casa, 1.
 */
export function luzDirecta(p: Dir3, astro: Dir3): number {
  const v = volumenDe(p);
  if (!v) return 1;
  if (astro.y <= 0) return 0;
  const tTecho = (v.y1 - p.y) / astro.y;
  const tCostado =
    astro.x > 1e-6 ? (v.x1 - p.x) / astro.x : astro.x < -1e-6 ? (p.x - v.x0) / -astro.x : Infinity;
  const bloqueo = Math.min(tTecho, tCostado);
  let abertura = Infinity;
  let paso = 1;
  if (astro.z > 1e-6) abertura = (v.z1 - p.z) / astro.z;
  else if (astro.z < -1e-6) {
    abertura = (p.z - v.z0) / -astro.z;
    paso = PASO_VIDRIO;
  }
  if (abertura === Infinity) return 0;
  return paso * suave(-PENUMBRA, PENUMBRA, bloqueo - abertura);
}

/** Fracción (0..1) de la luz del cielo (hemisferio y reflejos) que llega a `p`. */
export function luzCielo(p: Dir3): number {
  const v = volumenDe(p);
  if (!v) return 1;
  const alFrente = v.z1 - p.z;
  const alFondo = p.z - v.z0;
  const abierto = Math.max(
    1 - suave(0, CAIDA_CIELO, alFrente),
    PASO_VIDRIO * (1 - suave(0, CAIDA_CIELO * 0.6, alFondo)),
  );
  return CIELO_FONDO + (1 - CIELO_FONDO) * abierto;
}

const f = (n: number) => n.toFixed(4);

/** Las mismas dos funciones en GLSL (para inyectar en los materiales de la casa). */
export const glslOclusion = (): string => /* glsl */ `
bool oclVolumen(vec3 p, out vec3 lo, out vec3 hi) {
${volumenesActuales().map(
  (
    v,
  ) => `  if (p.x > ${f(v.x0 + MARGEN)} && p.x < ${f(v.x1 - MARGEN)} && p.z > ${f(v.z0 + MARGEN)} && p.z < ${f(v.z1 - MARGEN)} && p.y >= ${f(v.y0 - MARGEN)} && p.y < ${f(v.y1 - MARGEN)}) {
    lo = vec3(${f(v.x0)}, ${f(v.y0)}, ${f(v.z0)}); hi = vec3(${f(v.x1)}, ${f(v.y1)}, ${f(v.z1)}); return true;
  }`,
).join('\n')}
  return false;
}
float oclLuzDirecta(vec3 p, vec3 a) {
  vec3 lo; vec3 hi;
  if (!oclVolumen(p, lo, hi)) return 1.0;
  if (a.y <= 0.0) return 0.0;
  float tTecho = (hi.y - p.y) / a.y;
  float tCostado = a.x > 1e-6 ? (hi.x - p.x) / a.x : (a.x < -1e-6 ? (p.x - lo.x) / -a.x : 1e9);
  float bloqueo = min(tTecho, tCostado);
  float abertura = 1e9;
  float paso = 1.0;
  if (a.z > 1e-6) abertura = (hi.z - p.z) / a.z;
  else if (a.z < -1e-6) { abertura = (p.z - lo.z) / -a.z; paso = ${f(PASO_VIDRIO)}; }
  if (abertura > 1e8) return 0.0;
  return paso * smoothstep(${f(-PENUMBRA)}, ${f(PENUMBRA)}, bloqueo - abertura);
}
float oclLuzCielo(vec3 p) {
  vec3 lo; vec3 hi;
  if (!oclVolumen(p, lo, hi)) return 1.0;
  float abierto = max(
    1.0 - smoothstep(0.0, ${f(CAIDA_CIELO)}, hi.z - p.z),
    ${f(PASO_VIDRIO)} * (1.0 - smoothstep(0.0, ${f(CAIDA_CIELO * 0.6)}, p.z - lo.z))
  );
  return ${f(CIELO_FONDO)} + ${f(1 - CIELO_FONDO)} * abierto;
}
`;
