import fs from 'node:fs';
import path from 'node:path';
import { enElPath, ES_WINDOWS } from './plataforma.mjs';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { reglaPerfil, mcpDeEmpleado } from './perfiles.mjs';
import { crearContextos } from './contextos.mjs';
import { configDe } from './config.mjs';
const raiz = path.resolve(import.meta.dirname, '..');
// La política vive en config/motores.json (Área de configuración). motor.json queda como
// origen de la migración y ya no se escribe.
const politica = () => configDe(raiz).leer('motores');

/** «auto», o el motor fijado en modo manual («claude» | «codex»). */
export function motorActual() {
  const p = politica();
  return p.modo === 'auto' ? 'auto' : p.manual;
}
// Cuántos agentes trabajan a la vez. Más en paralelo agotan la cuota en horas; los demás esperan en cola.
export function maxSimultaneos() { return politica().simultaneos; }
export function buscarCodex() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  let bin = process.env.CODEX_BIN || process.env.CODEX_APP_RUNTIME_CLI_PATH;
  if (!bin) {
    try {
      bin = fs.readdirSync(base).map(d => path.join(base, d, 'codex.exe'))
        .filter(p => fs.existsSync(p)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    } catch {}
  }
  return bin || (ES_WINDOWS ? undefined : enElPath('codex') || undefined);
}
/** ¿Hay Codex en este equipo? (aplicación de escritorio o instalación por npm). */
export function codexInstalado() {
  return !!buscarCodex() || fs.existsSync(path.join(process.env.APPDATA || '', 'npm/node_modules/@openai/codex/bin/codex.js'));
}
export function correrCodex({ cwd, prompt, sistema = '', escribir = false, total = null, alTexto, alHerramienta, limiteMs = 600000 }) {
  const bin = buscarCodex();
  const cli = path.join(process.env.APPDATA || '', 'npm/node_modules/@openai/codex/bin/codex.js');
  const args = ['exec', '--ignore-user-config', '--model', 'gpt-6.1-terra', '-c', 'model_reasoning_effort="low"', '--ephemeral', '--skip-git-repo-check', '--json', '--color', 'never', '--sandbox', escribir && !total ? 'workspace-write' : 'read-only', '-c', 'windows.sandbox="unelevated"'];
  const ficha = total?.ficha || path.join(cwd, 'CLAUDE.md');
  const carpetaEmpleado = total?.ficha ? path.dirname(total.ficha) : cwd;
  let capacidades = '';
  if (!total && escribir && path.resolve(carpetaEmpleado) === path.join(raiz, 'empleados', 'supervisor')) {
    const registros = path.join(raiz, 'logs', 'coordinador');
    fs.mkdirSync(registros, { recursive: true });
    args.push('--add-dir', registros);
    capacidades = 'Puedes consultar y actualizar los registros de logs/coordinador. Registra solo señales verificadas, con su fecha original y caducidad; no reemplaces un dato más reciente por uno antiguo ni inventes disponibilidad o porcentaje.';
  }
  if (total) {
    // Mismo nivel que Claude «total» (decisión del titular): escribe en el
    // proyecto y en las carpetas de la oficina, con terminal y subagentes. Los vetos
    // los impone el sandbox: la red de la terminal queda apagada (sin push, gh,
    // despliegues ni descargas) y servidor/ y scripts/ quedan fuera de lo escribible.
    const permisos = JSON.parse(fs.readFileSync(path.join(carpetaEmpleado, 'permisos.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (permisos.nivel !== 'total') throw Error('Este empleado no tiene permisos totales');
    // Carpetas del proyecto (contexto) del agente: sus empleados y contrataciones.
    const ctx = crearContextos({ RAIZ: raiz }).deEmpleado(path.basename(carpetaEmpleado));
    const contrataciones = ctx ? ctx.contrataciones : path.join(raiz, 'contrataciones');
    fs.mkdirSync(contrataciones, { recursive: true });
    args[args.indexOf('--sandbox') + 1] = 'workspace-write';
    args.push('--add-dir', ctx ? ctx.empleados : path.join(raiz, 'empleados'), '--add-dir', contrataciones);
    if (ES_WINDOWS) args.push('-c', 'windows.sandbox="unelevated"');
    args.push('-c', 'features.multi_agent=true');
    let vetos = [];
    try { vetos = JSON.parse(fs.readFileSync(path.join(raiz, 'servidor', 'vetado-total.json'), 'utf8').replace(/^\uFEFF/, '')).herramientas.filter((v) => v.startsWith('Bash(')).map((v) => v.slice(5, -3)); } catch {}
    capacidades = `Puedes solicitar terminal, edición del proyecto (${cwd}), carpetas de empleados y contrataciones, y subagentes; el acceso efectivo depende del entorno y sus permisos. Lee primero AGENTS.md, docs/ai/README.md y las skills aplicables del proyecto. Respeta las restricciones ajenas a Git: ${vetos.join(', ')}. No edites servidor/, scripts/, config/, permisos.json, AGENTS.md ni las skills, y no leas .env ni config/ (secretos y configuración del titular). Jira se configura mediante el servidor MCP atlassian y requiere autenticación y acceso de red; si falla, registra el error y no afirmes que lo usaste. No publiques, envíes mensajes ni ejecutes acciones externas sin autorización específica. Nunca declares haber hecho algo que no hiciste. Git: en este entorno .git es de solo lectura, así que no intentes crear ramas, commits ni stash ni te bloquees por eso; trabaja en la rama actual, deja los cambios en el árbol de trabajo y anota en tu resultado qué archivos quedan listos para commit y con qué mensaje: un agente con Claude hará los commits. Compilaciones y pruebas largas: ejecútalas con un tiempo de espera amplio y, si no terminan, dilo con el comando exacto para que otro las repita. ${reglaPerfil(total.empleado || path.basename(carpetaEmpleado))}`;
  }
  // Conexiones MCP según la matriz de permisos (--ignore-user-config no carga las personales);
  // los agentes de nivel básico, solo lectura. Los secretos van por entorno del proceso.
  const mcp = mcpDeEmpleado(path.basename(carpetaEmpleado), { tope: total ? 'todo' : 'leer' });
  args.push(...mcp.codex.args);
  if (mcp.instruccion) capacidades = `${capacidades} ${mcp.instruccion}`.trim();
  args.push('-');
  const contexto = fs.existsSync(ficha) ? fs.readFileSync(ficha, 'utf8') : '';
  const oficina = fs.readFileSync(path.join(raiz, 'OFICINA.md'), 'utf8');
  const memoriaRuta = path.join(carpetaEmpleado, 'memoria.md');
  const memoria = fs.existsSync(memoriaRuta) ? fs.readFileSync(memoriaRuta, 'utf8') : '(No existe memoria para esta ejecución.)';
  const child = spawn(bin || process.execPath, bin ? args : [cli, ...args], { cwd, windowsHide: true, env: { ...process.env, ...mcp.entorno } });
  child.stdin.on('error', () => {});
  child.stdin.end(`A continuación se incluye el contenido actual de las reglas de la oficina, la ficha y la memoria, leído por el servidor al inicio de esta ejecución. Si necesitas modificarlos, comprueba primero el acceso a los archivos.\n\n--- OFICINA.md ---\n${oficina}\n\n--- Ficha ---\n${contexto}\n\n--- memoria.md ---\n${memoria}\n\n${sistema}\n${capacidades}\n${prompt}`);
  const promesa = new Promise(resolve => {
    let buffer = '', texto = '', error = '', diagnostico = '';
    const decoder = new StringDecoder('utf8');
    const timer = setTimeout(() => { error = 'Tiempo de ejecución agotado'; child.kill(); }, limiteMs);
    function evento(linea) {
      let ev; try { ev = JSON.parse(linea); } catch { return; }
      if (ev.type === 'turn.failed' || ev.type === 'error') error = ev.error?.message || ev.message || 'Falló Codex';
      const item = ev.item;
      if (ev.type === 'item.completed' && item?.type === 'agent_message') { const delta = (texto ? '\n\n' : '') + item.text; texto += delta; alTexto?.(delta); }
      else if (ev.type === 'item.started') alHerramienta?.({ texto: `Codex: ${item?.type || 'trabajando'}`, clase: 'pensar' });
    }
    child.stdout.on('data', chunk => { buffer += decoder.write(chunk); const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(evento); });
    child.stderr.on('data', chunk => { diagnostico = (diagnostico + chunk.toString('utf8')).slice(-4000); });
    child.on('error', e => { error = e.message; });
    child.on('close', codigo => { clearTimeout(timer); evento(buffer + decoder.end()); resolve({ texto, codigo: error ? (codigo || 1) : (codigo ?? 1), error: error || (codigo !== 0 ? diagnostico : ''), diagnostico }); });
  });
  return { child, promesa };
}

