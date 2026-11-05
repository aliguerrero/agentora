import { BAJA_SENTADO } from '../../animador';

/**
 * Alturas de asiento medidas sobre el cuerpo de las personas (no al revés). Sentada, la raíz
 * baja `BAJA_SENTADO` y la pelvis (grupo a 0,62 en `Persona.tsx`) queda a 0,45 m: ahí apoya el
 * torso. El muslo queda horizontal con su eje a esa altura y mide 0,27 de grueso, así que su
 * cara de abajo queda 0,135 más abajo. Un asiento creíble cumple las dos cosas: su cara está a
 * la altura de la pelvis (el torso no flota) y su cuerpo baja al menos hasta el muslo (el muslo
 * no asoma por debajo del asiento). Lógica pura; la usan los dibujos de `muebles.ts`.
 */

/** Altura de la pelvis de pie (m), la del grupo `pelvis` de `Persona.tsx`. */
const PELVIS_DE_PIE = 0.62;
/** Medio grueso del muslo (caja de 0,27 en `Persona.tsx`). */
const MEDIO_MUSLO = 0.135;

/** Altura de la pelvis de una persona sentada: la cara de todo asiento. */
export const ALTURA_ASIENTO = PELVIS_DE_PIE - BAJA_SENTADO;
/** Cara inferior del muslo de una persona sentada. */
export const BAJO_MUSLO = ALTURA_ASIENTO - MEDIO_MUSLO;

export interface Asiento {
  /** Cara superior del cojín o del asiento. */
  arriba: number;
  /** Cara inferior del cuerpo del asiento (cojín, faldón o base tapizada). */
  abajo: number;
}

/**
 * Los tipos del plano en los que se sienta alguien. El cojín se hunde 1 cm bajo la pelvis para
 * que el torso se vea apoyado, nunca flotando.
 */
export const ASIENTOS = {
  'silla-malla': { arriba: ALTURA_ASIENTO - 0.01, abajo: BAJO_MUSLO - 0.01 },
  'silla-madera': { arriba: ALTURA_ASIENTO - 0.01, abajo: BAJO_MUSLO - 0.01 },
  'sillon-cuero': { arriba: ALTURA_ASIENTO - 0.01, abajo: 0.1 },
  'sofa-modular': { arriba: ALTURA_ASIENTO - 0.01, abajo: 0.08 },
} as const satisfies Record<string, Asiento>;

export type TipoSentable = keyof typeof ASIENTOS;

export const esSentable = (tipo: string): tipo is TipoSentable => tipo in ASIENTOS;
