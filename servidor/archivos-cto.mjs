// MCP local sin terminal, red, borrados ni ejecución de código del repositorio.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (root, target) => { const r = path.relative(root, target); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const forbidden = /^(?:\.git|\.codex|\.agents|\.github|node_modules|dist|coverage|\.angular|\.nx|\.cache|skills|secrets?|credentials?)$|^\.env(?:\.|$)|^(?:AGENTS|CLAUDE)\.md$|^(?:auth|permisos)\.json$|\.(?:pem|key|pfx|p12|db|sqlite|log)$/i;
const extensions = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.scss', '.sass', '.sql', '.yaml', '.yml', '.toml', '.txt', '.svg']);
const maxBytes = 1024 * 1024;

export function createBridge({ repo, employee, write = false, audit = () => {} }) {
  repo = fs.realpathSync(repo); employee = fs.realpathSync(employee);
  const office = fs.realpathSync(path.resolve(employee, '../..'));
  function resolve(scope, relative, mutation = false, rules = false) {
    const root = { repo, employee, office }[scope];
    if (!root || typeof relative !== 'string' || relative.includes('\0') || /[:]/.test(relative) || path.isAbsolute(relative)) throw Error('Ruta relativa o alcance inválido');
    const parts = relative.replaceAll('\\', '/').split('/').filter(p => p !== '' && p !== '.');
    if (parts.includes('..') || parts.some((p, i) => /[. ]$/.test(p) || (forbidden.test(p) && !(rules && (/^(?:AGENTS|CLAUDE)\.md$|^skills$/i.test(p) || p === '.agents' && parts[i + 1] === 'skills'))))) throw Error('Ruta protegida');
    if (scope === 'office' && parts.length && !['empleados', 'reuniones', 'OFICINA.md'].includes(parts[0])) throw Error('Lectura de oficina fuera de alcance');
    const target = path.resolve(root, ...parts);
    if (!inside(root, target)) throw Error('Ruta fuera de alcance');
    let cursor = root;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      if (fs.existsSync(cursor)) {
        const stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink() || !inside(root, fs.realpathSync(cursor)) || (stat.isFile() && stat.nlink > 1)) throw Error('Enlaces no permitidos');
      }
    }
    if (mutation) {
      if (!write || scope === 'office') throw Error('Escritura no autorizada');
      if (!extensions.has(path.extname(target).toLowerCase())) throw Error('Tipo de archivo no permitido');
      if (scope === 'employee' && !(parts.length === 1 && ['registro.md', 'memoria.md'].includes(parts[0]) || ['informes', 'trabajo', 'bandeja', 'encargos'].includes(parts[0]))) throw Error('Solo registro y trabajo del CTO');
      if (scope === 'repo') {
        const branch = git(['branch', '--show-current']).trim();
        if (!branch || /^(main|master|production|release)$/i.test(branch)) throw Error('Se requiere una rama de trabajo, distinta de main');
        if (!['backend', 'lis-platform-fe', 'docs'].includes(parts[0])) throw Error('Solo código y documentación del proyecto');
      }
    }
    return target;
  }
  function git(args) {
    return execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', ...args], { cwd: repo, windowsHide: true, timeout: 15000, maxBuffer: 2 * maxBytes, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_EXTERNAL_DIFF: '' } });
  }
  function bytes(file) {
    const s = fs.statSync(file);
    if (!s.isFile() || s.size > maxBytes || !extensions.has(path.extname(file).toLowerCase())) throw Error('Solo archivos de texto de hasta 1 MiB');
    const b = fs.readFileSync(file);
    if (b.includes(0)) throw Error('Archivo binario no permitido');
    return b;
  }
  function call(name, args = {}) {
    if (name === 'project_status') return { branch: git(['branch', '--show-current']).trim(), status: git(['status', '--short']), commits: git(['log', '-5', '--oneline']), capabilities: { read: true, write, shell: false, jira: false, delete: false } };
    const { scope = 'repo', file = '' } = args;
    if (name === 'project_diff') {
      const base = args.base;
      if (base !== undefined && (typeof base !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$/.test(base))) throw Error('Referencia Git inválida');
      if (file) {
        const target = resolve('repo', file);
        if (!extensions.has(path.extname(target).toLowerCase())) throw Error('Solo diferencias de texto');
        return { diff: git(['diff', '--no-ext-diff', '--no-textconv', ...(base ? [base] : []), '--', file]) };
      }
      return { files: git(['diff', '--no-ext-diff', '--no-textconv', '--name-only', ...(base ? [base] : []), '--', 'backend', 'lis-platform-fe', 'docs']) };
    }
    if (name === 'list_files') {
      const dir = resolve(scope, file);
      return fs.readdirSync(dir, { withFileTypes: true }).filter(d => !forbidden.test(d.name) && !d.isSymbolicLink()).slice(0, 500).map(d => ({ name: d.name, directory: d.isDirectory() }));
    }
    if (name === 'read_file') {
      // Las reglas son legibles; nunca editables. También se rechazan sus enlaces.
      const target = resolve(scope, file, false, true);
      const b = bytes(target);
      const lines = b.toString('utf8').split('\n');
      const start = Number.isInteger(args.startLine) ? Math.max(1, args.startLine) : 1;
      const count = Number.isInteger(args.lineCount) ? Math.min(800, Math.max(1, args.lineCount)) : 400;
      return { sha256: hash(b), totalLines: lines.length, startLine: start, content: lines.slice(start - 1, start - 1 + count).join('\n') };
    }
    if (name === 'write_file') {
      const target = resolve(scope, file, true);
      if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > maxBytes || args.content.includes('\0')) throw Error('Contenido inválido o demasiado grande');
      const exists = fs.existsSync(target);
      const before = exists ? hash(bytes(target)) : null;
      if (args.expectedSha256 !== before) throw Error('El archivo cambió o falta su SHA-256; vuelve a leerlo antes de editar');
      // Auditar antes de mutar: si el registro no está disponible, no se escribe.
      audit({ operation: 'write_requested', scope, file, before, after: hash(args.content) });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      resolve(scope, file, true);
      fs.writeFileSync(target, args.content, { flag: exists ? 'r+' : 'wx' });
      if (exists) fs.truncateSync(target, Buffer.byteLength(args.content));
      audit({ operation: 'write_completed', scope, file, sha256: hash(args.content) });
      return { written: true, sha256: hash(args.content) };
    }
    throw Error('Herramienta no permitida');
  }
  return { call };
}

const pathSchema = { scope: { type: 'string', enum: ['repo', 'employee', 'office'] }, file: { type: 'string', description: 'Ruta relativa al alcance; nunca una ruta absoluta.' } };
export const tools = [
  { name: 'project_status', description: 'Rama, cambios y commits actuales. Sin modificar Git.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'project_diff', description: 'Diferencias Git de un archivo permitido, o nombres de archivos cambiados si file está vacío. base opcional, por ejemplo origin/main. Sin ejecutar filtros ni programas externos.', inputSchema: { type: 'object', properties: { file: { type: 'string' }, base: { type: 'string' } }, additionalProperties: false } },
  { name: 'list_files', description: 'Lista un directorio permitido, hasta 500 entradas.', inputSchema: { type: 'object', properties: pathSchema, required: ['scope', 'file'], additionalProperties: false } },
  { name: 'read_file', description: 'Lee texto y devuelve SHA-256 para editar sin sobrescribir cambios ajenos. Permite leer reglas y skills.', inputSchema: { type: 'object', properties: { ...pathSchema, startLine: { type: 'integer' }, lineCount: { type: 'integer' } }, required: ['scope', 'file'], additionalProperties: false } },
  { name: 'write_file', description: 'Crea o reemplaza un archivo autorizado. expectedSha256 debe coincidir con la lectura; usa null para un archivo nuevo. Sin borrados ni cambios en main.', inputSchema: { type: 'object', properties: { ...pathSchema, content: { type: 'string' }, expectedSha256: { type: ['string', 'null'] } }, required: ['scope', 'file', 'content', 'expectedSha256'], additionalProperties: false } },
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [repo, employee, mode, auditFile] = process.argv.slice(2);
  const bridge = createBridge({ repo, employee, write: mode === 'write', audit: event => fs.appendFileSync(auditFile, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n') });
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!Object.hasOwn(msg, 'id')) return;
    const send = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...value }) + '\n');
    if (msg.method === 'initialize') return send({ result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oficina-archivos-cto', version: '1.0.0' } } });
    if (msg.method === 'ping') return send({ result: {} });
    if (msg.method === 'tools/list') return send({ result: { tools: mode === 'write' ? tools : tools.filter(t => t.name !== 'write_file') } });
    if (msg.method !== 'tools/call') return send({ error: { code: -32601, message: 'Método no permitido' } });
    try { send({ result: { content: [{ type: 'text', text: JSON.stringify(bridge.call(msg.params.name, msg.params.arguments)) }] } }); }
    catch (e) { send({ result: { isError: true, content: [{ type: 'text', text: e.message }] } }); }
  });
}
