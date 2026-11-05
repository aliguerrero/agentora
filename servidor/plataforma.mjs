// Lo que cambia entre Windows y Linux: buscar programas, terminar procesos, formato de las reglas de
// Claude y dónde guarda Linux la clave de los secretos. El resto de la oficina no pregunta por el
// sistema operativo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ES_WINDOWS = process.platform === 'win32';

/** Ruta de un programa en el PATH, o null. `valida` descarta resultados (p. ej. un .cmd en Windows). */
export function enElPath(programa, valida = () => true) {
  try {
    const r = spawnSync(ES_WINDOWS ? 'where.exe' : 'which', [programa], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    return String(r.stdout || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l && valida(l)) || null;
  } catch { return null; }
}

/** Claude: variable explícita, instalación por npm, instalador nativo o lo que haya en el PATH. */
export function buscarClaude() {
  const candidatos = ES_WINDOWS
    ? [
      process.env.CLAUDE_BIN,
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
      enElPath('claude', (l) => /\.exe$/i.test(l)),
    ]
    : [process.env.CLAUDE_BIN, path.join(os.homedir(), '.local', 'bin', 'claude'), enElPath('claude')];
  return candidatos.find((p) => p && fs.existsSync(p)) || null;
}

/**
 * Termina un proceso y lo que lanzó. En Linux, un trabajo lanzado por el servidor encabeza su propio
 * grupo; uno lanzado de otra forma recibe SIGTERM y termina a su motor antes de salir.
 */
export function matarArbol(pid, alTerminar = () => {}) {
  if (ES_WINDOWS) {
    const t = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    t.on('error', () => alTerminar(false));
    t.on('close', () => alTerminar(true));
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch {
    try { process.kill(pid, 'SIGTERM'); } catch { /* ya no está */ }
  }
  setTimeout(() => alTerminar(true), 1000).unref?.();
}

/** Formato de ruta absoluta en los permisos de Claude Code: //c/Users/... o //home/... */
export const rutaRegla = (p) => `//${path.resolve(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^([A-Za-z]):/, (_, l) => l.toLowerCase())}`;

/** Carpeta de la clave de los secretos en Linux. Fuera de la oficina, para que una copia no la lleve. */
export const carpetaClave = () => (ES_WINDOWS ? null : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'oficina-devbox'));
