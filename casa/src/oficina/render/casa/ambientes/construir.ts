import { ambienteDe, plano } from '../../../mansion/plano';
import { detallar } from './detalles';
import { dibujarMueble } from './muebles';
import { revestir } from './revestimientos';
import { Taller } from './taller';
import type { Fusionada } from './taller';

/**
 * Arma todo el mobiliario, los revestimientos y los detalles de la casa en un taller y lo
 * fusiona por (material, lado, nivel). Devuelve también la caja de mundo de cada mueble (para
 * las pruebas de huella). Sin DOM: lo usan `Ambientes.tsx` y las pruebas.
 */
export function construirAmbientes(): { fusion: Fusionada[]; cajas: Taller['cajas'] } {
  const t = new Taller();
  const porTipo = new Map<string, number>();
  for (const m of plano.muebles) {
    const i = porTipo.get(m.tipo) ?? 0;
    porTipo.set(m.tipo, i + 1);
    dibujarMueble(t, m, ambienteDe(m.ambiente).y, i);
  }
  revestir(t);
  detallar(t);
  return { fusion: t.fusionar(), cajas: t.cajas };
}
