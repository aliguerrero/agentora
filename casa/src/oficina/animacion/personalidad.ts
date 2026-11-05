import { PESOS_BASE } from './idle';
import type { PesosIdle } from './idle';

/** A dónde va a pausar quien se levanta: al café o al aro de luz (si su sala lo tiene). */
export type DestinoPaseo = 'cafe' | 'luz';
/** Qué hace durante la pausa. */
export type ComportamientoPausa = 'cafe' | 'telefono_circulo' | 'probar_luz';

/** Cómo se comporta un rol cuando está libre. Solo datos: el motor no sabe de roles. */
export interface PerfilIdle {
  /** Peso de cada variante de idle sentado. */
  pesos: PesosIdle;
  destinoPaseo: DestinoPaseo;
  pausa: ComportamientoPausa;
}

export const PERFIL_NEUTRO: PerfilIdle = { pesos: PESOS_BASE, destinoPaseo: 'cafe', pausa: 'cafe' };

const desarrollo: PerfilIdle = {
  pesos: { respirar: 3, tamborilear: 3, estirar_espalda: 3, tomar_cafe: 3, mirar_alrededor: 1 },
  destinoPaseo: 'cafe',
  pausa: 'cafe',
};
const ventas: PerfilIdle = {
  pesos: { respirar: 3, telefono: 4, tamborilear: 2, mirar_alrededor: 1 },
  destinoPaseo: 'cafe',
  pausa: 'telefono_circulo',
};
const contenido: PerfilIdle = {
  pesos: { respirar: 3, mirar_alrededor: 3, tamborilear: 2, rascarse_cabeza: 2 },
  destinoPaseo: 'luz',
  pausa: 'probar_luz',
};
const papeles: PerfilIdle = {
  pesos: { revisar_papeles: 6, respirar: 3, tamborilear: 2, mirar_alrededor: 1 },
  destinoPaseo: 'cafe',
  pausa: 'cafe',
};
const lectura: PerfilIdle = {
  pesos: { leer_documento: 6, respirar: 3, mirar_alrededor: 2, rascarse_cabeza: 1 },
  destinoPaseo: 'cafe',
  pausa: 'cafe',
};

/** Perfil por rol (los mismos roles que `vestuario/roles.ts`). */
export const PERFILES: Record<string, PerfilIdle> = {
  'Front designer': desarrollo,
  Backend: desarrollo,
  QA: desarrollo,
  Integrador: desarrollo,
  'Ejecutivo de ventas': ventas,
  'Analista comercial': ventas,
  Redactor: {
    pesos: { respirar: 3, tamborilear: 3, rascarse_cabeza: 2, mirar_alrededor: 2 },
    destinoPaseo: 'cafe',
    pausa: 'cafe',
  },
  Guionista: contenido,
  'Editor de video': contenido,
  Community: contenido,
  Contador: papeles,
  Planificador: { ...papeles, pesos: { revisar_papeles: 4, respirar: 3, tamborilear: 2 } },
  Cobranza: { ...ventas, pesos: { telefono: 4, revisar_papeles: 2, respirar: 3 } },
  'Asistente personal': {
    ...PERFIL_NEUTRO,
    pesos: { respirar: 4, mirar_alrededor: 3, telefono: 2 },
  },
  Coach: { ...PERFIL_NEUTRO, pesos: { respirar: 3, estirar_espalda: 4, estirarse: 2 } },
  Compras: { ...PERFIL_NEUTRO, pesos: { respirar: 4, mirar_alrededor: 3, tamborilear: 2 } },
  Científico: lectura,
  'Vigía de novedades': {
    ...lectura,
    pesos: { leer_documento: 3, mirar_alrededor: 4, respirar: 3 },
  },
  Verificador: { ...lectura, pesos: { revisar_papeles: 3, leer_documento: 3, respirar: 3 } },
};

/** Perfil de un rol; los desconocidos usan el neutro. */
export function perfilDeRol(rol: string): PerfilIdle {
  return PERFILES[rol] ?? PERFIL_NEUTRO;
}
