// Cuentas de Codex del equipo, SOLO LECTURA. Codex guarda la sesión activa en ~/.codex/auth.json
// y las demás cuentas como auth_<etiqueta>.json (las rota otra herramienta). La oficina:
//   - cuenta cuántas hay y cuál está activa (mismo account_id que auth.json),
//   - recuerda la última cuota leída de cada una (cuando estuvo activa),
//   - nunca copia, mueve ni reescribe esos archivos: los tokens de refresco son de un solo uso
//     y usar una copia podría cerrar la sesión de esa cuenta.
// Nada de lo que sale de aquí contiene tokens; la cuenta se identifica por un hash corto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const dirCodex = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const hash = (id) => crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 16);

function leerAuth(ruta) {
  try {
    const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    const id = j?.tokens?.account_id;
    // Solo datos de presentación del id_token (correo y plan); la firma no se usa para nada.
    let email = null, plan = null;
    try {
      const carga = JSON.parse(Buffer.from(String(j.tokens.id_token).split('.')[1], 'base64url').toString('utf8'));
      email = carga.email || null;
      plan = carga['https://api.openai.com/auth']?.chatgpt_plan_type || null;
    } catch { /* sin id_token legible */ }
    return { cuenta: id ? hash(id) : null, email, plan, refresco: j?.last_refresh || null, modo: j?.auth_mode || null };
  } catch { return null; }
}

/**
 * `RAIZ` para el registro de lecturas (logs/coordinador/cuentas-codex.json).
 * `dir` permite probar con una carpeta falsa.
 */
export function crearCuentasCodex({ RAIZ, dir = dirCodex }) {
  const LECTURAS = path.join(RAIZ, 'logs', 'coordinador', 'cuentas-codex.json');
  const leerLecturas = () => { try { return JSON.parse(fs.readFileSync(LECTURAS, 'utf8')); } catch { return {}; } };

  const activa = () => leerAuth(path.join(dir(), 'auth.json'));

  /** Guarda la cuota recién leída para la cuenta que está activa en este momento. */
  function registrarLectura(datos) {
    const a = activa();
    if (!a?.cuenta) return false;
    const ventanas = [datos?.primary, datos?.secondary].filter((v) => Number.isFinite(v?.usedPercent))
      .map((v) => ({ minutos: Number(v.windowDurationMins) || null, porcentaje: Math.round(v.usedPercent), reinicia: Number(v.resetsAt) ? new Date(Number(v.resetsAt) * 1000).toISOString() : null }));
    if (!ventanas.length) return false;
    const todas = leerLecturas();
    todas[a.cuenta] = { ventanas, observado: new Date().toISOString() };
    fs.mkdirSync(path.dirname(LECTURAS), { recursive: true });
    fs.writeFileSync(LECTURAS, JSON.stringify(todas, null, 2));
    return true;
  }

  /** Cuentas guardadas, cuál está activa y su última cuota conocida. */
  function listar() {
    let archivos = [];
    try { archivos = fs.readdirSync(dir()).filter((f) => /^auth_[\w.-]+\.json$/.test(f)).sort(); } catch { /* sin Codex */ }
    const act = activa();
    const lecturas = leerLecturas();
    const cuentas = archivos.map((f) => {
      const a = leerAuth(path.join(dir(), f)) || {};
      return { etiqueta: f.replace(/^auth_|\.json$/g, '').replace(/_/g, ' '), cuenta: a.cuenta, email: a.email, plan: a.plan,
        activa: !!(act?.cuenta && a.cuenta === act.cuenta), ultimaCuota: (a.cuenta && lecturas[a.cuenta]) || null, valida: !!a.cuenta };
    });
    // La sesión activa puede no tener copia guardada.
    if (act?.cuenta && !cuentas.some((c) => c.activa)) {
      cuentas.unshift({ etiqueta: 'sesión activa (sin copia guardada)', cuenta: act.cuenta, email: act.email, plan: act.plan, activa: true, ultimaCuota: lecturas[act.cuenta] || null, valida: true });
    }
    return { carpeta: dir(), hayActiva: !!act?.cuenta, total: cuentas.length, validas: cuentas.filter((c) => c.valida).length, cuentas };
  }

  return { listar, registrarLectura };
}
