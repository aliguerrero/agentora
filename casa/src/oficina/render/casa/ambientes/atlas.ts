import type { Rect } from './taller';

/**
 * Regiones de las texturas atlas del mobiliario (lógica pura). Cada lienzo mide 1024 × 1024;
 * las regiones se dan en píxeles del lienzo (y hacia abajo) y se pasan a UV (v hacia arriba).
 */
const LADO = 1024;

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  u0: x0 / LADO,
  v0: 1 - y1 / LADO,
  u1: x1 / LADO,
  v1: 1 - y0 / LADO,
});

/** Pantallas de datos: pipeline (2:1), gráficos, velas, ondas de audio y KPI. */
export const DATOS = {
  pipeline: rect(0, 0, 1024, 512),
  grafico: rect(0, 512, 512, 768),
  velas: rect(512, 512, 1024, 768),
  onda: rect(0, 768, 512, 1024),
  kpi: rect(512, 768, 1024, 1024),
} as const;

/** Láminas: carta estelar (mural 2:1) y tres cuadros abstractos (dos verticales y uno cuadrado). */
export const LAMINA = {
  estrellas: rect(0, 0, 1024, 512),
  vertical1: rect(0, 512, 256, 1024),
  vertical2: rect(256, 512, 512, 1024),
  cuadrado: rect(512, 512, 1024, 1024),
} as const;

/** Columnas de código del lienzo de código (cuatro archivos distintos, uno por columna). */
export const COLUMNAS_CODIGO = 4;

/**
 * Región de código para una pantalla de proporción `aspecto` (ancho / alto): una columna y una
 * franja vertical que empieza en `inicio` (0..1). La textura se repite en v, así que la franja
 * puede pasarse del borde: al avanzar el código, sigue de corrido.
 */
export function rectCodigo(columna: number, aspecto: number, inicio: number): Rect {
  const c = ((columna % COLUMNAS_CODIGO) + COLUMNAS_CODIGO) % COLUMNAS_CODIGO;
  const ancho = 1 / COLUMNAS_CODIGO;
  const alto = ancho / aspecto;
  const v0 = inicio - Math.floor(inicio);
  return { u0: c * ancho, v0, u1: (c + 1) * ancho, v1: v0 + alto };
}

/** La región entera (planos de halo y de fuego). */
export const TODO: Rect = { u0: 0, v0: 0, u1: 1, v1: 1 };
