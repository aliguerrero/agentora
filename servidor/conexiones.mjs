// Conexiones MCP de la oficina (repositorio, Jira, Gmail…) para los agentes de Claude y Codex.
// Se guardan en config/conexiones.json (vetado para los agentes). Los secretos (tokens) viven
// en el almacén cifrado y llegan al motor SOLO por variables de entorno del proceso hijo, nunca
// en la línea de comandos ni en archivos.
//
// «Probar» habla MCP con la conexión (initialize + tools/list) y guarda sus herramientas
// clasificadas en lectura / escritura / destructiva, para que la matriz de permisos pueda
// permitir o vetar herramienta por herramienta. Las conexiones con OAuth (Atlassian, Figma)
// necesitan que el titular inicie sesión una vez en cada motor (claude /mcp, codex mcp login).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const ID_CONEXION = /^[a-z][a-z0-9_]{1,30}$/;
const SECRETO = /^[A-Z][A-Z0-9_]{1,63}$/;
const ENV = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Plantillas. «verificado: false» = servidor comunitario o de referencia: revisa el paquete
 * antes de usarlo (la oficina lo ejecutará en este equipo con tus credenciales).
 */
export const CATALOGO = [
  { plantilla: 'atlassian', nombre: 'Jira y Confluence (Atlassian)', tipo: 'http', url: 'https://mcp.atlassian.com/v2/mcp', auth: 'oauth', verificado: true,
    nota: 'Servidor oficial de Atlassian con OAuth. Inicia sesión una vez: en Claude con /mcp y en Codex con «codex mcp login atlassian».' },
  { plantilla: 'github', nombre: 'GitHub', tipo: 'http', url: 'https://api.githubcopilot.com/mcp/', auth: 'token', secreto: 'GITHUB_MCP_TOKEN', verificado: true,
    nota: 'Servidor remoto oficial de GitHub. Usa un token de acceso personal (fine-grained) con los permisos mínimos sobre tus repositorios.' },
  { plantilla: 'figma', nombre: 'Figma', tipo: 'http', url: 'https://mcp.figma.com/mcp', auth: 'oauth', verificado: true,
    nota: 'Servidor remoto oficial de Figma con OAuth: inicia sesión una vez en cada motor.' },
  { plantilla: 'gmail', nombre: 'Gmail', tipo: 'stdio', comando: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'], auth: 'ninguna', verificado: false,
    nota: 'Servidor comunitario (no de Google): la primera vez abre el navegador para autorizar tu cuenta y guarda el permiso en tu perfil. Revísalo antes de activarlo. Para solo enviar avisos ya tienes el correo SMTP.' },
  { plantilla: 'slack', nombre: 'Slack', tipo: 'stdio', comando: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], auth: 'entorno', entorno: { SLACK_BOT_TOKEN: 'SLACK_BOT_TOKEN', SLACK_TEAM_ID: 'SLACK_TEAM_ID' }, verificado: false,
    nota: 'Servidor de referencia de MCP (archivado por sus autores). Necesita un bot de Slack y el id del espacio de trabajo.' },
  { plantilla: 'http', nombre: 'Otra conexión (HTTP)', tipo: 'http', url: '', auth: 'ninguna', verificado: false, nota: 'Cualquier servidor MCP remoto (streamable HTTP).' },
  { plantilla: 'stdio', nombre: 'Otra conexión (programa local)', tipo: 'stdio', comando: '', args: [], auth: 'ninguna', verificado: false, nota: 'Un servidor MCP que se ejecuta como programa en este equipo.' },
];

/**
 * Herramientas conocidas de servidores OAuth (no se pueden descubrir sin la sesión del motor).
 * Atlassian: las del servidor oficial v2.
 */
const CONOCIDAS = {
  atlassian: {
    lectura: ['atlassianUserInfo', 'getAccessibleAtlassianResources', 'getJiraIssue', 'searchJiraIssuesUsingJql', 'getConfluenceContent', 'searchConfluence', 'search', 'discover', 'executeRead', 'getGraphContext', 'getGraphObject', 'getCollaborators', 'getPeopleInfo', 'getWorkActivity', 'getWorkPortfolio', 'listJiraIssueComments', 'getLoomObjectsContent'],
    escritura: ['createJiraIssue', 'editJiraIssue', 'addOrEditJiraIssueComment', 'transitionJiraIssue', 'createConfluenceContent', 'updateConfluenceContent', 'executeWrite', 'addGraphContext'],
    destructiva: ['executeDestructive'],
  },
};

const LECTURA = /^(get|list|search|read|fetch|find|query|describe|view|show|download|lookup|retrieve|check|count|whoami|info|discover)/i;
const DESTRUCTIVA = /(delete|remove|destroy|drop|purge|wipe|truncate|erase|revoke|archive|destructive|force[_-]?push|merge)/i;
/** Clasifica una herramienta por su nombre (y descripción): lectura, escritura o destructiva. */
export function clasificar(nombre, descripcion = '') {
  if (DESTRUCTIVA.test(nombre)) return 'destructiva';
  if (LECTURA.test(nombre) || /^(?:is|has)[A-Z_]/.test(nombre)) return 'lectura';
  if (/read[- ]only|solo lectura/i.test(descripcion)) return 'lectura';
  return 'escritura';
}

/** Valida una conexión que llega del panel. */
export function validarConexion(d, { proyectos = [] } = {}) {
  const mal = (m) => { throw Object.assign(new Error(m), { codigo: 400 }); };
  const id = String(d.id || '').trim();
  if (!ID_CONEXION.test(id)) mal('id: minúsculas, números o _ (2 a 31), empezando por letra.');
  const nombre = String(d.nombre || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
  if (nombre.length < 2) mal('nombre: obligatorio.');
  const tipo = d.tipo === 'stdio' ? 'stdio' : 'http';
  const auth = ['oauth', 'token', 'entorno', 'ninguna'].includes(d.auth) ? d.auth : 'ninguna';
  const c = { id, nombre, tipo, auth, activa: d.activa !== false, plantilla: String(d.plantilla || '').slice(0, 20), verificado: d.verificado === true };
  if (tipo === 'http') {
    const url = String(d.url || '').trim();
    if (!/^https:\/\/[^\s]+$/.test(url) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/[^\s]*$/.test(url)) mal('url: debe ser https (o http solo en este equipo).');
    c.url = url;
  } else {
    const comando = String(d.comando || '').trim();
    if (!/^[\w.:\\/ -]{1,200}$/.test(comando)) mal('comando: no válido.');
    const args = Array.isArray(d.args) ? d.args.map(String) : [];
    if (args.length > 30 || args.some((a) => a.length > 300 || /[\r\n]/.test(a))) mal('args: máximo 30, sin saltos de línea.');
    Object.assign(c, { comando, args });
  }
  if (auth === 'token') {
    if (!SECRETO.test(String(d.secreto || ''))) mal('secreto: nombre en MAYÚSCULAS (p. ej. GITHUB_MCP_TOKEN).');
    c.secreto = d.secreto;
  }
  if (auth === 'entorno' || (tipo === 'stdio' && d.entorno)) {
    const e = d.entorno && typeof d.entorno === 'object' ? d.entorno : {};
    for (const [k, v] of Object.entries(e)) if (!ENV.test(k) || !SECRETO.test(String(v))) mal('entorno: VARIABLE → SECRETO, ambos en MAYÚSCULAS.');
    c.entorno = e;
  }
  const pr = Array.isArray(d.proyectos) && d.proyectos.length ? [...new Set(d.proyectos.map(String))] : ['*'];
  for (const p of pr) if (p !== '*' && !proyectos.includes(p)) mal(`proyecto desconocido: ${p}`);
  c.proyectos = pr.includes('*') ? ['*'] : pr;
  if (Array.isArray(d.herramientas)) {
    c.herramientas = d.herramientas.filter((h) => h && /^[\w.-]{1,100}$/.test(h.nombre)).slice(0, 300)
      .map((h) => ({ nombre: h.nombre, tipo: ['lectura', 'escritura', 'destructiva'].includes(h.tipo) ? h.tipo : clasificar(h.nombre) }));
  }
  return c;
}

/** Herramientas de una conexión: las descubiertas o, si no, las conocidas de su plantilla. */
export function herramientasDe(c) {
  if (c.herramientas?.length) return c.herramientas;
  const k = CONOCIDAS[c.plantilla] || CONOCIDAS[c.id];
  return k ? Object.entries(k).flatMap(([tipo, nombres]) => nombres.map((nombre) => ({ nombre, tipo }))) : [];
}

/* ---------- Prueba: initialize + tools/list por MCP ---------- */

const MENSAJE_INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oficina', version: '1.0' } } };

async function probarHttp(c, { secreto, fetchImpl = fetch }) {
  const cabeceras = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
  if (c.auth === 'token') { const t = secreto(c.secreto); if (!t) throw new Error(`Falta el secreto ${c.secreto}.`); cabeceras.authorization = `Bearer ${t}`; }
  const leer = async (r) => {
    const tipo = r.headers.get('content-type') || '';
    const texto = await r.text();
    if (tipo.includes('text/event-stream')) { const datos = texto.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean); return JSON.parse(datos.at(-1) || '{}'); }
    return JSON.parse(texto || '{}');
  };
  const r1 = await fetchImpl(c.url, { method: 'POST', headers: cabeceras, body: JSON.stringify(MENSAJE_INIT), signal: AbortSignal.timeout(15000) });
  if (r1.status === 401 || r1.status === 403) {
    if (c.auth === 'oauth') return { ok: true, requiereSesion: true, detalle: 'Responde y pide iniciar sesión (OAuth): hazlo una vez en cada motor.' };
    throw new Error(`El servidor rechazó la autenticación (${r1.status}).`);
  }
  if (!r1.ok) throw new Error(`El servidor respondió ${r1.status}.`);
  const init = await leer(r1);
  if (!init.result) throw new Error('No respondió como un servidor MCP.');
  const sesion = r1.headers.get('mcp-session-id');
  const h2 = { ...cabeceras, ...(sesion ? { 'mcp-session-id': sesion } : {}) };
  await fetchImpl(c.url, { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: AbortSignal.timeout(10000) }).catch(() => {});
  const r2 = await fetchImpl(c.url, { method: 'POST', headers: h2, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), signal: AbortSignal.timeout(15000) });
  const lista = r2.ok ? await leer(r2) : {};
  return { ok: true, servidor: init.result.serverInfo || null, herramientas: (lista.result?.tools || []).map((t) => ({ nombre: t.name, tipo: clasificar(t.name, t.description) })) };
}

function probarStdio(c, { secreto, limiteMs = 60000 }) {
  return new Promise((resolver, rechazar) => {
    const entorno = { ...process.env };
    for (const [variable, nombre] of Object.entries(c.entorno || {})) { const v = secreto(nombre); if (!v) return rechazar(new Error(`Falta el secreto ${nombre}.`)); entorno[variable] = v; }
    const hijo = spawn(c.comando, c.args || [], { env: entorno, windowsHide: true, shell: process.platform === 'win32' && /^(npx|npm|pnpm|uvx)$/i.test(c.comando) });
    let buffer = '', errores = '', listo = false;
    const fin = (e, r) => { if (listo) return; listo = true; clearTimeout(t); try { hijo.kill(); } catch {} e ? rechazar(e) : resolver(r); };
    const t = setTimeout(() => fin(new Error(`Sin respuesta en ${limiteMs / 1000} s.${errores ? ` ${errores.trim().split('\n').pop()}` : ''}`)), limiteMs);
    hijo.stdin.on('error', () => {});
    const enviar = (m) => hijo.stdin.write(JSON.stringify(m) + '\n');
    let servidor = null;
    hijo.on('error', (e) => fin(new Error(`No se pudo ejecutar «${c.comando}»: ${e.message}`)));
    hijo.stderr.on('data', (d) => { errores = (errores + d).slice(-2000); });
    hijo.stdout.on('data', (d) => {
      buffer += d;
      const lineas = buffer.split('\n'); buffer = lineas.pop();
      for (const l of lineas) {
        let m; try { m = JSON.parse(l); } catch { continue; }
        if (m.id === 1) {
          if (!m.result) return fin(new Error('No respondió como un servidor MCP.'));
          servidor = m.result.serverInfo || null;
          enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
          enviar({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (m.id === 2) fin(null, { ok: true, servidor, herramientas: (m.result?.tools || []).map((x) => ({ nombre: x.name, tipo: clasificar(x.name, x.description) })) });
      }
    });
    hijo.on('close', (codigo) => fin(new Error(`El programa terminó (${codigo}).${errores ? ` ${errores.trim().split('\n').pop()}` : ''}`)));
    enviar(MENSAJE_INIT);
  });
}

export function crearConexiones({ RAIZ, secreto = () => null, auditar = () => {}, proyectos = () => [], fetchImpl = fetch }) {
  const RUTA = path.join(RAIZ, 'config', 'conexiones.json');
  const leer = () => { try { return JSON.parse(fs.readFileSync(RUTA, 'utf8')).conexiones || []; } catch { return null; } };
  const escribir = (lista) => { fs.mkdirSync(path.dirname(RUTA), { recursive: true }); fs.writeFileSync(`${RUTA}.tmp`, JSON.stringify({ conexiones: lista }, null, 2)); fs.renameSync(`${RUTA}.tmp`, RUTA); };

  /** La primera vez: la conexión de Jira que la oficina ya usaba con Codex. */
  function listar() {
    let l = leer();
    if (l === null) {
      const at = CATALOGO.find((x) => x.plantilla === 'atlassian');
      l = [validarConexion({ ...at, id: 'atlassian', activa: true, verificado: true })];
      escribir(l);
      auditar({ quien: 'migracion', seccion: 'conexiones', campos: { atlassian: 'creada (la que ya usaba la oficina)' } });
    }
    return l;
  }
  const obtener = (id) => listar().find((c) => c.id === id) || null;

  function guardar(d, quien = 'panel') {
    const c = validarConexion(d, { proyectos: proyectos() });
    const l = listar();
    const i = l.findIndex((x) => x.id === c.id);
    if (i >= 0 && !Array.isArray(d.herramientas)) c.herramientas = l[i].herramientas; // se conservan las descubiertas
    if (i >= 0) l[i] = { ...l[i], ...c }; else l.push(c);
    escribir(l);
    auditar({ quien, seccion: 'conexiones', campos: { [c.id]: i >= 0 ? 'editada' : 'creada' } });
    return c;
  }
  function borrar(id, quien = 'panel') {
    const l = listar();
    if (!l.some((x) => x.id === id)) throw Object.assign(new Error('No existe esa conexión.'), { codigo: 404 });
    escribir(l.filter((x) => x.id !== id));
    auditar({ quien, seccion: 'conexiones', campos: { [id]: 'borrada' } });
  }

  async function probar(id) {
    const c = obtener(id);
    if (!c) throw Object.assign(new Error('No existe esa conexión.'), { codigo: 404 });
    const r = c.tipo === 'http' ? await probarHttp(c, { secreto, fetchImpl }) : await probarStdio(c, { secreto });
    const l = listar();
    const i = l.findIndex((x) => x.id === id);
    l[i] = { ...l[i], ultimaPrueba: { fecha: new Date().toISOString(), ok: true, requiereSesion: !!r.requiereSesion, servidor: r.servidor?.name || null }, ...(r.herramientas?.length ? { herramientas: r.herramientas } : {}) };
    escribir(l);
    return { ...r, herramientas: herramientasDe(l[i]) };
  }

  return { listar, obtener, guardar, borrar, probar };
}
