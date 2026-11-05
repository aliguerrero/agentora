import { luzDelDia } from '../../ambiente/hora';

/**
 * Paleta de luz de la mansión según la hora de Chile: cielo, sol, luna, relleno del cielo,
 * reflejos, interior encendido, cordillera y agua. Lógica pura (sin three) y continua: todo
 * sale de mezclar cuatro paletas fijas (noche, día, mañana y atardecer) con pesos suaves, así
 * que ningún valor salta al pasar las horas. La capa R3F solo la traduce a luces y uniforms.
 */

/** Color en sRGB, cada canal en 0..1. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LuzPuntual extends Vec3 {
  color: RGB;
  /** Relativa (0..1); `Luces` la lleva a candelas. */
  intensidad: number;
  distancia: number;
}

export interface PaletaLuz {
  /** 0 = noche cerrada, 1 = pleno día (de `luzDelDia`). */
  factor: number;
  /** Peso de la hora dorada (0..1), máximo hacia las 19 h. */
  dorado: number;
  /** Peso de la mañana fresca (0..1), máximo hacia las 7:30. */
  manana: number;
  cielo: { cenit: RGB; horizonte: RGB; valle: RGB };
  /** Dirección hacia el astro (unitaria) en coordenadas de la escena. */
  sol: { direccion: Vec3; color: RGB; intensidad: number };
  luna: { direccion: Vec3; color: RGB; intensidad: number };
  hemisferio: { cielo: RGB; suelo: RGB; intensidad: number };
  /** Intensidad del entorno PMREM (`scene.environmentIntensity`). */
  entorno: number;
  exposicion: number;
  estrellas: number;
  /** Cordillera en dos planos: el cordón cercano y los Andes al fondo. */
  montanas: { cerca: RGB; lejos: RGB };
  agua: { fondo: RGB; luces: number };
  interior: { color: RGB; led: number; charcos: number; puntuales: LuzPuntual[] };
}

/** Tope de luces puntuales reales: el resto de la luz interior es emisiva o pintada. */
export const MAX_PUNTUALES = 4;

function hex(valor: string): RGB {
  const n = parseInt(valor.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

interface Tono {
  cenit: RGB;
  horizonte: RGB;
  valle: RGB;
  sol: RGB;
  hemiCielo: RGB;
  hemiSuelo: RGB;
  cerca: RGB;
  lejos: RGB;
  agua: RGB;
}

const tono = (t: Record<keyof Tono, string>): Tono =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, hex(v)])) as unknown as Tono;

/** Noche de luna: cielo índigo, relleno azulado y la cordillera apenas recortada. */
const NOCHE = tono({
  cenit: '#030716',
  horizonte: '#1a2a52',
  valle: '#0a111f',
  sol: '#ff9a5a',
  hemiCielo: '#2c4378',
  hemiSuelo: '#0b0d13',
  cerca: '#0b1322',
  lejos: '#1d2b50',
  agua: '#041c22',
});
/**
 * Mediodía: cielo azul profundo (no lavado), sol neutro y fuerte y un relleno frío y bajo,
 * para que la sombra se lea azulada y con peso frente a lo asoleado.
 */
const DIA = tono({
  cenit: '#2a64b4',
  horizonte: '#b7d1e8',
  valle: '#7d8c66',
  sol: '#fff1dc',
  hemiCielo: '#a9c4e8',
  hemiSuelo: '#6e604c',
  cerca: '#4b5d57',
  lejos: '#8aa3bd',
  agua: '#0d5d6c',
});
/**
 * Hora dorada: sol naranja intenso y bajo, sombras violeta, horizonte ámbar, cenit violeta y
 * la cordillera encendida en rosa (arrebol).
 */
const DORADO = tono({
  cenit: '#2f3a78',
  horizonte: '#ff9a4d',
  valle: '#6a5040',
  sol: '#ff8a36',
  hemiCielo: '#8d82b3',
  hemiSuelo: '#5e3f2c',
  cerca: '#382c42',
  lejos: '#d48a7c',
  agua: '#244f5c',
});
/** Mañana fresca: sol tibio y bajo sobre aire frío; horizonte rosado pálido sobre azul limpio. */
const MANANA = tono({
  cenit: '#4f80cc',
  horizonte: '#dfe0e8',
  valle: '#808f9e',
  sol: '#ffe0c0',
  hemiCielo: '#b9cff0',
  hemiSuelo: '#6c6e72',
  cerca: '#4a5c7c',
  lejos: '#8d9cc0',
  agua: '#155f72',
});

/** Ámbar de 2700 K: el de las tiras LED, los colgantes y las luces puntuales. */
const AMBAR = hex('#ffb46b');
const LUNA = hex('#a3bbff');

const limitar = (x: number) => Math.min(1, Math.max(0, x));
function suave(desde: number, hasta: number, x: number): number {
  const t = limitar((x - desde) / (hasta - desde));
  return t * t * (3 - 2 * t);
}
/** Sube de `a` a `pico` y baja hasta `b`, sin saltos. */
const campana = (x: number, a: number, pico: number, b: number) =>
  suave(a, pico, x) * (1 - suave(pico, b, x));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mezclar = (a: RGB, b: RGB, t: number): RGB => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
});

function normalizar(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

const RAD = Math.PI / 180;
/** Santiago: latitud y declinación de noviembre. */
const LATITUD = -33.45 * RAD;
const DECLINACION = -15 * RAD;
/** Mediodía solar con horario de verano; deja la puesta cerca de las 20 h, como `luzDelDia`. */
const MEDIODIA_SOLAR = 13.3;

/**
 * Dirección hacia el sol (x = este, y = arriba, z = sur): modelo de ángulo horario. En Chile
 * el sol pasa por el norte, es decir, por detrás de la casa (-z); al amanecer y al atardecer
 * entra rasante por los costados, un poco desde el lado de la cámara.
 */
function direccionSol(h: number): Vec3 {
  const angulo = (h - MEDIODIA_SOLAR) * 15 * RAD;
  const este = -Math.cos(DECLINACION) * Math.sin(angulo);
  const arriba =
    Math.sin(LATITUD) * Math.sin(DECLINACION) +
    Math.cos(LATITUD) * Math.cos(DECLINACION) * Math.cos(angulo);
  const norte =
    Math.cos(LATITUD) * Math.sin(DECLINACION) -
    Math.sin(LATITUD) * Math.cos(DECLINACION) * Math.cos(angulo);
  return normalizar({ x: este, y: arriba, z: -norte });
}

/** La luna, fija sobre la cordillera (norte-noreste), donde la cámara la ve detrás de la casa. */
const DIRECCION_LUNA = normalizar({ x: 0.32, y: 0.5, z: -0.8 });

/**
 * Luces puntuales reales: dos en el primer piso (oeste y este), una sobre el atrio que alcanza
 * el segundo piso y otra en el tercero, que llega a la torre. El resto es emisivo y pintado.
 */
const PUNTUALES: readonly Vec3[] = [
  { x: -8, y: 2.9, z: 1.2 },
  { x: 9, y: 2.9, z: 1.2 },
  { x: 0, y: 6.8, z: 0.8 },
  { x: 0, y: 10.7, z: 0.6 },
];

/** Paleta de la casa para una hora (0–24, se envuelve). */
export function paletaLuz(hora: number): PaletaLuz {
  const h = ((hora % 24) + 24) % 24;
  const { factor: f, intensidadLamparas } = luzDelDia(h);
  const dorado = campana(h, 17.3, 19.2, 20.6);
  const manana = campana(h, 5.8, 7.4, 9.5);
  const base = (clave: keyof Tono) => mezclar(NOCHE[clave], DIA[clave], f);
  const color = (clave: keyof Tono): RGB => {
    const b = base(clave);
    const conDorado = mezclar(b, DORADO[clave], dorado);
    return mezclar(conDorado, MANANA[clave], manana);
  };

  const sol = direccionSol(h);
  const noche = 1 - f;
  return {
    factor: f,
    dorado,
    manana,
    cielo: { cenit: color('cenit'), horizonte: color('horizonte'), valle: color('valle') },
    sol: {
      direccion: sol,
      color: color('sol'),
      // El sol bajo de la hora dorada pega más fuerte (rasante y saturado).
      intensidad: 3.4 * suave(-0.06, 0.4, sol.y) * (1 + 0.45 * dorado),
    },
    luna: { direccion: DIRECCION_LUNA, color: LUNA, intensidad: 0.45 * noche },
    hemisferio: {
      cielo: color('hemiCielo'),
      suelo: color('hemiSuelo'),
      intensidad: lerp(0.16, 0.52, f) - 0.1 * dorado,
    },
    entorno: lerp(0.12, 0.5, f) - 0.1 * dorado,
    exposicion: lerp(1.2, 0.95, f) + 0.1 * dorado,
    estrellas: noche * noche,
    montanas: { cerca: color('cerca'), lejos: color('lejos') },
    agua: { fondo: color('agua'), luces: noche },
    interior: {
      color: AMBAR,
      led: intensidadLamparas,
      charcos: lerp(0.12, 1, noche),
      puntuales: PUNTUALES.map((p) => ({
        ...p,
        color: AMBAR,
        intensidad: lerp(0.06, 1, noche),
        distancia: 13,
      })),
    },
  };
}
