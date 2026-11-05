// Configuración de la oficina como datos: una sección por archivo en config/<seccion>.json,
// validada campo a campo, con auditoría de cambios en logs/config.jsonl. Los secretos NO van
// aquí (ver secretos.mjs). Los agentes no editan config/: está vetado y solo cambia por la API
// del panel (con token) o por solicitudes que valida el servidor.
//
// Cada fase agrega su sección a ESQUEMAS; un campo desconocido se rechaza.
import fs from 'node:fs';
import path from 'node:path';

const zonaValida = (z) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
const localeValido = (l) => { try { return Intl.getCanonicalLocales(l).length === 1; } catch { return false; } };

/** Tipos de campo: texto, enum, bool, numero. `def` puede ser función del contexto de migración. */
export const ESQUEMAS = {
  general: {
    casa: { tipo: 'texto', max: 60, min: 1, def: 'Mi oficina' },
    titular: { tipo: 'texto', max: 80, min: 1, def: 'Titular' },
    titularCorto: { tipo: 'texto', max: 30, min: 1, def: 'Titular' },
    asistente: { tipo: 'texto', max: 40, min: 1, def: 'J.A.R.V.I.S.' },
    idioma: { tipo: 'enum', opciones: ['es', 'en', 'pt'], def: 'es' },
    locale: { tipo: 'texto', max: 20, valida: localeValido, def: 'es' },
    pais: { tipo: 'texto', max: 60, def: '' },
    zonaHoraria: { tipo: 'texto', max: 60, valida: zonaValida, def: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
    moneda: { tipo: 'texto', max: 3, min: 3, def: 'USD' },
    autonomia: { tipo: 'enum', opciones: ['autonoma', 'supervisada'], def: 'autonoma' },
    configurado: { tipo: 'bool', def: false },
  },
  // Política de motores: la leen el servidor, coordinador.mjs y ejecutar.mjs (vía coordinador-cli).
  motores: {
    modo: { tipo: 'enum', opciones: ['auto', 'manual'], def: 'auto' },
    manual: { tipo: 'enum', opciones: ['claude', 'codex'], def: 'claude' },
    claudeActivo: { tipo: 'bool', def: true },
    codexActivo: { tipo: 'bool', def: true },
    relevo: { tipo: 'bool', def: true },
    programacion: { tipo: 'enum', opciones: ['claude', 'codex'], def: 'claude' },
    general: { tipo: 'enum', opciones: ['claude', 'codex'], def: 'codex' },
    umbralReserva: { tipo: 'numero', entero: true, minimo: 50, maximo: 99, def: 85 },
    simultaneos: { tipo: 'numero', entero: true, minimo: 1, maximo: 8, def: 2 },
    inactividadMin: { tipo: 'numero', entero: true, minimo: 5, maximo: 180, def: 25 },
  },
  // Casa 3D (/casa): etiquetas, letrero, hora, calidad, salas y música.
  casa: {
    etiquetas: { tipo: 'enum', opciones: ['siempre', 'hover', 'nunca'], def: 'hover' },
    letrero: { tipo: 'bool', def: true },
    motoresCielo: { tipo: 'bool', def: true },
    horaModo: { tipo: 'enum', opciones: ['real', 'fija'], def: 'real' },
    horaFija: { tipo: 'numero', minimo: 0, maximo: 23.99, def: 12 },
    calidad: { tipo: 'enum', opciones: ['auto', 'alta', 'media', 'baja'], def: 'auto' },
    deriva: { tipo: 'bool', def: false },
    // «proyecto:departamento» → sala de la casa; lo que no esté aquí se asigna solo por afinidad.
    // Una clave sin proyecto es anterior a repartir por proyecto y vale para todos.
    salas: { tipo: 'mapa', clave: /^[a-z0-9-]{1,60}(:[a-z0-9-]{1,60})?$/, valores: ['desarrollo', 'finanzas', 'personal', 'ventas', 'contenido', 'investigacion', 'atrio'], valoresRe: /^ala-(este|oeste)-piso[123]$/, maxItems: 300, def: () => ({}) },
    musica: { tipo: 'bool', def: false },
    volumen: { tipo: 'numero', entero: true, minimo: 0, maximo: 100, def: 40 },
    aleatorio: { tipo: 'bool', def: false },
    pausarOculta: { tipo: 'bool', def: true },
    // URLs directas a archivos de audio (además de los archivos de la carpeta musica/).
    listaUrls: { tipo: 'lista', maxItems: 50, maxLargo: 500, valida: (u) => /^https?:\/\/[^\s]+$/i.test(u), def: () => [] },
  },
  // Al cambiar de proyecto, qué pasa con el trabajo del anterior: preguntar cada vez, pausarlo
  // o dejarlo en segundo plano.
  proyectos: {
    alCambiar: { tipo: 'enum', opciones: ['preguntar', 'pausar', 'segundo-plano'], def: 'preguntar' },
  },
  // Jira Cloud (API REST) para sincronizar quién trabaja en cada proyecto. El token de API es un
  // secreto (JIRA_API_TOKEN). `proyectos`: id del proyecto de la oficina → clave de Jira (KAN).
  jira: {
    sitio: { tipo: 'texto', max: 200, valida: (u) => u === '' || /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/?$/.test(u), def: '' },
    correo: { tipo: 'texto', max: 254, valida: (c) => c === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c), def: '' },
    proyectos: { tipo: 'mapa', clave: /^[a-z0-9-]{1,60}$/, valorRe: /^[A-Z][A-Z0-9_]{1,19}$/, maxItems: 50, def: () => ({}) },
  },
  // Política de contacto: agentes que escriben a personas del equipo (contacto.mjs).
  //   activo: interruptor general (además, cada persona tiene su propia política).
  //   aprobador: quién aprueba lo que necesita permiso (gerente del proyecto, titular o cualquiera).
  //   silencio: horas (0-23) en la zona horaria de cada persona en las que no se envía nada.
  contacto: {
    activo: { tipo: 'bool', def: false },
    aprobador: { tipo: 'enum', opciones: ['cualquiera', 'gerente', 'titular'], def: 'cualquiera' },
    maxPorDia: { tipo: 'numero', entero: true, minimo: 1, maximo: 50, def: 5 },
    silencioDesde: { tipo: 'numero', entero: true, minimo: 0, maximo: 23, def: 20 },
    silencioHasta: { tipo: 'numero', entero: true, minimo: 0, maximo: 23, def: 8 },
  },
  // Bot de Telegram. El token es un secreto (TELEGRAM_TOKEN); aquí solo el interruptor.
  telegram: {
    activo: { tipo: 'bool', def: true },
  },
  // Correo saliente (SMTP). La contraseña es un secreto (SMTP_PASSWORD).
  correo: {
    activo: { tipo: 'bool', def: false },
    host: { tipo: 'texto', max: 200, valida: (h) => h === '' || /^[A-Za-z0-9.-]+$/.test(h), def: '' },
    puerto: { tipo: 'numero', entero: true, minimo: 1, maximo: 65535, def: 587 },
    seguridad: { tipo: 'enum', opciones: ['starttls', 'tls', 'ninguna'], def: 'starttls' },
    usuario: { tipo: 'texto', max: 200, def: '' },
    remitenteNombre: { tipo: 'texto', max: 80, def: '' },
    remitenteCorreo: { tipo: 'texto', max: 254, valida: (c) => c === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c), def: '' },
    firma: { tipo: 'textoLargo', max: 1000, def: '' },
  },
};

const leerJsonSeguro = (ruta) => { try { return JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '')); } catch { return null; } };

/** Valores iniciales de una oficina que ya funcionaba antes de existir config/. */
export function migracionLegada(RAIZ, seccion) {
  if (seccion === 'general') {
    const org = leerJsonSeguro(path.join(RAIZ, 'organizacion.json'));
    if (!org) return {};
    const titular = org.ceo?.titular || 'Titular';
    return { titular, titularCorto: titular.split(/\s+/)[0], asistente: org.ceo?.nombre || 'J.A.R.V.I.S.', configurado: true };
  }
  if (seccion === 'motores') {
    const m = leerJsonSeguro(path.join(RAIZ, 'motor.json'));
    if (!m) return {};
    const fuera = {};
    if (['claude', 'codex'].includes(m.motor)) Object.assign(fuera, { modo: 'manual', manual: m.motor });
    if (Number.isInteger(m.simultaneos) && m.simultaneos >= 1 && m.simultaneos <= 8) fuera.simultaneos = m.simultaneos;
    return fuera;
  }
  return {};
}

function validarCampo(seccion, campo, valor) {
  const e = ESQUEMAS[seccion]?.[campo];
  if (!e) throw Object.assign(new Error(`Campo desconocido: ${seccion}.${campo}`), { codigo: 400 });
  const mal = (m) => { throw Object.assign(new Error(`${seccion}.${campo}: ${m}`), { codigo: 400 }); };
  if (e.tipo === 'texto') {
    if (typeof valor !== 'string') mal('debe ser texto');
    valor = valor.trim();
    if (/[\r\n]/.test(valor)) mal('no puede tener saltos de línea');
    if (valor.length < (e.min || 0)) mal(e.min === 1 ? 'no puede quedar vacío' : `mínimo ${e.min} caracteres`);
    if (valor.length > e.max) mal(`máximo ${e.max} caracteres`);
  } else if (e.tipo === 'textoLargo') {
    // Varias líneas (firma de correo): se normalizan los saltos y se quitan caracteres de control.
    if (typeof valor !== 'string') mal('debe ser texto');
    valor = valor.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (valor.length > e.max) mal(`máximo ${e.max} caracteres`);
  } else if (e.tipo === 'enum') {
    if (!e.opciones.includes(valor)) mal(`debe ser uno de: ${e.opciones.join(', ')}`);
  } else if (e.tipo === 'bool') {
    if (typeof valor !== 'boolean') mal('debe ser verdadero o falso');
  } else if (e.tipo === 'numero') {
    if (!Number.isFinite(valor)) mal('debe ser un número');
    if (e.entero && !Number.isInteger(valor)) mal('debe ser un número entero');
    if (e.minimo !== undefined && valor < e.minimo) mal(`mínimo ${e.minimo}`);
    if (e.maximo !== undefined && valor > e.maximo) mal(`máximo ${e.maximo}`);
  } else if (e.tipo === 'lista') {
    // Lista de textos: cada elemento se recorta, se valida y no se repite.
    if (!Array.isArray(valor)) mal('debe ser una lista');
    if (valor.length > e.maxItems) mal(`máximo ${e.maxItems} elementos`);
    const limpia = [];
    for (const v of valor) {
      if (typeof v !== 'string') mal('cada elemento debe ser texto');
      const t = v.trim();
      if (!t) continue;
      if (t.length > e.maxLargo) mal(`cada elemento: máximo ${e.maxLargo} caracteres`);
      if (e.valida && !e.valida(t)) mal(`elemento no válido: ${t.slice(0, 60)}`);
      if (!limpia.includes(t)) limpia.push(t);
    }
    return limpia;
  } else if (e.tipo === 'mapa') {
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) mal('debe ser un objeto');
    const entradas = Object.entries(valor);
    if (entradas.length > e.maxItems) mal(`máximo ${e.maxItems} elementos`);
    for (const [k, v] of entradas) {
      if (!e.clave.test(k)) mal(`clave no válida: ${k.slice(0, 40)}`);
      if (e.valores && !e.valores.includes(v) && !(typeof v === 'string' && e.valoresRe?.test(v))) mal(`valor no válido para ${k}: debe ser uno de ${e.valores.join(', ')}`);
      if (e.valorRe && !(typeof v === 'string' && e.valorRe.test(v))) mal(`valor no válido para ${k}`);
    }
    return Object.fromEntries(entradas);
  }
  if (e.valida && !e.valida(valor)) mal('valor no válido');
  return valor;
}

const porDefecto = (seccion) => Object.fromEntries(Object.entries(ESQUEMAS[seccion]).map(([k, e]) => [k, typeof e.def === 'function' ? e.def() : e.def]));

/**
 * `migrar(seccion)` devuelve los valores iniciales cuando aún no existe el archivo (por ejemplo,
 * los de una oficina que ya funcionaba antes de existir la configuración).
 */
export function crearConfig({ RAIZ, migrar = (s) => migracionLegada(RAIZ, s) }) {
  const DIR = path.join(RAIZ, 'config');
  const AUDITORIA = path.join(RAIZ, 'logs', 'config.jsonl');
  const cache = new Map(); // seccion → { valores, mtime }
  const oyentes = new Set();
  const mtimeDe = (ruta) => { try { return fs.statSync(ruta).mtimeMs; } catch { return null; } };

  function leer(seccion) {
    if (!ESQUEMAS[seccion]) throw Object.assign(new Error(`Sección desconocida: ${seccion}`), { codigo: 404 });
    const ruta = path.join(DIR, `${seccion}.json`);
    // Otro proceso (ejecutar.mjs → coordinador-cli) puede haberlo cambiado: se relee si cambió.
    const enCache = cache.get(seccion);
    if (enCache && enCache.mtime !== null && enCache.mtime === mtimeDe(ruta)) return structuredClone(enCache.valores);
    let guardado = null;
    try { guardado = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { /* sin archivo o roto: defaults */ }
    const base = { ...porDefecto(seccion), ...(guardado ? {} : migrar(seccion)) };
    const valores = { ...base };
    // Lo guardado se revalida: un valor inválido (editado a mano) vuelve al de base.
    for (const [k, v] of Object.entries(guardado || {})) {
      if (!ESQUEMAS[seccion][k]) continue;
      try { valores[k] = validarCampo(seccion, k, v); } catch { /* se ignora */ }
    }
    if (!guardado) {
      escribir(seccion, valores);
      auditar({ quien: 'migracion', seccion, campos: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, { despues: v }])) });
    }
    cache.set(seccion, { valores, mtime: mtimeDe(ruta) });
    return structuredClone(valores);
  }

  function escribir(seccion, valores) {
    fs.mkdirSync(DIR, { recursive: true });
    const ruta = path.join(DIR, `${seccion}.json`);
    fs.writeFileSync(`${ruta}.tmp`, JSON.stringify(valores, null, 2));
    fs.renameSync(`${ruta}.tmp`, ruta);
  }

  function auditar(entrada) {
    fs.mkdirSync(path.dirname(AUDITORIA), { recursive: true });
    fs.appendFileSync(AUDITORIA, JSON.stringify({ fecha: new Date().toISOString(), ...entrada }) + '\n');
  }

  /** Valida y guarda solo los campos enviados; devuelve la sección completa. */
  function guardar(seccion, cambios, quien = 'panel') {
    if (typeof cambios !== 'object' || cambios === null || Array.isArray(cambios)) throw Object.assign(new Error('Se esperaba un objeto de campos'), { codigo: 400 });
    const actual = leer(seccion);
    const nuevos = {};
    for (const [k, v] of Object.entries(cambios)) nuevos[k] = validarCampo(seccion, k, v);
    const cambiados = Object.keys(nuevos).filter((k) => JSON.stringify(nuevos[k]) !== JSON.stringify(actual[k]));
    if (!cambiados.length) return actual;
    const valores = { ...actual, ...nuevos };
    escribir(seccion, valores);
    cache.set(seccion, { valores, mtime: mtimeDe(path.join(DIR, `${seccion}.json`)) });
    auditar({ quien, seccion, campos: Object.fromEntries(cambiados.map((k) => [k, { antes: actual[k], despues: valores[k] }])) });
    for (const fn of oyentes) { try { fn(seccion, valores); } catch (e) { console.error('Config (oyente):', e.message); } }
    return structuredClone(valores);
  }

  /** Valida sin guardar (para importar: o entra todo, o no se aplica nada). */
  function validar(seccion, cambios) {
    if (!ESQUEMAS[seccion]) throw Object.assign(new Error(`Sección desconocida: ${seccion}`), { codigo: 400 });
    if (typeof cambios !== 'object' || cambios === null || Array.isArray(cambios)) throw Object.assign(new Error(`${seccion}: se esperaba un objeto`), { codigo: 400 });
    for (const [k, v] of Object.entries(cambios)) validarCampo(seccion, k, v);
  }

  /** Vuelve a los valores de fábrica de una sección. */
  function restablecer(seccion, quien = 'panel') {
    const actual = leer(seccion);
    const valores = porDefecto(seccion);
    escribir(seccion, valores);
    cache.set(seccion, { valores, mtime: mtimeDe(path.join(DIR, `${seccion}.json`)) });
    auditar({ quien, seccion, campos: { restablecida: { antes: actual, despues: valores } } });
    for (const fn of oyentes) { try { fn(seccion, valores); } catch (e) { console.error('Config (oyente):', e.message); } }
    return structuredClone(valores);
  }

  function auditoria(n = 50) {
    try {
      return fs.readFileSync(AUDITORIA, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
    } catch { return []; }
  }

  /** Descripción de los campos para que el panel arme los formularios. */
  const esquema = () => Object.fromEntries(Object.entries(ESQUEMAS).map(([s, campos]) => [s,
    Object.fromEntries(Object.entries(campos).map(([k, e]) => [k, { tipo: e.tipo, ...(e.opciones ? { opciones: e.opciones } : {}), ...(e.valores ? { valores: e.valores } : {}),
      ...(e.max ? { max: e.max } : {}), ...(e.maxItems ? { maxItems: e.maxItems } : {}), ...(e.minimo !== undefined ? { minimo: e.minimo, maximo: e.maximo } : {}) }]))]));

  const todo = () => Object.fromEntries(Object.keys(ESQUEMAS).map((s) => [s, leer(s)]));
  const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

  return { leer, guardar, validar, restablecer, todo, esquema, auditoria, auditar, alCambiar, secciones: () => Object.keys(ESQUEMAS) };
}

/** Una instancia por raíz dentro de cada proceso (servidor, coordinador y motores comparten). */
const instancias = new Map();
export function configDe(RAIZ) {
  const clave = path.resolve(RAIZ);
  if (!instancias.has(clave)) instancias.set(clave, crearConfig({ RAIZ: clave }));
  return instancias.get(clave);
}
