import fs from 'node:fs';
import path from 'node:path';
import { carpetaClave, rutaRegla } from './plataforma.mjs';
import { crearContextos } from './contextos.mjs';
import { crearConexiones } from './conexiones.mjs';
import { crearMatriz } from './matriz.mjs';
import { crearSecretos } from './secretos.mjs';
import { configDe } from './config.mjs';

// Perfil de trabajo de cada agente (permisos.json → «perfil»): fija su tope de
// pasos y, con nivel «total», qué puede tocar en el proyecto. El gerente es
// siempre «gerente»; sin perfil, «general».
const raiz = path.resolve(import.meta.dirname, '..');
const contextos = crearContextos({ RAIZ: raiz });
const ARCHIVO = path.join(import.meta.dirname, 'perfiles.json');
const LECTURA = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

/**
 * Conexiones MCP, matriz de permisos y secretos: una instancia por proceso (servidor y
 * coordinador-cli, que usa ejecutar.mjs). Todo vive en config/ (vetado para los agentes).
 */
let acceso = null;
export function accesoMcp() {
  if (!acceso) {
    const auditar = (e) => configDe(raiz).auditar(e);
    const secretos = crearSecretos({ RAIZ: raiz, auditar });
    const conexiones = crearConexiones({ RAIZ: raiz, auditar, secreto: (n) => secretos.obtener(n), proyectos: () => contextos.todos().map((c) => c.id) });
    const matriz = crearMatriz({ RAIZ: raiz, conexiones, auditar, perfiles: () => leerPerfiles().perfiles || {}, perfilDe: (id) => perfilDe(id).perfil });
    acceso = { secretos, conexiones, matriz };
  }
  return acceso;
}

/**
 * Lo que necesita un motor para este agente: herramientas MCP permitidas/vetadas (Claude),
 * argumentos (Codex), variables de entorno con los secretos (solo para el proceso hijo), el
 * archivo --mcp-config de Claude (sin secretos) y la instrucción con sus niveles.
 * `tope`: «leer» para agentes de nivel básico.
 */
export function mcpDeEmpleado(empleado, { tope = 'todo' } = {}) {
  const { matriz, secretos } = accesoMcp();
  const ctx = contextos.deEmpleado(empleado);
  const r = matriz.mcpPara(empleado, { proyecto: ctx?.id || null, secreto: (n) => secretos.obtener(n), tope });
  let mcpConfig = null;
  if (Object.keys(r.claude.servidores).length) {
    mcpConfig = path.join(raiz, 'config', 'mcp', `${empleado}.json`);
    fs.mkdirSync(path.dirname(mcpConfig), { recursive: true });
    fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: r.claude.servidores }, null, 2));
  }
  return { ...r, mcpConfig };
}

export function leerPerfiles() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch { return { porDefecto: 'general', pruebas: [], perfiles: { general: { maxTurnos: 60, editar: 'todo', terminal: true, subagentes: true } } }; }
}
/** Cambia el tope de pasos de un perfil (Área de configuración › Motores). Devuelve el anterior. */
export function cambiarTopePasos(perfil, maxTurnos) {
  const datos = leerPerfiles();
  if (!datos.perfiles?.[perfil]) throw Object.assign(new Error(`No existe el perfil «${perfil}».`), { codigo: 404 });
  const n = Number(maxTurnos);
  if (!Number.isInteger(n) || n < 10 || n > 500) throw Object.assign(new Error('El tope de pasos debe ser un entero entre 10 y 500.'), { codigo: 400 });
  const antes = datos.perfiles[perfil].maxTurnos;
  datos.perfiles[perfil].maxTurnos = n;
  fs.writeFileSync(`${ARCHIVO}.tmp`, JSON.stringify(datos, null, 2) + '\n');
  fs.renameSync(`${ARCHIVO}.tmp`, ARCHIVO);
  return antes;
}
export function perfilDe(empleado, gerente = 'cto') {
  const { porDefecto, perfiles } = leerPerfiles();
  let nombre = empleado === gerente ? 'gerente' : porDefecto;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(contextos.dirEmpleado(empleado), 'permisos.json'), 'utf8').replace(/^﻿/, '')).perfil;
    if (p && perfiles[p]) nombre = p;
  } catch {}
  const datos = perfiles[nombre] || perfiles[porDefecto] || {};
  return { perfil: nombre, maxTurnos: Number(datos.maxTurnos) || 60, editar: datos.editar || 'todo', terminal: datos.terminal !== false, subagentes: datos.subagentes !== false, commits: datos.commits !== false, descripcion: datos.descripcion || '' };
}

// Ruta absoluta en el formato de las reglas de Claude Code: //c/Users/...
const absoluta = rutaRegla;

/** .env, config/ y (en Linux) la clave de los secretos: ningún agente los lee ni los edita. */
export function vetosSecretos() {
  const config = absoluta(path.join(raiz, 'config'));
  const clave = carpetaClave();
  return [`Read(${absoluta(path.join(raiz, '.env'))})`, `Read(${config}/**)`, `Edit(${config}/**)`, `Write(${config}/**)`,
    ...(clave ? [`Read(${absoluta(clave)}/**)`, `Edit(${absoluta(clave)}/**)`, `Write(${absoluta(clave)}/**)`] : [])];
}

// Herramientas de Claude para un agente de nivel «total» según su perfil. Con
// «todo» se aceptan las ediciones dentro del proyecto (acceptEdits); con
// «pruebas» o «ninguno» solo se permiten las rutas listadas y Claude rechaza lo
// demás sin preguntar. La carpeta de empleados siempre es escribible: ahí deja
// el resultado de sus encargos y escribe los de sus colegas.
// Los vetos de servidor/vetado-total.json aplican a todos los perfiles; si el
// archivo falta o está dañado, se veta toda la terminal.
export function vetosTotal() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'vetado-total.json'), 'utf8').replace(/^﻿/, '')).herramientas;
    // {OFICINA}: la carpeta de la oficina en este equipo (los vetos no dependen de la máquina).
    if (Array.isArray(v) && v.length) return v.map((h) => h.split('{OFICINA}').join(absoluta(raiz)));
  } catch {}
  return ['Bash', 'PowerShell'];
}
export function herramientasClaude(empleado, vetos = vetosTotal()) {
  const p = perfilDe(empleado);
  const { pruebas = [] } = leerPerfiles();
  // Carpetas escribibles: las de empleados y contrataciones del proyecto (contexto) del agente.
  const ctx = contextos.deEmpleado(empleado);
  const oficina = (ctx ? [ctx.empleados, ctx.contrataciones] : [path.join(raiz, 'empleados'), path.join(raiz, 'contrataciones')]).map((d) => `${absoluta(d)}/**`);
  const permitidas = [...LECTURA, 'TodoWrite'];
  // Conexiones MCP y Git según la matriz de permisos (Configuración › Permisos).
  const mcp = mcpDeEmpleado(empleado);
  permitidas.push(...mcp.claude.permitidas);
  const vetadas = [...vetos, ...vetosSecretos(), ...mcp.claude.vetadas];
  if (p.terminal) permitidas.push('Bash'); else vetadas.push('Bash', 'PowerShell');
  if (p.subagentes) permitidas.push('Agent'); else vetadas.push('Agent');
  let modo = 'acceptEdits';
  if (p.editar === 'todo') permitidas.push('Edit', 'Write', 'NotebookEdit');
  else {
    modo = 'default';
    const rutas = [...oficina, ...(p.editar === 'pruebas' ? pruebas : [])];
    for (const r of rutas) permitidas.push(`Edit(${r})`); // las reglas Edit(ruta) cubren también Write
  }
  return { ...p, modo, permitidas, vetadas, mcpConfig: mcp.mcpConfig, entorno: mcp.entorno, instruccion: mcp.instruccion, avisos: mcp.avisos };
}

// Lo mismo, como instrucción: Codex no distingue rutas en su sandbox.
export function reglaPerfil(empleado) {
  const p = perfilDe(empleado);
  const editar = { todo: 'puedes editar todo el proyecto', pruebas: 'solo puedes crear o editar archivos de prueba (*.spec.*, *.test.*, test/, tests/, e2e/); si encuentras un fallo en el código, repórtalo con evidencia a quien lo programó en vez de corregirlo', ninguno: 'no modifiques el proyecto: solo lees y escribes en tu carpeta' }[p.editar];
  return `Tu perfil es «${p.perfil}» (${p.descripcion}): ${editar}${p.terminal ? '' : '; no uses la terminal'}${p.commits ? '' : '; no hagas commits ni cambies de rama'}. Tienes como máximo ${p.maxTurnos} pasos por ejecución: divide el trabajo grande.`;
}
