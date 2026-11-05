/**
 * La Mansión de Jules como datos: niveles, ambientes, muebles (huellas), lugares de trabajo,
 * muros con sus vanos, escaleras, huecos y la barra de café. Lógica pura, sin three: la leen
 * la simulación de personas (`rutas.ts`, `render/layout.ts`) y, más adelante, el dibujo de la
 * arquitectura y del mobiliario.
 *
 * Sistema de coordenadas (metros):
 * - x crece de oeste (-) a este (+); la casa mide 32 m (x de -16 a 16).
 * - z: el fondo de la casa es -4 y el borde abierto hacia la cámara es +4 (la fachada sur no
 *   existe: es un corte tipo casa de muñecas). La terraza y la piscina siguen hacia +z.
 * - y es la altura. Cada nivel se identifica por la cara superior de su losa (`NIVEL_Y`); la
 *   losa mide `ESPESOR_LOSA` bajo esa cara.
 * - Un yaw sigue el convenio de `atan2(x, z)`: 0 mira hacia +z (hacia la cámara), π/2 hacia +x.
 * - Un `giro` es la `rotation.y` de three del mueble. Su "frente" es su eje local +z, y las
 *   huellas solo usan giros múltiplos de 90° (`cajaDe` calcula la caja exacta en planta).
 *
 * Tipos de mueble (los dibuja el agente de arte por `tipo`):
 * - Trabajo: `escritorio-nogal`, `silla-malla`, `videowall`, `mesa-lectura`, `silla-madera`,
 *   `mesa-cartas`, `mesa-mezcla`, `sillon-cuero`, `mesa-marmol`.
 * - Desarrollo y Contenido: `videowall`, `panel-acustico`, `letrero-neon`, `aro-luz`, `camara-tripode`.
 * - Finanzas: `librero`, `boveda`.
 * - Ventas: `pantalla-pipeline`, `carro-bar`.
 * - Investigación: `telescopio`.
 * - Personal: `maquina-gimnasio`, `banco-pesas`, `rack-mancuernas`, `espejo-gimnasio`,
 *   `chimenea`, `sofa-modular`, `mesa-centro`.
 * - Cocina y atrio: `isla-cocina`, `taburete`, `mueble-cocina`, `barra-cafe`, `espejo-agua`.
 * - Terraza: `reposera`.
 *
 * Convención de los lugares: un lugar sentado está DENTRO de la huella de su silla (`silla`
 * es el id de ese mueble); uno de pie queda a más de 0,3 m de todo mueble. La salida de un
 * lugar es el punto libre por donde se levanta la persona, y desde ahí hay un carril recto
 * hasta el pasillo del ambiente.
 */

export const NIVEL_Y = { piso1: 0, piso2: 3.9, piso3: 7.8, torre: 11.7 } as const;
export type Nivel = keyof typeof NIVEL_Y;
/** Espesor de las losas, bajo la cara superior de cada nivel. */
export const ESPESOR_LOSA = 0.3;
/** Ancho (m) de todos los vanos de puerta. */
export const ANCHO_VANO = 1.2;

export interface PuntoXZ {
  x: number;
  z: number;
}

export interface Caja {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Ambiente extends Caja {
  id: string;
  nombre: string;
  nivel: Nivel;
  /** Altura de su piso (cara superior de la losa). */
  y: number;
  /** Altura libre; 0 si no tiene techo (la terraza). */
  alto: number;
  /** Departamento al que pertenece; `null` si es común (atrio, cocina, pasarela, rellano). */
  departamento: string | null;
  /** Línea z del pasillo frente a los muebles, por donde caminan las rutas. */
  pasilloZ: number;
  /** Solo en las salas construidas: costado de la casa en que está el ala. */
  ala?: 'este' | 'oeste';
  /** Sala de la casa con la que comparte puerta. */
  vecina?: string;
  /** Acabado del piso (clave de material). */
  piso?: string;
  /** Revestimiento de los muros. */
  revestimiento?: string;
}

export interface Mueble {
  id: string;
  tipo: string;
  ambiente: string;
  /** Centro en planta. */
  x: number;
  z: number;
  /** Elevación sobre el piso (cuadros, pantallas colgadas); 0 si apoya en el suelo. */
  y: number;
  /** Medidas locales: ancho en x y fondo en z antes de aplicar `giro`. */
  ancho: number;
  fondo: number;
  alto: number;
  giro: number;
  /** Los muebles de un mismo conjunto (escritorio y su silla) pueden tocarse. */
  conjunto: string;
}

export interface Lugar {
  id: string;
  ambiente: string;
  departamento: string | null;
  x: number;
  z: number;
  /** Altura del piso del ambiente. */
  y: number;
  yaw: number;
  asiento: boolean;
  /** Hacia dónde mira: el centro del mueble o la pantalla con la que trabaja. */
  mira: PuntoXZ;
  /** Punto libre al levantarse. */
  salida: PuntoXZ;
  /** Id del mueble en el que se sienta; `null` si trabaja de pie. */
  silla: string | null;
  /** De pie sobrante: se usa cuando un departamento tiene más de 6 personas. */
  extra: boolean;
}

export interface Punto3 {
  x: number;
  y: number;
  z: number;
}

export interface Tramo {
  desde: Punto3;
  hasta: Punto3;
  ancho: number;
}

/** Una escalera: tramos de abajo hacia arriba, cada uno parte donde acaba el anterior. */
export interface Escalera {
  id: string;
  tramos: Tramo[];
}

export interface Vano {
  id: string;
  nivel: Nivel;
  /** Los vanos abren muros de eje x (x = `pos`); `centro` es su z. */
  pos: number;
  centro: number;
  ancho: number;
  entre: [string, string];
}

export interface Muro {
  id: string;
  nivel: Nivel;
  eje: 'x' | 'z';
  /** Coordenada fija: x si el eje es 'x', z si es 'z'. */
  pos: number;
  /** Extensión sobre el otro eje. */
  desde: number;
  hasta: number;
  /** `baranda` mira al vacío del atrio; `borde` es la envolvente exterior. */
  tipo: 'muro' | 'baranda' | 'borde';
  vano: Vano | null;
}

/** Agujero en una losa (la escalera que sube, la hélice del caracol). */
export interface Hueco extends Caja {
  id: string;
  y: number;
}

export interface Zona extends Caja {
  y: number;
}

export interface PuntoLuz extends PuntoXZ {
  ambiente: string;
  yaw: number;
}

const PI = Math.PI;
const LIBRE = 3.6;

function ambiente(
  id: string,
  nombre: string,
  nivel: Nivel,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  departamento: string | null,
  extra: { alto?: number; pasilloZ?: number } = {},
): Ambiente {
  return {
    id,
    nombre,
    nivel,
    y: NIVEL_Y[nivel],
    x0,
    x1,
    z0,
    z1,
    alto: extra.alto ?? LIBRE,
    departamento,
    pasilloZ: extra.pasilloZ ?? 3,
  };
}

const ambientes: Ambiente[] = [
  ambiente('gimnasio', 'Gimnasio', 'piso1', -16, -10, -4, 4, 'personal'),
  ambiente('living', 'Living', 'piso1', -10, -4, -4, 4, 'personal'),
  ambiente('atrio', 'Atrio', 'piso1', -4, 4, -4, 4, null, { alto: 7.5 }),
  ambiente('cocina', 'Cocina', 'piso1', 4, 16, -4, 4, null),
  ambiente('finanzas', 'Finanzas', 'piso2', -16, -4, -4, 4, 'finanzas'),
  ambiente('pasarela', 'Pasarela', 'piso2', -4, 4, -4, -2.5, null, { pasilloZ: -3.25 }),
  ambiente('ventas', 'Sala de reuniones', 'piso2', 4, 16, -4, 4, 'ventas'),
  ambiente('desarrollo', 'Desarrollo', 'piso3', -16, -4, -4, 4, 'desarrollo'),
  ambiente('rellano', 'Rellano', 'piso3', -4, 4, -4, 4, null),
  ambiente('contenido', 'Contenido', 'piso3', 4, 16, -4, 4, 'contenido'),
  ambiente('investigacion', 'Observatorio', 'torre', -4, 4, -4, 2, 'investigacion', {
    pasilloZ: 0.7,
  }),
  ambiente('terraza', 'Terraza', 'piso1', -16, 16, 4, 10, 'personal', { alto: 0 }),
];

const porId = new Map(ambientes.map((a) => [a.id, a]));

/** El ambiente con ese id; lanza si no existe. */
export function ambienteDe(id: string): Ambiente {
  const a = porId.get(id);
  if (!a) throw new Error(`Ambiente desconocido: ${id}`);
  return a;
}

/** Caja en planta de un mueble (los giros son múltiplos de 90°: la caja es exacta). */
export function cajaDe(m: Pick<Mueble, 'x' | 'z' | 'ancho' | 'fondo' | 'giro'>): Caja {
  const girado = Math.abs(Math.sin(m.giro)) > 0.5;
  const hx = (girado ? m.fondo : m.ancho) / 2;
  const hz = (girado ? m.ancho : m.fondo) / 2;
  return { x0: m.x - hx, x1: m.x + hx, z0: m.z - hz, z1: m.z + hz };
}

// --- construcción del mobiliario y de los lugares ---

const muebles: Mueble[] = [];
const lugares: Lugar[] = [];

interface Medidas {
  tipo: string;
  ancho: number;
  fondo: number;
  alto: number;
}

function mueble(
  id: string,
  ambienteId: string,
  m: Medidas,
  x: number,
  z: number,
  giro = 0,
  extra: { y?: number; conjunto?: string } = {},
): Mueble {
  const creado: Mueble = {
    id,
    tipo: m.tipo,
    ambiente: ambienteId,
    x,
    z,
    y: extra.y ?? 0,
    ancho: m.ancho,
    fondo: m.fondo,
    alto: m.alto,
    giro,
    conjunto: extra.conjunto ?? id,
  };
  muebles.push(creado);
  return creado;
}

function lugar(
  ambienteId: string,
  x: number,
  z: number,
  yaw: number,
  mira: PuntoXZ,
  salida: PuntoXZ,
  silla: string | null,
  extra: boolean,
): Lugar {
  const a = ambienteDe(ambienteId);
  const creado: Lugar = {
    id: `${ambienteId}-${lugares.filter((l) => l.ambiente === ambienteId).length + 1}`,
    ambiente: ambienteId,
    departamento: a.departamento,
    x,
    z,
    y: a.y,
    yaw,
    asiento: silla !== null,
    mira,
    salida,
    silla,
    extra,
  };
  lugares.push(creado);
  return creado;
}

const SILLA_MALLA: Medidas = { tipo: 'silla-malla', ancho: 0.5, fondo: 0.5, alto: 0.9 };
const SILLA_MADERA: Medidas = { tipo: 'silla-madera', ancho: 0.5, fondo: 0.5, alto: 0.9 };
/** Distancia (m) desde el centro de la silla hasta el punto libre al levantarse. */
const SALIDA_SILLA = 0.75;

interface Columna {
  /** x del centro de la silla. */
  cx: number;
  /** Lado del escritorio respecto de la silla: +1 al este (la persona mira a +x), -1 al oeste. */
  s: 1 | -1;
}

/**
 * Estaciones de trabajo en filas y columnas: una silla con su escritorio al costado (la persona
 * queda de perfil a la cámara) y el carril libre hacia el pasillo por el lado opuesto.
 */
function estaciones(
  ambienteId: string,
  silla: Medidas,
  escritorios: readonly [Medidas, Medidas],
  columnas: readonly Columna[],
  filas: readonly [number, number],
): void {
  let n = 0;
  filas.forEach((cz, fila) => {
    const escritorio = escritorios[fila] as Medidas;
    for (const { cx, s } of columnas) {
      n++;
      const conjunto = `${ambienteId}-e${n}`;
      const separacion = escritorio.fondo / 2 + 0.35;
      mueble(`${conjunto}-silla`, ambienteId, silla, cx, cz, s * (PI / 2), { conjunto });
      const mesa = mueble(
        `${conjunto}-escritorio`,
        ambienteId,
        escritorio,
        cx + s * separacion,
        cz,
        -s * (PI / 2),
        {
          conjunto,
        },
      );
      lugar(
        ambienteId,
        cx,
        cz,
        s * (PI / 2),
        { x: mesa.x, z: mesa.z },
        { x: cx - s * SALIDA_SILLA, z: cz },
        `${conjunto}-silla`,
        false,
      );
    }
  });
}

/** De pie sobrantes: pares que se miran, a `z`, con su salida a medio camino del pasillo. */
function extrasEnPares(ambienteId: string, z: number, xs: readonly number[]): void {
  const pasillo = ambienteDe(ambienteId).pasilloZ;
  xs.forEach((x, i) => {
    const yaw = i % 2 === 0 ? PI / 2 : -PI / 2;
    const compania = xs[i % 2 === 0 ? i + 1 : i - 1] ?? x;
    lugar(
      ambienteId,
      x,
      z,
      yaw,
      { x: compania, z },
      { x, z: z + Math.sign(pasillo - z) * 0.5 },
      null,
      true,
    );
  });
}

const ESCRITORIO_NOGAL: Medidas = { tipo: 'escritorio-nogal', ancho: 1.4, fondo: 0.7, alto: 0.74 };
const FILAS: readonly [number, number] = [-2, 0.4];

// Desarrollo (piso 3, oeste): estudio con muro de pantallas.
mueble(
  'desarrollo-videowall',
  'desarrollo',
  { tipo: 'videowall', ancho: 6, fondo: 0.2, alto: 2.4 },
  -10,
  -3.9,
  0,
  {
    y: 0.7,
  },
);
estaciones(
  'desarrollo',
  SILLA_MALLA,
  [ESCRITORIO_NOGAL, ESCRITORIO_NOGAL],
  [
    { cx: -14.1, s: 1 },
    { cx: -9.3, s: -1 },
    { cx: -6.6, s: 1 },
  ],
  FILAS,
);
extrasEnPares('desarrollo', 2.1, [-13, -12, -8, -7]);

// Contenido (piso 3, este): estudio de grabación con aro de luz.
const MESA_MEZCLA: Medidas = { tipo: 'mesa-mezcla', ancho: 1.4, fondo: 0.8, alto: 0.95 };
for (let i = 0; i < 3; i++) {
  mueble(
    `contenido-panel-${i + 1}`,
    'contenido',
    { tipo: 'panel-acustico', ancho: 2.4, fondo: 0.2, alto: 2.4 },
    6.2 + i * 2.8,
    -3.9,
    0,
    {
      conjunto: 'contenido-muro',
    },
  );
}
mueble(
  'contenido-neon',
  'contenido',
  { tipo: 'letrero-neon', ancho: 1.8, fondo: 0.1, alto: 0.6 },
  14,
  -3.95,
  0,
  {
    y: 1.8,
    conjunto: 'contenido-muro',
  },
);
estaciones(
  'contenido',
  SILLA_MALLA,
  [MESA_MEZCLA, ESCRITORIO_NOGAL],
  [
    { cx: 5.9, s: 1 },
    { cx: 9.4, s: -1 },
    { cx: 12, s: 1 },
  ],
  FILAS,
);
mueble(
  'contenido-aro-luz',
  'contenido',
  { tipo: 'aro-luz', ancho: 0.6, fondo: 0.6, alto: 1.9 },
  14.9,
  -1.8,
  0,
  {
    conjunto: 'contenido-set',
  },
);
mueble(
  'contenido-camara',
  'contenido',
  { tipo: 'camara-tripode', ancho: 0.7, fondo: 0.7, alto: 1.6 },
  14.9,
  0.5,
  0,
  {
    conjunto: 'contenido-set',
  },
);
extrasEnPares('contenido', 2.1, [7, 8, 11, 12]);

// Finanzas (piso 2, oeste): biblioteca con bóveda.
mueble(
  'finanzas-boveda',
  'finanzas',
  { tipo: 'boveda', ancho: 2.2, fondo: 1.4, alto: 2.2 },
  -15.3,
  -2.9,
  PI / 2,
  {
    conjunto: 'finanzas-boveda',
  },
);
for (let i = 0; i < 3; i++) {
  mueble(
    `finanzas-librero-${i + 1}`,
    'finanzas',
    { tipo: 'librero', ancho: 2.6, fondo: 0.4, alto: 3 },
    -12.4 + i * 2.6,
    -3.8,
    0,
    {
      conjunto: 'finanzas-muro',
    },
  );
}
mueble(
  'finanzas-librero-4',
  'finanzas',
  { tipo: 'librero', ancho: 2.6, fondo: 0.4, alto: 3 },
  -15.8,
  0.5,
  PI / 2,
  {
    conjunto: 'finanzas-muro',
  },
);
estaciones(
  'finanzas',
  SILLA_MADERA,
  [
    { tipo: 'mesa-lectura', ancho: 1.6, fondo: 0.8, alto: 0.75 },
    { tipo: 'mesa-lectura', ancho: 1.6, fondo: 0.8, alto: 0.75 },
  ],
  [
    { cx: -12.9, s: 1 },
    { cx: -9.1, s: -1 },
    { cx: -7.1, s: 1 },
  ],
  [-1.9, 0.6],
);
extrasEnPares('finanzas', 2.1, [-11, -10, -9.4, -8.4]);

// Sala de reuniones (piso 2, este; id «ventas» por su origen): sillones de cuero alrededor de una mesa de mármol.
mueble(
  'ventas-mesa',
  'ventas',
  { tipo: 'mesa-marmol', ancho: 3.6, fondo: 1.2, alto: 0.75 },
  10,
  -0.5,
  PI / 2,
  {
    conjunto: 'ventas-salon',
  },
);
const SILLON: Medidas = { tipo: 'sillon-cuero', ancho: 0.9, fondo: 0.9, alto: 0.85 };
[-1.9, -0.5, 0.9].forEach((z, i) => {
  for (const [lado, cx, s] of [
    ['o', 8, 1],
    ['e', 12, -1],
  ] as const) {
    const id = `ventas-sillon-${lado}${i + 1}`;
    mueble(id, 'ventas', SILLON, cx, z, s * (PI / 2), { conjunto: 'ventas-salon' });
    lugar(
      'ventas',
      cx,
      z,
      s * (PI / 2),
      { x: 10, z: -0.5 },
      { x: cx - s * SALIDA_SILLA, z },
      id,
      false,
    );
  }
});
mueble(
  'ventas-pantalla',
  'ventas',
  { tipo: 'pantalla-pipeline', ancho: 4.8, fondo: 0.2, alto: 2.4 },
  10,
  -3.9,
  0,
  {
    y: 0.6,
    conjunto: 'ventas-muro',
  },
);
mueble(
  'ventas-carro-bar',
  'ventas',
  { tipo: 'carro-bar', ancho: 1.2, fondo: 0.5, alto: 1 },
  14.8,
  -2.5,
  PI / 2,
  {
    conjunto: 'ventas-bar',
  },
);
extrasEnPares('ventas', 2.1, [7, 8, 13, 14]);

// Investigación (torre): observatorio con mesas de cartas celestes y un telescopio refractor.
const MESA_CARTAS: Medidas = { tipo: 'mesa-cartas', ancho: 1.3, fondo: 0.9, alto: 0.75 };
estaciones(
  'investigacion',
  SILLA_MADERA,
  [MESA_CARTAS, MESA_CARTAS],
  [
    { cx: -2.55, s: -1 },
    { cx: -1.15, s: 1 },
    { cx: 1.25, s: 1 },
  ],
  [-3.2, -0.95],
);
mueble(
  'investigacion-telescopio',
  'investigacion',
  { tipo: 'telescopio', ancho: 1, fondo: 0.8, alto: 1.8 },
  -0.2,
  1.6,
);
extrasEnPares('investigacion', 1.5, [-3.3, -2.3, -1.4, 0.9]);

// Personal, gimnasio (piso 1, oeste): lugares de pie junto a las máquinas.
const MAQUINA: Medidas = { tipo: 'maquina-gimnasio', ancho: 1.2, fondo: 0.9, alto: 1.6 };
mueble('gimnasio-maquina-1', 'gimnasio', MAQUINA, -15.4, -2.2, PI / 2);
mueble('gimnasio-maquina-2', 'gimnasio', MAQUINA, -15.4, 0.2, PI / 2);
mueble(
  'gimnasio-banco',
  'gimnasio',
  { tipo: 'banco-pesas', ancho: 1.4, fondo: 0.6, alto: 0.5 },
  -12.5,
  -2,
  PI / 2,
);
mueble(
  'gimnasio-rack',
  'gimnasio',
  { tipo: 'rack-mancuernas', ancho: 1.8, fondo: 0.4, alto: 0.9 },
  -10.3,
  -2,
  -PI / 2,
);
mueble(
  'gimnasio-espejo',
  'gimnasio',
  { tipo: 'espejo-gimnasio', ancho: 5, fondo: 0.05, alto: 2.2 },
  -13,
  -3.95,
  0,
  {
    y: 0.3,
    conjunto: 'gimnasio-muro',
  },
);
lugar('gimnasio', -14.3, -2.2, -PI / 2, { x: -15.4, z: -2.2 }, { x: -14.3, z: -1.6 }, null, false);
lugar('gimnasio', -14.3, 0.2, -PI / 2, { x: -15.4, z: 0.2 }, { x: -14.3, z: 0.8 }, null, false);
lugar('gimnasio', -11.5, -2, -PI / 2, { x: -12.5, z: -2 }, { x: -11.5, z: -1.4 }, null, false);

// Personal, living (piso 1): chimenea lineal en el muro oeste y sofá modular frente a ella.
mueble(
  'living-chimenea',
  'living',
  { tipo: 'chimenea', ancho: 3, fondo: 0.4, alto: 1.2 },
  -9.8,
  -0.5,
  PI / 2,
  {
    conjunto: 'living-estar',
  },
);
mueble(
  'living-mesa-centro',
  'living',
  { tipo: 'mesa-centro', ancho: 1.6, fondo: 0.9, alto: 0.4 },
  -8.4,
  -0.5,
  PI / 2,
  {
    conjunto: 'living-estar',
  },
);
mueble(
  'living-sofa',
  'living',
  { tipo: 'sofa-modular', ancho: 3, fondo: 0.95, alto: 0.8 },
  -6.9,
  -0.5,
  -PI / 2,
  {
    conjunto: 'living-estar',
  },
);
for (const z of [-1.5, -0.5, 0.5]) {
  lugar('living', -6.9, z, -PI / 2, { x: -9.8, z: -0.5 }, { x: -6, z }, 'living-sofa', false);
}
extrasEnPares('gimnasio', 2.1, [-13.4, -12.4]);
extrasEnPares('living', 2.1, [-8.6, -7.6]);

// Atrio (piso 1): espejo de agua bajo Jules; lugares de pie a los lados para quien no tiene departamento.
mueble('atrio-espejo', 'atrio', { tipo: 'espejo-agua', ancho: 3.4, fondo: 3.4, alto: 0.1 }, 0, 0);
for (const [x, yaw] of [
  [-2.2, PI / 2],
  [2.2, -PI / 2],
] as const) {
  for (const z of [-1.2, 0, 1.2]) {
    lugar('atrio', x, z, yaw, { x: 0, z }, { x, z: z + 1 }, null, false);
  }
}

// Cocina (piso 1, este): isla de mármol y barra de café, común a toda la casa.
const BARRA: Medidas = { tipo: 'barra-cafe', ancho: 4.4, fondo: 0.6, alto: 1.05 };
mueble(
  'cocina-isla',
  'cocina',
  { tipo: 'isla-cocina', ancho: 3, fondo: 1.1, alto: 0.92 },
  8.5,
  -0.8,
  0,
  {
    conjunto: 'cocina-isla',
  },
);
for (let i = 0; i < 3; i++) {
  mueble(
    `cocina-taburete-${i + 1}`,
    'cocina',
    { tipo: 'taburete', ancho: 0.4, fondo: 0.4, alto: 0.65 },
    7.6 + i * 0.9,
    0,
    0,
    {
      conjunto: 'cocina-isla',
    },
  );
}
mueble(
  'cocina-muebles',
  'cocina',
  { tipo: 'mueble-cocina', ancho: 8, fondo: 0.7, alto: 0.9 },
  10,
  -3.65,
  0,
  {
    conjunto: 'cocina-muro',
  },
);
mueble('cocina-barra', 'cocina', BARRA, 15.4, -0.5, -PI / 2);

// Terraza (exterior): dos pares de reposeras sobre el deck oeste (x -16..-12,6), fuera del
// agua, con el respaldo hacia la casa y los pies hacia el valle. Son un solo conjunto: van juntas.
[5.4, 7.9].forEach((z, fila) => {
  [-15.1, -13.9].forEach((x, i) => {
    mueble(
      `terraza-reposera-${fila * 2 + i + 1}`,
      'terraza',
      { tipo: 'reposera', ancho: 0.7, fondo: 1.9, alto: 0.4 },
      x,
      z,
      0,
      { conjunto: 'terraza-solario' },
    );
  });
});

/**
 * Puntos de pausa en la barra de café: 3 grupos de 4 (2 filas de 2) a menos de 1,2 m entre sí,
 * para que quienes coinciden conversen (`DISTANCIA_CONVERSACION`). Cada departamento usa un
 * grupo; la persona `n` del departamento, el punto `n % 4` del grupo.
 */
const cafe: PuntoXZ[] = [-2.2, -0.7, 0.8].flatMap((z0) => [
  { x: 14.6, z: z0 },
  { x: 14, z: z0 },
  { x: 14.6, z: z0 + 0.7 },
  { x: 14, z: z0 + 0.7 },
]);

const aro = muebles.find((m) => m.tipo === 'aro-luz');
/** Dónde se para quien prueba la luz: frente al aro, que mira hacia el oeste. */
const luz: PuntoLuz | null = aro
  ? { ambiente: aro.ambiente, x: aro.x - 1, z: aro.z, yaw: PI / 2 }
  : null;

// --- muros, vanos, escaleras y huecos ---

const vanos: Vano[] = [];
const muros: Muro[] = [];

function muroX(
  nivel: Nivel,
  pos: number,
  desde: number,
  hasta: number,
  tipo: Muro['tipo'],
  vano?: { centro: number; entre: [string, string] },
): void {
  const v: Vano | null = vano
    ? {
        id: `vano-${vano.entre[0]}-${vano.entre[1]}`,
        nivel,
        pos,
        centro: vano.centro,
        ancho: ANCHO_VANO,
        entre: vano.entre,
      }
    : null;
  if (v) vanos.push(v);
  muros.push({
    id: `muro-${nivel}-x${pos}-${desde}`,
    nivel,
    eje: 'x',
    pos,
    desde,
    hasta,
    tipo,
    vano: v,
  });
}

function muroFondo(nivel: Nivel, x0: number, x1: number): void {
  muros.push({
    id: `muro-${nivel}-fondo`,
    nivel,
    eje: 'z',
    pos: -4,
    desde: x0,
    hasta: x1,
    tipo: 'borde',
    vano: null,
  });
}

// Piso 1
muroX('piso1', -16, -4, 4, 'borde');
muroX('piso1', -10, -4, 4, 'muro', { centro: 3, entre: ['gimnasio', 'living'] });
muroX('piso1', -4, -4, 4, 'muro', { centro: 3, entre: ['living', 'atrio'] });
muroX('piso1', 4, -4, 4, 'muro', { centro: 3, entre: ['atrio', 'cocina'] });
muroX('piso1', 16, -4, 4, 'borde');
muroFondo('piso1', -16, 16);
// Piso 2: el atrio es un vacío; solo la pasarela une el oeste con el este.
muroX('piso2', -16, -4, 4, 'borde');
muroX('piso2', -4, -4, -2.5, 'muro', { centro: -3.25, entre: ['finanzas', 'pasarela'] });
muroX('piso2', -4, -2.5, 4, 'baranda');
muroX('piso2', 4, -4, -2.5, 'muro', { centro: -3.25, entre: ['pasarela', 'ventas'] });
muroX('piso2', 4, -2.5, 4, 'baranda');
muroX('piso2', 16, -4, 4, 'borde');
muroFondo('piso2', -16, 16);
// Piso 3
muroX('piso3', -16, -4, 4, 'borde');
muroX('piso3', -4, -4, 4, 'muro', { centro: 3, entre: ['desarrollo', 'rellano'] });
muroX('piso3', 4, -4, 4, 'muro', { centro: 3, entre: ['rellano', 'contenido'] });
muroX('piso3', 16, -4, 4, 'borde');
muroFondo('piso3', -16, 16);
// Torre
muroX('torre', -4, -4, 2, 'borde');
muroX('torre', 4, -4, 2, 'borde');
muroFondo('torre', -4, 4);

const ANCHO_ESCALERA = 1.2;

/** Hélice del caracol: centro, radio y ángulos de cada vértice (de abajo hacia arriba, en vueltas de 90°). */
const CARACOL = { x: 2.8, z: 0.7, radio: 0.8 };

function tramosCaracol(): Tramo[] {
  const puntos = Array.from({ length: 7 }, (_, k): Punto3 => {
    const angulo = (-k * PI) / 2;
    return {
      x: CARACOL.x + Math.cos(angulo) * CARACOL.radio,
      y: NIVEL_Y.piso3 + ((NIVEL_Y.torre - NIVEL_Y.piso3) * k) / 6,
      z: CARACOL.z + Math.sin(angulo) * CARACOL.radio,
    };
  });
  return puntos.slice(1).map((hasta, i) => ({ desde: puntos[i] as Punto3, hasta, ancho: 0.9 }));
}

const escaleras: Escalera[] = [
  // La escultórica del atrio, del lado este: del piso 1 a la pasarela del piso 2.
  {
    id: 'escultorica-1-2',
    tramos: [
      {
        desde: { x: 3.2, y: 0, z: 2.6 },
        hasta: { x: 3.2, y: NIVEL_Y.piso2, z: -2.6 },
        ancho: ANCHO_ESCALERA,
      },
    ],
  },
  // Del lado oeste: de la pasarela al rellano del piso 3, por un hueco en su losa.
  {
    id: 'escultorica-2-3',
    tramos: [
      {
        desde: { x: -3.2, y: NIVEL_Y.piso2, z: -2.6 },
        hasta: { x: -3.2, y: NIVEL_Y.piso3, z: 2.6 },
        ancho: ANCHO_ESCALERA,
      },
    ],
  },
  // De caracol, del rellano a la torre: seis cuartos de vuelta.
  { id: 'caracol', tramos: tramosCaracol() },
];

const huecos: Hueco[] = [
  { id: 'hueco-escultorica-2-3', y: NIVEL_Y.piso3, x0: -3.8, x1: -2.6, z0: -0.6, z1: 2.6 },
  {
    id: 'hueco-caracol',
    y: NIVEL_Y.torre,
    x0: CARACOL.x - CARACOL.radio,
    x1: CARACOL.x + CARACOL.radio + 0.15,
    z0: CARACOL.z - CARACOL.radio - 0.15,
    z1: CARACOL.z + CARACOL.radio + 0.15,
  },
];

export interface DetallePlanta extends PuntoXZ {
  ambiente: string;
  radio: number;
  tipo: string;
  maceta: string;
}

/** Una sala construida, ya calculada y validada por el servidor (`servidor/obras.mjs`). */
export interface PlantaAla {
  sala: string;
  ambiente: Ambiente;
  muebles: Mueble[];
  lugares: Lugar[];
  muroExterior: Muro;
  muroFondo: Muro;
  puerta: Vano;
  planta: DetallePlanta;
}

export const plano = {
  ambientes,
  muebles,
  lugares,
  vanos,
  muros,
  escaleras,
  huecos,
  cafe,
  luz,
  /** Dónde reposa Jules: sobre el espejo de agua del atrio. */
  jules: { x: 0, y: 3.2, z: 0 } as Punto3,
  /** Lámina de agua de la piscina, delante del primer piso. */
  piscina: { x0: -12, x1: 12, z0: 4.8, z1: 8.8, y: -0.05 } as Zona,
};

// --- salas construidas ---

const BASE = {
  ambientes: ambientes.length,
  muebles: muebles.length,
  lugares: lugares.length,
  vanos: vanos.length,
  muros: muros.length,
};

let alas: readonly PlantaAla[] = [];
let huellaAlas = '[]';
let version = 0;

/** Cambia cada vez que la casa gana o pierde una sala; 0 es la casa tal como viene. */
export const versionPlano = (): number => version;

/** Las salas construidas que hay ahora. */
export const alasConstruidas = (): readonly PlantaAla[] => alas;

/** Muro de costado de la casa que se abre para dar paso a un ala. */
const muroDeCostado = (v: Vano): Muro | undefined =>
  muros.find((m) => m.nivel === v.nivel && m.eje === 'x' && m.pos === v.pos && m.tipo === 'borde');

/**
 * Pone en la casa las salas construidas. Modifica las listas en su sitio porque todo el código las
 * lee de `plano`; lo de la casa original nunca cambia de posición, así que quitar las salas la deja
 * exactamente como estaba. Si nada cambió no hace nada, y no sube `versionPlano`.
 */
export function aplicarAlas(nuevas: readonly PlantaAla[]): void {
  const huella = JSON.stringify(nuevas);
  if (huella === huellaAlas) return;
  for (const a of alas) {
    const muro = muroDeCostado(a.puerta);
    if (muro) muro.vano = null;
    porId.delete(a.ambiente.id);
  }
  ambientes.length = BASE.ambientes;
  muebles.length = BASE.muebles;
  lugares.length = BASE.lugares;
  vanos.length = BASE.vanos;
  muros.length = BASE.muros;
  for (const a of nuevas) {
    ambientes.push(a.ambiente);
    porId.set(a.ambiente.id, a.ambiente);
    muebles.push(...a.muebles);
    lugares.push(...a.lugares);
    vanos.push(a.puerta);
    muros.push(a.muroExterior, a.muroFondo);
    const muro = muroDeCostado(a.puerta);
    if (muro) muro.vano = a.puerta;
  }
  alas = nuevas;
  huellaAlas = huella;
  version++;
}

let obrasEnSitio: readonly { x0: number; x1: number }[] = [];
let versionVista = 0;

/** Cambia cuando empieza o termina una obra: la cámara debe abrirse para que quepan los andamios. */
export const versionEncuadre = (): number => versionVista;

/** Las salas que se están levantando. No cambian el plano, solo lo que tiene que caber en la vista. */
export function marcarObras(obras: readonly { x0: number; x1: number }[]): void {
  const medida = (l: readonly { x0: number; x1: number }[]) => l.map((o) => `${o.x0},${o.x1}`).join(';');
  if (medida(obras) === medida(obrasEnSitio)) return;
  obrasEnSitio = obras;
  versionVista++;
}

/** Hasta dónde llega la casa de oeste a este, sin contar los muros del ala. */
export function extensionCasa(): { x0: number; x1: number } {
  return {
    x0: Math.min(-16, ...alas.map((a) => a.ambiente.x0), ...obrasEnSitio.map((o) => o.x0)),
    x1: Math.max(16, ...alas.map((a) => a.ambiente.x1), ...obrasEnSitio.map((o) => o.x1)),
  };
}

/**
 * Los lugares de un departamento: primero los 6 de base y luego los de pie sobrantes. Un id
 * que ninguna parte de la casa reconoce cae en el atrio.
 */
export function lugaresDe(departamento: string): Lugar[] {
  const propios = lugares.filter((l) => l.departamento === departamento);
  const lista = propios.length > 0 ? propios : lugares.filter((l) => l.ambiente === 'atrio');
  return [...lista.filter((l) => !l.extra), ...lista.filter((l) => l.extra)];
}

/** Altura del piso más alto que queda al menos 0,5 m por debajo de `y` (0 si no hay ninguno). */
export function sueloBajo(y: number): number {
  return Math.max(0, ...Object.values(NIVEL_Y).filter((nivel) => nivel <= y - 0.5));
}
