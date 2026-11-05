/** Amplitud de balanceo de cadera (rad) a velocidad de paseo (velocidad = 1). */
export const AMPLITUD_CADERA = 0.6;
/** Flexión máxima de rodilla durante el balanceo (rad) a velocidad de paseo. */
const FLEXION_RODILLA = 1;

export interface PiernaMarcha {
  /** Rotación en x de la cadera: negativa = pierna hacia delante. */
  cadera: number;
  /** Flexión de rodilla: 0 en apoyo, > 0 en balanceo. */
  rodilla: number;
}

/**
 * Pierna en un punto del ciclo de marcha (`fase` en radianes, 0..2π).
 * La pierna avanza (balanceo) mientras cos(fase) > 0 y retrocede apoyada el resto.
 * `velocidad` escala la amplitud (1 = paseo, 0 = quieto). La otra pierna va a `fase + π`.
 * Escribe en `out` y lo devuelve: se llama una vez por pierna y por cuadro, sin crear objetos.
 */
export function piernaEnFase(fase: number, velocidad: number, out: PiernaMarcha): PiernaMarcha {
  out.cadera = -AMPLITUD_CADERA * velocidad * Math.sin(fase);
  out.rodilla = FLEXION_RODILLA * velocidad * Math.max(0, Math.cos(fase));
  return out;
}

/**
 * Frecuencia del ciclo (rad/s) para que el pie de apoyo no deslice: durante el apoyo
 * (medio ciclo) el pie retrocede 2·L·sen(A) respecto de la cadera, y eso debe
 * igualar `velocidad` (m/s) por el tiempo de apoyo π/ω.
 */
export function frecuenciaPaso(velocidad: number, largoPierna: number): number {
  return (Math.PI * velocidad) / (2 * largoPierna * Math.sin(AMPLITUD_CADERA));
}
