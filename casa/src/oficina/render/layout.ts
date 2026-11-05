import type { AgenteOficina, Departamento } from '../tipos';
import { ambienteDe, lugaresDe, plano } from '../mansion/plano';
import type { Lugar } from '../mansion/plano';

/** Los 6 departamentos del prototipo. */
export const departamentosBase: Departamento[] = [
  { id: 'desarrollo', nombre: 'Desarrollo', lider: 'Tu producto', color: '#5b7fd6' },
  { id: 'ventas', nombre: 'Ventas', lider: 'Tu negocio', color: '#d9825f' },
  { id: 'contenido', nombre: 'Contenido', lider: '@elkis.dev', color: '#b98ad6' },
  { id: 'finanzas', nombre: 'Finanzas', lider: 'Tus números', color: '#79b98a' },
  { id: 'personal', nombre: 'Personal', lider: 'Tu vida', color: '#d8b56a' },
  { id: 'investigacion', nombre: 'Investigación', lider: 'Ciencia', color: '#7fc4de' },
];

export interface Punto {
  x: number;
  z: number;
}

/** Separación (m) de cada vuelta de lugares de pie repetidos cuando un departamento rebosa. */
const DESFASE_VUELTA = { x: 0.4, z: 0.3 };
/** Grupos de puntos de pausa en la barra de café (cada grupo son 4 puntos contiguos). */
const GRUPOS_CAFE = 3;
const PUNTOS_POR_GRUPO = 4;

/** Un puesto: el lugar de la casa que ocupa una persona, con los puntos que lee la simulación. */
export interface Puesto {
  agenteId: string;
  /** Índice del ambiente de trabajo en `plano.ambientes`: agrupa las visitas y las conversaciones. */
  sala: number;
  ambiente: string;
  /** Altura del piso del ambiente. */
  y: number;
  /** Trabaja sentado (el lugar tiene silla); si no, de pie. */
  sentado: boolean;
  lugar: Lugar;
  /** Identifica el lugar (con su vuelta); la ruta se rehace si cambia. */
  clave: string;
  /** Hacia dónde mira: el mueble o la pantalla con la que trabaja. */
  escritorio: Punto;
  /** Dónde se sienta o se para a trabajar. */
  asiento: Punto;
  /** Dónde espera de pie: el punto libre a un costado de su mueble. */
  parado: Punto;
  /** Su punto de pausa en la barra de café de la cocina. */
  cafe: Punto;
  /** Centro del ambiente del puesto. */
  centro: Punto;
  /** Dónde se para frente al aro de luz de Contenido; `null` si la casa no lo tiene o no es su ambiente. */
  luz: Punto | null;
  /** Giro (rad, eje Y) del escritorio, la silla y el monitor respecto de su plano base. */
  giro: number;
  /** Hacia dónde mira la persona en su lugar (yaw). */
  yawSentado: number;
}

/** El lugar `n` de un departamento; pasado el último, repite los de pie con un desfase por vuelta. */
function lugarNumero(lista: readonly Lugar[], n: number): Lugar {
  const base = lista[n];
  if (base) return base;
  const extras = lista.filter((l) => l.extra);
  const ciclo = extras.length > 0 ? extras : lista;
  const sobrante = n - lista.length;
  const origen = ciclo[sobrante % ciclo.length] as Lugar;
  const vuelta = Math.floor(sobrante / ciclo.length) + 1;
  const dx = vuelta * DESFASE_VUELTA.x;
  const dz = (vuelta % 3) * DESFASE_VUELTA.z;
  return {
    ...origen,
    id: `${origen.id}+${vuelta}`,
    x: origen.x + dx,
    z: origen.z + dz,
    mira: { x: origen.mira.x + dx, z: origen.mira.z + dz },
    salida: { x: origen.salida.x + dx, z: origen.salida.z + dz },
  };
}

/**
 * Asigna a cada agente un lugar de la casa, en el orden de entrada. Los 6 primeros de un
 * departamento ocupan sus lugares de base; del séptimo en adelante van de pie, y pasados los
 * 10 se repiten con un desfase. Un departamento que la casa no conoce usa el atrio. El punto
 * de café sale del grupo del departamento (su posición en `departamentos`).
 */
export function asignarPuestos(
  agentes: readonly AgenteOficina[],
  departamentos: readonly Departamento[],
): Puesto[] {
  const ocupados = new Map<string, number>();
  return agentes.map((agente) => {
    const conocido = plano.ambientes.some((a) => a.departamento === agente.departamento);
    const grupo = conocido ? agente.departamento : '#atrio';
    const n = ocupados.get(grupo) ?? 0;
    ocupados.set(grupo, n + 1);

    const lugar = lugarNumero(lugaresDe(agente.departamento), n);
    const ambiente = ambienteDe(lugar.ambiente);
    const cluster = Math.max(
      0,
      departamentos.findIndex((d) => d.id === agente.departamento),
    );
    const cafe = plano.cafe[(cluster % GRUPOS_CAFE) * PUNTOS_POR_GRUPO + (n % PUNTOS_POR_GRUPO)];
    const centro = { x: (ambiente.x0 + ambiente.x1) / 2, z: (ambiente.z0 + ambiente.z1) / 2 };
    const luz = plano.luz?.ambiente === ambiente.id ? plano.luz : null;
    return {
      agenteId: agente.id,
      sala: plano.ambientes.indexOf(ambiente),
      ambiente: ambiente.id,
      y: lugar.y,
      sentado: lugar.asiento,
      lugar,
      clave: lugar.id,
      escritorio: lugar.mira,
      asiento: { x: lugar.x, z: lugar.z },
      parado: lugar.salida,
      cafe: cafe ?? { x: lugar.x, z: lugar.z },
      centro,
      luz: luz ? { x: luz.x, z: luz.z } : null,
      giro: lugar.yaw - Math.PI,
      yawSentado: lugar.yaw,
    };
  });
}
