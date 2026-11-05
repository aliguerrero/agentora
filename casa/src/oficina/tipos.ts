/** Zonas del cuerpo donde puede ir una pieza. Una sola pieza por zona. */
export const ZONAS = [
  'cabeza',
  'pelo',
  'expresion',
  'cara',
  'orejas',
  'sombrero',
  'espalda',
  'mano',
  'cuello',
  'torso',
  'cintura',
] as const;

export type Zona = (typeof ZONAS)[number];

export interface Pieza {
  id: string;
  nombre: string;
  zona: Zona;
  /** Zonas que quedan ocultas mientras esta pieza está equipada. */
  excluye?: Zona[];
}

/** Opción simple de catálogo (peinado, cara, top, bottom). */
export interface Opcion {
  id: string;
  nombre: string;
}

/** Mismo shape que guarda el prototipo en localStorage (`oficina-jules-avatares`). */
export interface Atuendo {
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  print: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  acc: string[];
}

/** Disfraz: atuendo parcial que se aplica sobre el actual. */
export interface Disfraz {
  id: string;
  nombre: string;
  descripcion: string;
  atuendo: Partial<Atuendo>;
}

/** Paquete de skins: solo datos; registrarlo no toca el motor. */
export interface PaqueteSkins {
  id: string;
  nombre: string;
  piezas?: Pieza[];
  caras?: Opcion[];
  tops?: Opcion[];
  disfraces?: Disfraz[];
}

export interface Catalogo {
  pieles: string[];
  peinados: Opcion[];
  coloresPelo: string[];
  caras: Opcion[];
  tops: Opcion[];
  coloresTop: string[];
  bottoms: Opcion[];
  coloresBottom: string[];
  coloresZapatos: string[];
  piezas: Pieza[];
  disfraces: Disfraz[];
  paquetes: string[];
}

/** Atuendo ya normalizado y con las exclusiones aplicadas (vista de render). */
export interface AtuendoResuelto extends Atuendo {
  /** Zonas ocultas por exclusión; `acc` ya no incluye las piezas ocultas. */
  ocultas: Zona[];
}

export type EstadoAgente = 'trabajando' | 'esperando_decision' | 'libre';
export type Actividad = 'leyendo' | 'escribiendo' | 'pensando' | 'hablando';

export interface AgenteOficina {
  id: string;
  nombre: string;
  rol: string;
  departamento: string;
  estado: EstadoAgente;
  actividad?: Actividad;
  tarea?: string;
  atuendo?: Atuendo;
  /** Color del departamento (etiqueta sobre la cabeza). Añadido por la Oficina DevBox. */
  color?: string;
}

/** Cuándo se ve el nombre sobre la cabeza: siempre, al pasar el mouse o nunca (solo al seleccionar). */
export type ModoEtiquetas = 'siempre' | 'hover' | 'nunca';

export interface Departamento {
  id: string;
  nombre: string;
  lider: string;
  color: string;
}

export interface MetricasRender {
  webgl: boolean;
  fps?: number;
  p50?: number;
  p95?: number;
  drawCalls?: number;
  triangulos?: number;
  agentes?: number;
}
