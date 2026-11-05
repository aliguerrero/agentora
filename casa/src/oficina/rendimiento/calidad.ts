export type NivelCalidad = 'alta' | 'media' | 'baja';

export interface EntradaCalidad {
  modo: 'auto' | NivelCalidad;
  nivelActual: NivelCalidad;
  /** p95 (ms) de los últimos cuadros. */
  p95: number;
  muestras: number;
  reduceMotion: boolean;
}

export interface AjusteCalidad {
  nivel: NivelCalidad;
  /** Tope de devicePixelRatio. */
  dpr: number;
  sombras: boolean;
  /** Multiplicador de velocidad de animación. */
  movimiento: number;
  paseos: boolean;
}

export const MUESTRAS_MINIMAS = 120;
/** Por encima de esto se baja de nivel. */
export const UMBRAL_BAJAR_MS = 14;
/** Por debajo de esto se sube de nivel; entre ambos umbrales no se cambia (histéresis). */
export const UMBRAL_SUBIR_MS = 10;

const NIVELES: NivelCalidad[] = ['alta', 'media', 'baja'];
const PARAMETROS: Record<NivelCalidad, { dpr: number; sombras: boolean }> = {
  alta: { dpr: 2, sombras: true },
  media: { dpr: 1.25, sombras: true },
  baja: { dpr: 1.25, sombras: false },
};

/**
 * Política de calidad. En `auto` mira el p95 de los últimos 120 cuadros: baja un nivel
 * por encima de 14 ms y sube uno por debajo de 10 ms. El llamador debe vaciar la ventana
 * tras cada cambio para no decidir con cuadros del nivel anterior.
 */
export function decidirCalidad(entrada: EntradaCalidad): AjusteCalidad {
  let nivel: NivelCalidad = entrada.modo === 'auto' ? entrada.nivelActual : entrada.modo;
  if (entrada.modo === 'auto' && entrada.muestras >= MUESTRAS_MINIMAS) {
    const i = NIVELES.indexOf(nivel);
    if (entrada.p95 > UMBRAL_BAJAR_MS)
      nivel = NIVELES[Math.min(i + 1, NIVELES.length - 1)] ?? nivel;
    else if (entrada.p95 < UMBRAL_SUBIR_MS) nivel = NIVELES[Math.max(i - 1, 0)] ?? nivel;
  }
  return {
    nivel,
    ...PARAMETROS[nivel],
    movimiento: entrada.reduceMotion ? 0.35 : 1,
    paseos: !entrada.reduceMotion,
  };
}
