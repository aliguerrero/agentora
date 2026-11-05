import { ambienteDe, cajaDe, plano } from '../../mansion/plano';
import type { Mueble } from '../../mansion/plano';
import { ALTO_LIBRE } from './arquitectura';

/**
 * Colgantes de latón sobre las mesas de la casa, derivados del mobiliario del plano: dónde
 * cuelgan, a qué altura queda su pantalla y dónde cae su charco de luz pintado (sobre la
 * cubierta del mueble). Lógica pura; los dibuja `Luminarias.tsx`.
 */
export interface Colgante {
  ambiente: string;
  mueble: string;
  x: number;
  z: number;
  /** Cara inferior del cielo de listones, de donde sale el cable. */
  yCielo: number;
  /** Borde inferior de la pantalla. */
  yPantalla: number;
  /** Cubierta del mueble, donde se pinta el charco. */
  yCharco: number;
  /** Piso del ambiente (un charco amplio y tenue rodea la mesa). */
  yPiso: number;
  /** Radios del charco en x y en z. */
  radioX: number;
  radioZ: number;
}

/** Cuántos colgantes lleva cada tipo de mesa (repartidos a lo largo de su lado largo). */
const POR_TIPO: Record<string, number> = {
  'isla-cocina': 3,
  'mesa-marmol': 3,
  'mesa-lectura': 1,
  'mesa-cartas': 1,
  'mesa-centro': 1,
};

/** Bajo el cielo de listones (sus 8,5 cm). */
const CIELO = 0.085;
/** Distancia de la pantalla a la cubierta del mueble. */
const SOBRE_MESA = 0.85;

export function colgantes(): Colgante[] {
  return plano.muebles.flatMap((m: Mueble): Colgante[] => {
    const n = POR_TIPO[m.tipo];
    if (!n) return [];
    const a = ambienteDe(m.ambiente);
    const caja = cajaDe(m);
    const largoX = caja.x1 - caja.x0 >= caja.z1 - caja.z0;
    const largo = largoX ? caja.x1 - caja.x0 : caja.z1 - caja.z0;
    const yCharco = a.y + m.y + m.alto + 0.004;
    return Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n - 0.5;
      return {
        ambiente: a.id,
        mueble: m.id,
        x: largoX ? m.x + t * largo : m.x,
        z: largoX ? m.z : m.z + t * largo,
        yCielo: a.y + ALTO_LIBRE - CIELO,
        yPantalla: yCharco + SOBRE_MESA,
        yCharco,
        yPiso: a.y,
        radioX: largoX ? Math.min(0.9, largo / n) : 0.7,
        radioZ: largoX ? 0.7 : Math.min(0.9, largo / n),
      };
    });
  });
}
