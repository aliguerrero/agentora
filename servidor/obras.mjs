// Obras de la casa: salas nuevas en las alas laterales. Una obra es un plano en datos, no código:
// quien la pide elige sitio, tamaño, estilo y puestos de un catálogo, y aquí se calcula dónde va
// cada mueble. Las coordenadas nunca vienen de fuera, así que un plano no puede romper la casa ni
// salirse del estilo aunque quien lo pide no siga las reglas.
//
// Guardado en config/obras.json (los agentes no leen config/ y no entra en el paquete), con la
// copia anterior en config/obras.previo.json para deshacer un paso.
//
// Sin dependencias de la casa: el servidor debe arrancar en Node 22, que no lee TypeScript. Las
// pruebas comprueban contra plano.ts que las medidas y los tipos de mueble coinciden.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PI = Math.PI;
const NIVEL_Y = { piso1: 0, piso2: 3.9, piso3: 7.8 };
const ALTO_LIBRE = 3.6;
/** Cara exterior de los muros de los costados de la casa; ahí empieza cada ala. */
const BORDE_CASA = 16.2;
const Z_FONDO = -4;
const Z_FRENTE = 4;
const PASILLO_Z = 3;
const ANCHO_VANO = 1.2;
/** Distancia del muro al eje de las sillas de cada columna: deja un carril para levantarse. */
const EJE_COLUMNA = 1.15;
const SALIDA_SILLA = 0.75;
const Z_EXTRAS = 2.3;
/** Holgura mínima (m) entre el recorrido de una persona y un mueble. */
const HOLGURA = 0.25;

/** La sala de la casa con la que comparte puerta cada ala, por nivel. */
const VECINA = {
  este: { piso1: 'cocina', piso2: 'ventas', piso3: 'contenido' },
  oeste: { piso1: 'gimnasio', piso2: 'finanzas', piso3: 'desarrollo' },
};
const NOMBRE_NIVEL = { piso1: 'piso 1', piso2: 'piso 2', piso3: 'piso 3' };

/** Los únicos sitios donde se puede construir: un ala por costado y piso. */
export const SITIOS = Object.fromEntries(
  ['este', 'oeste'].flatMap((lado) =>
    ['piso1', 'piso2', 'piso3'].map((nivel) => [`${lado}-${nivel}`, { lado, nivel, sala: `ala-${lado}-${nivel}`, vecina: VECINA[lado][nivel], nombre: `Ala ${lado}, ${NOMBRE_NIVEL[nivel]}` }]),
  ),
);
/** Una sala por sitio: 6 en total, lo que decidió el titular para empezar. */
export const MAX_SALAS = Object.keys(SITIOS).length;

export const TAMANOS = {
  S: { nombre: 'Pequeña', ancho: 5, puestos: 4, filas: [-2, 0.4], extras: 2 },
  M: { nombre: 'Mediana', ancho: 5.2, puestos: 6, filas: [-2.7, -0.8, 1.1], extras: 2 },
  L: { nombre: 'Grande', ancho: 5.4, puestos: 6, filas: [-2.7, -0.8, 1.1], extras: 4 },
};

const SILLA_MALLA = { tipo: 'silla-malla', ancho: 0.5, fondo: 0.5, alto: 0.9 };
const SILLA_MADERA = { tipo: 'silla-madera', ancho: 0.5, fondo: 0.5, alto: 0.9 };

/** Estilos: el mobiliario, el piso y el muro van juntos para que la sala parezca de la casa. */
export const ESTILOS = {
  oficina: { nombre: 'Oficina', silla: SILLA_MALLA, mesa: { tipo: 'escritorio-nogal', ancho: 1.4, fondo: 0.7, alto: 0.74 }, piso: 'pulido', revestimiento: 'tinta' },
  biblioteca: { nombre: 'Biblioteca', silla: SILLA_MADERA, mesa: { tipo: 'mesa-lectura', ancho: 1.6, fondo: 0.8, alto: 0.75 }, piso: 'parquet', revestimiento: 'nogal' },
  estudio: { nombre: 'Estudio', silla: SILLA_MALLA, mesa: { tipo: 'mesa-mezcla', ancho: 1.4, fondo: 0.8, alto: 0.95 }, piso: 'parquet', revestimiento: 'fieltro' },
  cartas: { nombre: 'Sala de cartas', silla: SILLA_MADERA, mesa: { tipo: 'mesa-cartas', ancho: 1.3, fondo: 0.9, alto: 0.75 }, piso: 'marmol', revestimiento: 'nogal' },
};

/** Lo que puede llevar el muro del fondo. Son muebles que la casa ya sabe dibujar. */
export const MUROS = {
  ninguno: { nombre: 'Nada' },
  videowall: { nombre: 'Muro de pantallas', tipo: 'videowall', fondo: 0.2, alto: 2.4, y: 0.7, z: -3.9 },
  pipeline: { nombre: 'Pantalla de seguimiento', tipo: 'pantalla-pipeline', fondo: 0.2, alto: 2.4, y: 0.6, z: -3.9 },
  paneles: { nombre: 'Paneles acústicos', tipo: 'panel-acustico', fondo: 0.2, alto: 2.4, y: 0, z: -3.9 },
  libreros: { nombre: 'Libreros', tipo: 'librero', fondo: 0.4, alto: 3, y: 0, z: -3.8 },
  neon: { nombre: 'Letrero de neón', tipo: 'letrero-neon', fondo: 0.1, alto: 0.6, y: 1.8, z: -3.95, ancho: 1.8 },
};

export const ESTADOS = ['propuesta', 'aprobada', 'en-construccion', 'terminada', 'rechazada', 'demolida'];
/** Estados en que la obra ocupa su sitio. */
const OCUPAN = new Set(['aprobada', 'en-construccion', 'terminada']);

/** Lo que tarda en levantarse una sala una vez aprobada. */
export const DURACION_OBRA_MS = 60_000;

const DEPTO = /^[a-z0-9-]{1,60}$/;
// Sin signos que puedan pasar por marcado ni caracteres de control: el nombre va en carteles y lo
// leen los agentes.
const NOMBRE = /^[\p{L}\p{N}][\p{L}\p{N} .,'&()-]{0,39}$/u;

const r3 = (n) => Math.round(n * 1000) / 1000;

const cajaDe = (m) => {
  const girado = Math.abs(Math.sin(m.giro)) > 0.5;
  const hx = (girado ? m.fondo : m.ancho) / 2;
  const hz = (girado ? m.ancho : m.fondo) / 2;
  return { x0: m.x - hx, x1: m.x + hx, z0: m.z - hz, z1: m.z + hz };
};

/** Calcula la sala completa a partir de un plano ya validado: lo único que recibe la casa. */
export function plantaDe(obra) {
  const sitio = SITIOS[obra.sitio];
  const tam = TAMANOS[obra.tamano];
  const estilo = ESTILOS[obra.estilo];
  const muroFondo = MUROS[obra.muro];
  const lado = sitio.lado === 'este' ? 1 : -1;
  const id = sitio.sala;
  const y = NIVEL_Y[sitio.nivel];
  const W = tam.ancho;
  // u es la distancia al muro de la casa; así las dos alas son espejo una de la otra.
  const aX = (u) => r3(lado * (BORDE_CASA + u));
  const x0 = Math.min(aX(0), aX(W));
  const x1 = Math.max(aX(0), aX(W));
  const muebles = [];
  const lugares = [];
  const mueble = (mid, m, x, z, giro = 0, extra = {}) => {
    const creado = { id: mid, tipo: m.tipo, ambiente: id, x, z, y: extra.y ?? 0, ancho: m.ancho, fondo: m.fondo, alto: m.alto, giro, conjunto: extra.conjunto ?? mid };
    muebles.push(creado);
    return creado;
  };
  const lugar = (x, z, yaw, mira, salida, silla, extra) => {
    lugares.push({ id: `${id}-${lugares.length + 1}`, ambiente: id, departamento: id, x, z, y, yaw, asiento: silla !== null, mira, salida, silla, extra });
  };

  // Muro del fondo.
  if (muroFondo.tipo) {
    const util = W - 0.8;
    if (muroFondo.tipo === 'librero') {
      const n = Math.floor(util / 2.2);
      const ancho = r3(util / n);
      for (let i = 0; i < n; i++) mueble(`${id}-fondo-${i + 1}`, { tipo: 'librero', ancho, fondo: muroFondo.fondo, alto: muroFondo.alto }, aX(0.4 + ancho * (i + 0.5)), muroFondo.z, 0, { conjunto: `${id}-fondo` });
    } else {
      const ancho = muroFondo.ancho ?? r3(util);
      mueble(`${id}-fondo-1`, { tipo: muroFondo.tipo, ancho, fondo: muroFondo.fondo, alto: muroFondo.alto }, aX(W / 2), muroFondo.z, 0, { y: muroFondo.y, conjunto: `${id}-fondo` });
    }
  }

  // Puestos: dos columnas con las mesas al centro y el carril de cada una junto a su muro.
  const columnas = [
    { u: EJE_COLUMNA, s: lado },
    { u: W - EJE_COLUMNA, s: -lado },
  ];
  const separacion = estilo.mesa.fondo / 2 + 0.35;
  let n = 0;
  for (const cz of tam.filas) {
    for (const { u, s } of columnas) {
      if (n >= obra.puestos) break;
      n++;
      const conjunto = `${id}-e${n}`;
      const cx = aX(u);
      mueble(`${conjunto}-silla`, estilo.silla, cx, cz, (s * PI) / 2, { conjunto });
      const mesa = mueble(`${conjunto}-mesa`, estilo.mesa, r3(cx + s * separacion), cz, (-s * PI) / 2, { conjunto });
      lugar(cx, cz, (s * PI) / 2, { x: mesa.x, z: mesa.z }, { x: r3(cx - s * SALIDA_SILLA), z: cz }, `${conjunto}-silla`, false);
    }
  }

  // De pie, para quien no cabe sentado: pares que se miran, delante del pasillo.
  const usExtras = tam.extras === 4 ? [1.2, 2.1, W - 2.1, W - 1.2] : [W / 2 - 0.45, W / 2 + 0.45];
  const xs = usExtras.map(aX).sort((a, b) => a - b);
  xs.forEach((x, i) => {
    const yaw = i % 2 === 0 ? PI / 2 : -PI / 2;
    const compania = xs[i % 2 === 0 ? i + 1 : i - 1];
    lugar(x, Z_EXTRAS, yaw, { x: compania, z: Z_EXTRAS }, { x, z: Z_EXTRAS + 0.5 }, null, true);
  });

  return {
    sala: id,
    obra: obra.id ?? null,
    ambiente: {
      id,
      nombre: obra.nombre,
      nivel: sitio.nivel,
      y,
      x0,
      x1,
      z0: Z_FONDO,
      z1: Z_FRENTE,
      alto: ALTO_LIBRE,
      departamento: id,
      pasilloZ: PASILLO_Z,
      ala: sitio.lado,
      vecina: sitio.vecina,
      piso: estilo.piso,
      revestimiento: estilo.revestimiento,
    },
    muebles,
    lugares,
    // Lo que falta para cerrar el ala: su muro exterior, su vidrio del fondo y la puerta a la casa.
    muroExterior: { id: `muro-${id}-exterior`, nivel: sitio.nivel, eje: 'x', pos: lado > 0 ? x1 : x0, desde: Z_FONDO, hasta: Z_FRENTE, tipo: 'borde', vano: null },
    muroFondo: { id: `muro-${id}-fondo`, nivel: sitio.nivel, eje: 'z', pos: Z_FONDO, desde: x0, hasta: x1, tipo: 'borde', vano: null },
    puerta: { id: `vano-${id}`, nivel: sitio.nivel, pos: lado * 16, centro: PASILLO_Z, ancho: ANCHO_VANO, entre: [sitio.vecina, id] },
    planta: { ambiente: id, x: aX(W - 0.38), z: -3.4, radio: 0.25, tipo: obra.estilo === 'oficina' ? 'sansevieria' : 'ficus', maceta: '#e9e4da' },
  };
}

/**
 * Comprueba lo que se calculó: muebles dentro de la sala y sin chocar, y que todos puedan levantarse,
 * llegar al pasillo y salir por la puerta. Devuelve la lista de problemas.
 */
export function comprobarPlanta(p) {
  const problemas = [];
  const a = p.ambiente;
  const cajas = p.muebles.map((m) => ({ m, c: cajaDe(m) }));
  const E = 1e-6;
  for (const { m, c } of cajas) {
    if (c.x0 < a.x0 - E || c.x1 > a.x1 + E || c.z0 < a.z0 - E || c.z1 > a.z1 + E) problemas.push(`${m.id} se sale de la sala`);
  }
  cajas.forEach(({ m, c }, i) => {
    for (const { m: o, c: d } of cajas.slice(i + 1)) {
      if (m.conjunto === o.conjunto) continue;
      if (c.x0 < d.x1 - E && c.x1 > d.x0 + E && c.z0 < d.z1 - E && c.z1 > d.z0 + E) problemas.push(`${m.id} choca con ${o.id}`);
    }
  });
  const tapa = (x0, x1, z0, z1, ignorar) =>
    cajas.find(({ m, c }) => m.id !== ignorar && m.y + m.alto > 0.05 && m.y < 2 && x0 - HOLGURA < c.x1 && x1 + HOLGURA > c.x0 && z0 - HOLGURA < c.z1 && z1 + HOLGURA > c.z0);
  for (const l of p.lugares) {
    if (l.salida.x < a.x0 || l.salida.x > a.x1 || l.salida.z < a.z0 || l.salida.z > a.z1) problemas.push(`${l.id}: la salida queda fuera de la sala`);
    const carril = tapa(l.salida.x, l.salida.x, Math.min(l.salida.z, a.pasilloZ), Math.max(l.salida.z, a.pasilloZ), l.silla);
    if (carril) problemas.push(`${l.id}: ${carril.m.id} le corta el paso`);
    if (!l.asiento && tapa(l.x, l.x, l.z, l.z)) problemas.push(`${l.id}: no hay sitio para estar de pie`);
  }
  const pasillo = tapa(a.x0, a.x1, a.pasilloZ, a.pasilloZ);
  if (pasillo) problemas.push(`${pasillo.m.id} tapa el pasillo hasta la puerta`);
  return problemas;
}

/** Revisa un plano. Devuelve los motivos en lenguaje claro: el ingeniero los recibe para corregir. */
export function validarPlano(plano, ocupados = []) {
  const errores = [];
  if (typeof plano !== 'object' || plano === null || Array.isArray(plano)) return ['El plano debe ser un objeto.'];
  const { sitio, nombre, departamento, tamano, puestos, estilo, muro } = plano;
  const propio = (lista, k) => typeof k === 'string' && Object.hasOwn(lista, k);
  if (!propio(SITIOS, sitio)) errores.push(`Solo se puede construir en: ${Object.keys(SITIOS).join(', ')}.`);
  else if (ocupados.includes(sitio)) errores.push(`Ya hay una sala en ${SITIOS[sitio].nombre}.`);
  if (typeof nombre !== 'string' || !NOMBRE.test(nombre.trim())) errores.push('El nombre debe tener de 1 a 40 letras, números o signos simples.');
  if (departamento !== undefined && departamento !== null && !(typeof departamento === 'string' && DEPTO.test(departamento))) errores.push('El departamento no es válido.');
  if (!propio(TAMANOS, tamano)) errores.push('El tamaño debe ser S, M o L.');
  if (!propio(ESTILOS, estilo)) errores.push(`El estilo debe ser uno de: ${Object.keys(ESTILOS).join(', ')}.`);
  if (!propio(MUROS, muro)) errores.push(`El muro del fondo debe ser uno de: ${Object.keys(MUROS).join(', ')}.`);
  if (!Number.isInteger(puestos) || puestos < 1) errores.push('Los puestos deben ser un número entero desde 1.');
  else if (propio(TAMANOS, tamano) && puestos > TAMANOS[tamano].puestos) errores.push(`Una sala ${tamano} tiene como máximo ${TAMANOS[tamano].puestos} puestos.`);
  if (errores.length) return errores;
  return comprobarPlanta(plantaDe(plano));
}

/** Lo que se puede elegir: lo usa el panel y se le pasa al ingeniero en cada pedido. */
export function catalogo() {
  const nombres = (lista) => Object.entries(lista).map(([id, v]) => ({ id, nombre: v.nombre }));
  return {
    sitios: Object.entries(SITIOS).map(([id, s]) => ({ id, nombre: s.nombre, sala: s.sala, lado: s.lado, nivel: s.nivel })),
    tamanos: Object.entries(TAMANOS).map(([id, t]) => ({ id, nombre: t.nombre, puestos: t.puestos, ancho: t.ancho })),
    estilos: nombres(ESTILOS),
    muros: nombres(MUROS),
    maxSalas: MAX_SALAS,
  };
}

const error = (mensaje, codigo = 400, extra = {}) => Object.assign(new Error(mensaje), { codigo, ...extra });

/**
 * `salas()` y `guardarSalas(mapa, quien)` leen y escriben el reparto de config casa.salas: una sala
 * con departamentos fijados no se demuele sin reubicarlos. `alTerminar(obra)` se llama cuando una
 * sala queda lista: ahí se mueve su departamento.
 */
export function crearObras({ RAIZ, auditar = () => {}, salas = () => ({}), guardarSalas = () => {}, alTerminar = () => {}, duracionMs = DURACION_OBRA_MS, ahora = () => Date.now() }) {
  const DIR = path.join(RAIZ, 'config');
  const ARCHIVO = path.join(DIR, 'obras.json');
  const PREVIO = path.join(DIR, 'obras.previo.json');

  const escribirJson = (ruta, datos) => {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${ruta}.tmp`, JSON.stringify(datos, null, 2));
    fs.renameSync(`${ruta}.tmp`, ruta);
  };

  /** Si el archivo está dañado no se sobrescribe: lanzar evita perder las obras que hubiera. */
  function leer() {
    let texto;
    try {
      texto = fs.readFileSync(ARCHIVO, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    let datos;
    try {
      datos = JSON.parse(texto.replace(/^﻿/, ''));
    } catch {
      throw error('config/obras.json está dañado; revísalo antes de seguir.', 500);
    }
    if (!Array.isArray(datos?.obras)) throw error('config/obras.json está dañado; revísalo antes de seguir.', 500);
    return datos.obras;
  }

  function guardar(obras, antes, accion, pins = null) {
    escribirJson(PREVIO, { obras: antes, accion, pins });
    escribirJson(ARCHIVO, { obras });
  }

  const ocupados = (obras, salvo) => obras.filter((o) => o.id !== salvo && OCUPAN.has(o.estado)).map((o) => o.sitio);
  const anotar = (obra, estado, quien, motivo) => {
    obra.estado = estado;
    obra.historial.push({ estado, quien, cuando: new Date().toISOString(), ...(motivo ? { motivo } : {}) });
  };
  const buscar = (obras, id) => {
    const obra = obras.find((o) => o.id === id);
    if (!obra) throw error('No existe esa obra.', 404);
    return obra;
  };
  const registrar = (obra, accion, quien) => auditar({ quien, seccion: 'obras', campos: { [obra.id]: { accion, sitio: obra.sitio, nombre: obra.nombre } } });

  /** Departamentos fijados a una sala, en cualquier proyecto. */
  const ocupantes = (sala) => Object.entries(salas()).filter(([, v]) => v === sala).map(([k]) => k);

  /**
   * Presenta un plano. Si no valida, el error trae `motivos`. `extra` guarda para qué proyecto es y,
   * si la hizo el ingeniero, de qué pedido sale, quién lo pidió y por qué eligió ese diseño.
   */
  function proponer(plano, quien = 'titular', { proyecto = null, pedido = null, solicitante = null, razon = '' } = {}) {
    const obras = leer();
    const motivos = validarPlano(plano, ocupados(obras));
    if (motivos.length) throw error(motivos.join(' '), 400, { motivos });
    if (obras.filter((o) => OCUPAN.has(o.estado)).length >= MAX_SALAS) throw error(`La casa admite hasta ${MAX_SALAS} salas nuevas.`, 409);
    const { sitio, departamento, tamano, puestos, estilo, muro } = plano;
    const obra = {
      id: `obra-${crypto.randomBytes(5).toString('hex')}`,
      sitio,
      nombre: plano.nombre.trim(),
      departamento: departamento || null,
      tamano,
      puestos,
      estilo,
      muro,
      estado: 'propuesta',
      pedidaPor: quien,
      proyecto,
      pedido,
      solicitante,
      razon,
      historial: [],
    };
    anotar(obra, 'propuesta', quien);
    guardar([...obras, obra], obras, `proponer ${obra.nombre}`);
    registrar(obra, 'propuesta', quien);
    return obra;
  }

  /** Aprueba y empieza la obra. La sala aparece en la casa cuando `avanzar` la da por terminada. */
  function aprobar(id, quien = 'titular') {
    const obras = leer();
    const antes = structuredClone(obras);
    const obra = buscar(obras, id);
    if (obra.estado !== 'propuesta') throw error(`Esa obra ya está ${obra.estado}.`, 409);
    const motivos = validarPlano(obra, ocupados(obras, id));
    if (motivos.length) throw error(motivos.join(' '), 409, { motivos });
    anotar(obra, 'aprobada', quien);
    anotar(obra, 'en-construccion', quien);
    obra.inicio = ahora();
    obra.fin = obra.inicio + duracionMs;
    guardar(obras, antes, `construir ${obra.nombre}`);
    registrar(obra, 'en-construccion', quien);
    return obra;
  }

  /**
   * Termina las obras a las que ya les llegó la hora; también las que vencieron con la oficina
   * apagada. No toca la copia previa: deshacer sigue volviendo a antes de aprobar, porque volver a
   * «en construcción» con la hora pasada la terminaría otra vez al instante.
   */
  function avanzar() {
    let obras;
    try {
      obras = leer();
    } catch (e) {
      console.error('Obras:', e.message);
      return [];
    }
    const listas = obras.filter((o) => o.estado === 'en-construccion' && !(o.fin > ahora()));
    if (!listas.length) return [];
    for (const o of listas) anotar(o, 'terminada', 'oficina');
    escribirJson(ARCHIVO, { obras });
    for (const o of listas) {
      registrar(o, 'terminada', 'oficina');
      try {
        alTerminar(o);
      } catch (e) {
        console.error(`Obra ${o.id}:`, e.message);
      }
    }
    return listas;
  }

  /** Las salas que se están levantando, con lo que necesita la casa para dibujar los andamios. */
  function enObra() {
    let obras;
    try {
      obras = leer();
    } catch {
      return [];
    }
    return obras
      .filter((o) => o.estado === 'en-construccion' && validarPlano(o).length === 0)
      .map((o) => {
        const { lado, nivel, sala } = SITIOS[o.sitio];
        const { ambiente } = plantaDe(o);
        return { id: o.id, nombre: o.nombre, sala, lado, nivel, y: ambiente.y, alto: ambiente.alto, x0: ambiente.x0, x1: ambiente.x1, z0: ambiente.z0, z1: ambiente.z1, inicio: o.inicio, fin: o.fin };
      });
  }

  function rechazar(id, motivo, quien = 'titular') {
    const obras = leer();
    const antes = structuredClone(obras);
    const obra = buscar(obras, id);
    if (obra.estado !== 'propuesta') throw error(`Esa obra ya está ${obra.estado}.`, 409);
    anotar(obra, 'rechazada', quien, typeof motivo === 'string' ? motivo.trim().slice(0, 300) : '');
    guardar(obras, antes, `rechazar ${obra.nombre}`);
    registrar(obra, 'rechazada', quien);
    return obra;
  }

  /** Con `reubicar`, quien estuviera fijado a la sala pasa al atrio. Sin él, una sala ocupada no se toca. */
  function demoler(id, { reubicar = false } = {}, quien = 'titular') {
    const obras = leer();
    const antes = structuredClone(obras);
    const obra = buscar(obras, id);
    if (obra.estado !== 'terminada') throw error('Solo se puede demoler una sala terminada.', 409);
    const sala = SITIOS[obra.sitio].sala;
    const dentro = ocupantes(sala);
    if (dentro.length && !reubicar) throw error('Esa sala tiene departamentos: reubícalos antes de demolerla.', 409, { ocupantes: dentro });
    anotar(obra, 'demolida', quien);
    guardar(obras, antes, `demoler ${obra.nombre}`, dentro.length ? Object.fromEntries(dentro.map((k) => [k, sala])) : null);
    if (dentro.length) guardarSalas({ ...salas(), ...Object.fromEntries(dentro.map((k) => [k, 'atrio'])) }, quien);
    registrar(obra, 'demolida', quien);
    return obra;
  }

  function puedeDeshacer() {
    try {
      return JSON.parse(fs.readFileSync(PREVIO, 'utf8')).accion || null;
    } catch {
      return null;
    }
  }

  /** Vuelve un paso atrás. Si eso hace desaparecer una sala ocupada, pide reubicar como al demoler. */
  function deshacer({ reubicar = false } = {}, quien = 'titular') {
    const previo = (() => {
      try {
        return JSON.parse(fs.readFileSync(PREVIO, 'utf8'));
      } catch {
        return null;
      }
    })();
    if (!previo || !Array.isArray(previo.obras)) throw error('No hay nada que deshacer.', 409);
    const actuales = leer();
    const salaViva = (lista) => new Set(lista.filter((o) => o.estado === 'terminada').map((o) => SITIOS[o.sitio]?.sala));
    const volverian = salaViva(previo.obras);
    const dentro = [...salaViva(actuales)].filter((s) => !volverian.has(s)).flatMap(ocupantes);
    if (dentro.length && !reubicar) throw error('Deshacer quitaría una sala con departamentos: reubícalos antes.', 409, { ocupantes: dentro });
    escribirJson(ARCHIVO, { obras: previo.obras });
    fs.rmSync(PREVIO, { force: true });
    // Devuelve a su sala a quien mandó al atrio la demolición que se está deshaciendo.
    const actuales2 = salas();
    const repuestos = Object.fromEntries(Object.entries(previo.pins || {}).filter(([k]) => actuales2[k] === 'atrio'));
    const movidos = Object.fromEntries(dentro.map((k) => [k, 'atrio']));
    if (Object.keys(repuestos).length || dentro.length) guardarSalas({ ...actuales2, ...repuestos, ...movidos }, quien);
    auditar({ quien, seccion: 'obras', campos: { deshacer: previo.accion } });
    return previo.accion;
  }

  /** Lo que dibuja la casa. Una obra guardada que ya no valide se omite: nunca rompe la escena. */
  function plantas() {
    let obras;
    try {
      obras = leer();
    } catch (e) {
      console.error('Obras:', e.message);
      return [];
    }
    const vistos = [];
    const fuera = [];
    for (const o of obras) {
      if (o.estado !== 'terminada') continue;
      const motivos = validarPlano(o, vistos);
      if (motivos.length) {
        console.error(`Obra ${o.id} omitida:`, motivos.join(' '));
        continue;
      }
      vistos.push(o.sitio);
      fuera.push(plantaDe(o));
    }
    return fuera;
  }

  const lista = () => leer();
  /** Los sitios que ya no se le ofrecen al ingeniero: también los de planos a la espera de decisión. */
  const sitiosOcupados = () => leer().filter((o) => OCUPAN.has(o.estado) || o.estado === 'propuesta').map((o) => o.sitio);

  return { lista, proponer, aprobar, avanzar, enObra, rechazar, demoler, deshacer, puedeDeshacer, plantas, sitiosOcupados, catalogo };
}
