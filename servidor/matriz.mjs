// Matriz de permisos: qué puede hacer cada perfil (y, por encima, cada agente) con cada conexión
// MCP y con algunas capacidades de la oficina. Vive en config/permisos-matriz.json (vetado).
//
//   conexiones: { <id>: 'no' | 'leer' | 'escribir' | 'todo' }
//   git: 'no' | 'commits' | 'push'      contratar: bool      contactar: bool
//   otorgan: { 'gerente' | <agente>: nivel máximo que puede conceder a otros }
//
// `mcpPara(empleado)` traduce todo eso a lo que necesita cada motor:
//   Claude: herramientas permitidas/vetadas exactas, archivo --mcp-config y variables de entorno.
//   Codex: argumentos -c mcp_servers.* (con enabled_tools / disabled_tools) y variables de entorno.
// Si la oficina conoce las herramientas de la conexión (descubiertas al probarla), el nivel se
// aplica herramienta por herramienta; si no, se permite la conexión entera y el nivel va como
// instrucción (y así se avisa en el panel).
import fs from 'node:fs';
import path from 'node:path';
import { herramientasDe } from './conexiones.mjs';

export const NIVELES = ['no', 'leer', 'escribir', 'todo'];
const rango = (n) => Math.max(0, NIVELES.indexOf(n));
const GIT = ['no', 'commits', 'push'];

export function crearMatriz({ RAIZ, conexiones, perfiles = () => ({}), perfilDe = () => 'general', auditar = () => {} }) {
  const RUTA = path.join(RAIZ, 'config', 'permisos-matriz.json');
  const escribir = (m) => { fs.mkdirSync(path.dirname(RUTA), { recursive: true }); fs.writeFileSync(`${RUTA}.tmp`, JSON.stringify(m, null, 2)); fs.renameSync(`${RUTA}.tmp`, RUTA); };

  /** La primera vez reproduce lo que ya había: Jira para todos (lo destructivo sigue vetado). */
  function leer() {
    let m = null;
    try { m = JSON.parse(fs.readFileSync(RUTA, 'utf8')); } catch {}
    if (!m) {
      m = { perfiles: {}, agentes: {}, otorgan: { gerente: 'escribir' } };
      for (const [nombre, p] of Object.entries(perfiles())) m.perfiles[nombre] = { conexiones: { atlassian: 'escribir' }, git: p.commits === false ? 'no' : 'commits', contratar: true, contactar: true };
      escribir(m);
      auditar({ quien: 'migracion', seccion: 'permisos', campos: { matriz: 'creada con los permisos que ya había' } });
    }
    m.perfiles ||= {}; m.agentes ||= {}; m.otorgan ||= {};
    return m;
  }

  /** Permisos efectivos de un agente: su perfil y, encima, sus excepciones. */
  function efectivo(empleado) {
    const m = leer();
    const perfil = perfilDe(empleado);
    const base = m.perfiles[perfil] || { conexiones: {}, git: 'commits', contratar: true, contactar: true };
    const propio = m.agentes[empleado] || {};
    return {
      perfil,
      conexiones: { ...(base.conexiones || {}), ...(propio.conexiones || {}) },
      git: propio.git ?? base.git ?? 'commits',
      contratar: propio.contratar ?? base.contratar ?? true,
      contactar: propio.contactar ?? base.contactar ?? true,
      excepciones: Object.keys(propio),
    };
  }

  function validarBloque(b, campo) {
    const mal = (x) => { throw Object.assign(new Error(`${campo}: ${x}`), { codigo: 400 }); };
    const fuera = {};
    if (b.conexiones !== undefined) {
      if (typeof b.conexiones !== 'object' || b.conexiones === null) mal('conexiones debe ser un objeto');
      fuera.conexiones = {};
      for (const [id, n] of Object.entries(b.conexiones)) { if (!/^[a-z][a-z0-9_]{1,30}$/.test(id) || !NIVELES.includes(n)) mal(`nivel no válido para ${id}`); fuera.conexiones[id] = n; }
    }
    if (b.git !== undefined) { if (!GIT.includes(b.git)) mal('git: no, commits o push'); fuera.git = b.git; }
    for (const k of ['contratar', 'contactar']) if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') mal(`${k}: verdadero o falso`); fuera[k] = b[k]; }
    return fuera;
  }

  /** El titular cambia un perfil, un agente (null = quitar sus excepciones) o quién otorga. */
  function guardar({ perfil, agente, bloque, otorgan }, quien = 'panel') {
    const m = leer();
    // Las conexiones se fusionan: cambiar una no borra las demás.
    const fusionar = (previo = {}, nuevo) => ({ ...previo, ...nuevo, ...(nuevo.conexiones ? { conexiones: { ...(previo.conexiones || {}), ...nuevo.conexiones } } : {}) });
    if (perfil) { m.perfiles[perfil] = fusionar(m.perfiles[perfil], validarBloque(bloque || {}, perfil)); auditar({ quien, seccion: 'permisos', campos: { [`perfil ${perfil}`]: bloque } }); }
    if (agente) {
      if (bloque === null) delete m.agentes[agente];
      else m.agentes[agente] = fusionar(m.agentes[agente], validarBloque(bloque || {}, agente));
      auditar({ quien, seccion: 'permisos', campos: { [`agente ${agente}`]: bloque ?? 'sin excepciones' } });
    }
    if (otorgan) {
      for (const [k, n] of Object.entries(otorgan)) if (!/^[a-z0-9-]{1,60}$/.test(k) || !NIVELES.includes(n)) throw Object.assign(new Error(`otorgan: nivel no válido para ${k}`), { codigo: 400 });
      m.otorgan = otorgan;
      auditar({ quien, seccion: 'permisos', campos: { otorgan } });
    }
    escribir(m);
    return m;
  }

  /** Nivel máximo que `quien` puede conceder (por su nombre o por ser gerente). */
  function puedeOtorgar(quien, esGerente) {
    const o = leer().otorgan;
    return [o[quien], esGerente ? o.gerente : null].filter(Boolean).sort((a, b) => rango(b) - rango(a))[0] || 'no';
  }

  /**
   * Un agente concede acceso a conexiones a otro (solicitud acceso-*.json). Nunca por encima de
   * su propio techo de otorgar ni de su propio nivel en esa conexión.
   */
  function otorgar(quien, esGerente, { empleado, conexiones: pedido = {} }) {
    const techo = puedeOtorgar(quien, esGerente);
    if (techo === 'no') throw Object.assign(new Error('No tienes permiso para otorgar accesos a conexiones.'), { codigo: 403 });
    const propio = efectivo(quien).conexiones;
    const limpio = validarBloque({ conexiones: pedido }, empleado).conexiones || {};
    for (const [id, n] of Object.entries(limpio)) {
      if (!conexiones.obtener(id)) throw Object.assign(new Error(`No existe la conexión «${id}».`), { codigo: 400 });
      if (rango(n) > rango(techo)) throw Object.assign(new Error(`Puedes otorgar como máximo «${techo}» (pediste «${n}» en ${id}).`), { codigo: 403 });
      if (rango(n) > rango(propio[id] || 'no')) throw Object.assign(new Error(`No puedes dar en ${id} más de lo que tú tienes («${propio[id] || 'no'}»).`), { codigo: 403 });
    }
    return guardar({ agente: empleado, bloque: { conexiones: { ...(leer().agentes[empleado]?.conexiones || {}), ...limpio } } }, quien);
  }

  /**
   * Lo que un motor necesita para este agente. `secreto(nombre)` da el valor en claro (solo para
   * el entorno del proceso hijo). `proyecto` limita a las conexiones de su proyecto.
   */
  function mcpPara(empleado, { proyecto = null, secreto = () => null, tope = 'todo' } = {}) {
    const ef = efectivo(empleado);
    const claude = { permitidas: [], vetadas: [], servidores: {} };
    const codex = { args: [] };
    const entorno = {};
    const avisos = [];
    const lineas = [];
    for (const c of conexiones.listar()) {
      if (!c.activa) continue;
      if (proyecto && !c.proyectos.includes('*') && !c.proyectos.includes(proyecto)) continue;
      // `tope`: los agentes de nivel básico no pasan de «leer».
      const pedido = ef.conexiones[c.id] || 'no';
      const nivel = rango(pedido) > rango(tope) ? tope : pedido;
      if (nivel === 'no') { claude.vetadas.push(`mcp__${c.id}`); continue; }
      const todas = herramientasDe(c);
      const permitidas = nivel === 'todo' ? todas : todas.filter((h) => (nivel === 'leer' ? h.tipo === 'lectura' : h.tipo !== 'destructiva'));
      const vetadas = todas.filter((h) => !permitidas.includes(h));
      if (nivel === 'todo' || !todas.length) {
        claude.permitidas.push(`mcp__${c.id}`);
        if (!todas.length && nivel !== 'todo') avisos.push(`${c.id}: sin lista de herramientas, el nivel «${nivel}» se aplica como instrucción`);
      } else {
        for (const h of permitidas) claude.permitidas.push(`mcp__${c.id}__${h.nombre}`);
        for (const h of vetadas) claude.vetadas.push(`mcp__${c.id}__${h.nombre}`);
      }
      lineas.push(`- ${c.nombre} (\`${c.id}\`): ${{ leer: 'solo lectura', escribir: 'leer y escribir, nada destructivo', todo: 'acceso completo' }[nivel]}.`);
      // Secretos → variables de entorno del proceso (nunca en la línea de comandos ni en archivos).
      const varToken = `OFI_MCP_${c.id.toUpperCase()}_TOKEN`;
      if (c.auth === 'token') { const v = secreto(c.secreto); if (v) entorno[varToken] = v; else avisos.push(`${c.id}: falta el secreto ${c.secreto}`); }
      for (const [variable, nombre] of Object.entries(c.entorno || {})) { const v = secreto(nombre); if (v) entorno[variable] = v; else avisos.push(`${c.id}: falta el secreto ${nombre}`); }
      // Claude: las OAuth se configuran en Claude al iniciar sesión (claude mcp add + /mcp) y se
      // usan tal cual; añadirlas aquí las duplicaría.
      if (c.auth !== 'oauth') {
        if (c.tipo === 'http') claude.servidores[c.id] = { type: 'http', url: c.url, ...(c.auth === 'token' ? { headers: { Authorization: `Bearer \${${varToken}}` } } : {}) };
        else claude.servidores[c.id] = { command: c.comando, args: c.args || [], env: Object.fromEntries(Object.keys(c.entorno || {}).map((k) => [k, `\${${k}}`])) };
      }
      // Codex.
      const k = `mcp_servers.${c.id}`;
      const toml = (v) => JSON.stringify(v);
      if (c.tipo === 'http') {
        codex.args.push('-c', `${k}.url=${toml(c.url)}`);
        if (c.auth === 'token') codex.args.push('-c', `${k}.bearer_token_env_var=${toml(varToken)}`);
      } else {
        codex.args.push('-c', `${k}.command=${toml(c.comando)}`, '-c', `${k}.args=${toml(c.args || [])}`);
        if (Object.keys(c.entorno || {}).length) codex.args.push('-c', `${k}.env_vars=${toml(Object.keys(c.entorno))}`);
      }
      if (nivel !== 'todo' && todas.length) {
        codex.args.push('-c', `${k}.enabled_tools=${toml(permitidas.map((h) => h.nombre))}`);
        if (vetadas.length) codex.args.push('-c', `${k}.disabled_tools=${toml(vetadas.map((h) => h.nombre))}`);
      }
    }
    const git = { no: ['Bash(git commit:*)', 'Bash(git add:*)', 'Bash(git checkout:*)', 'Bash(git switch:*)', 'Bash(git stash:*)', 'Bash(git restore:*)', 'Bash(git merge:*)', 'Bash(git push:*)'], commits: ['Bash(git push:*)'], push: [] }[ef.git];
    claude.vetadas.push(...git);
    const instruccion = `Conexiones que puedes usar:\n${lineas.length ? lineas.join('\n') : '- ninguna'}\nGit: ${{ no: 'no hagas commits ni cambies de rama', commits: 'puedes hacer commits, pero no push', push: 'puedes hacer commits y push (con instrucción específica para publicar)' }[ef.git]}.${ef.contactar ? '' : ' No pidas contactar personas del equipo.'}${ef.contratar ? '' : ' No pidas contrataciones.'}`;
    return { efectivo: ef, claude, codex, entorno, avisos, instruccion };
  }

  return { leer, efectivo, guardar, puedeOtorgar, otorgar, mcpPara };
}
