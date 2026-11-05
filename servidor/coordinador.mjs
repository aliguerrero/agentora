import fs from 'node:fs';
import path from 'node:path';
import { configDe } from './config.mjs';

const raiz = path.resolve(import.meta.dirname, '..');
const carpeta = path.join(raiz, 'logs', 'coordinador');
const ruta = motor => path.join(carpeta, `${motor}.json`);
const ahora = () => Date.now();
// Formato de fechas del titular (config general.locale); lo fija el servidor al arrancar.
let LOCALE = 'es';
export function fijarLocale(l) { if (l) LOCALE = l; }
export const otroMotor = m => (m === 'claude' ? 'codex' : 'claude');

export function estadoMotor(motor) {
  try {
    const e = JSON.parse(fs.readFileSync(ruta(motor), 'utf8'));
    if (e.hasta && e.hasta > ahora()) return e;
    if (e.estado === 'disponible' && e.vence > ahora()) return e;
  } catch {}
  return { estado: 'desconocido' };
}
/** Última lectura guardada aunque ya haya caducado (para mostrarla con su fecha), o null. */
export function ultimaLectura(motor) {
  try { return JSON.parse(fs.readFileSync(ruta(motor), 'utf8')); } catch { return null; }
}
const ETIQUETAS_CLAUDE = { five_hour: '5 horas', seven_day: 'Semanal', seven_day_opus: 'Semanal (Opus)', seven_day_sonnet: 'Semanal (Sonnet)' };
const etiquetaMinutos = (m) => (m === 300 ? '5 horas' : m === 10080 ? 'Semanal' : m ? (m % 1440 === 0 ? `${m / 1440} días` : `${Math.round(m / 60)} horas`) : 'Ventana');
/** Ventanas de uso normalizadas para el panel: [{ etiqueta, porcentaje, reinicia (ISO) }]. */
export function ventanasDe(lectura) {
  return (lectura?.ventanas || []).map((v) => ({
    etiqueta: v.nombre ? (ETIQUETAS_CLAUDE[v.nombre] || v.nombre.replace(/_/g, ' ')) : etiquetaMinutos(Number(v.windowDurationMins) || v.minutos),
    porcentaje: Math.max(0, Math.min(100, Math.round(Number(v.usedPercent ?? v.porcentaje)))),
    reinicia: Number(v.resetsAt) ? new Date(Number(v.resetsAt) * 1000).toISOString() : v.reinicia || null,
  }));
}
export function registrarCuotaCodex(datos) {
  const ventanas = [datos?.primary, datos?.secondary].filter(v => Number.isFinite(v?.usedPercent));
  if (!ventanas.length) return false;
  const maximo = Math.max(...ventanas.map(v => v.usedPercent));
  const umbral = umbralReserva();
  const agotadas = ventanas.filter(v => v.usedPercent >= umbral);
  const reinicios = agotadas.map(v => Number(v.resetsAt) * 1000).filter(t => t > ahora());
  const estado = maximo >= 100 ? 'limite' : maximo >= umbral ? 'reserva' : 'disponible';
  const e = { estado, observado: new Date().toISOString(), porcentajeUsado: maximo, ventanas, vence: ahora() + 10 * 60e3 };
  if (estado !== 'disponible') e.hasta = Math.min(ahora() + 10 * 60e3, ...(reinicios.length ? reinicios : [Infinity]));
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(ruta('codex'), JSON.stringify(e));
  return true;
}
// Claude publica su cuota al empezar cada ejecución (rate_limit_event). Con una
// ventana sobre el 85 % entra en «reserva»: el trabajo nuevo va a Codex antes de
// que Claude se corte a mitad de una tarea. `cuando` evita que un log viejo pise
// un estado más reciente.
export const UMBRAL_RESERVA = 85; // por defecto; el vigente está en config/motores.json
export function umbralReserva() { try { return politicaMotores().umbralReserva; } catch { return UMBRAL_RESERVA; } }
export function registrarCuotaClaude(info, cuando = ahora()) {
  const UMBRAL = umbralReserva();
  const ventanas = Object.entries(info?.unifiedWindows || {})
    .map(([nombre, v]) => ({ nombre, usedPercent: Number(v?.utilization) * 100, resetsAt: Number(v?.resetsAt) }))
    .filter(v => Number.isFinite(v.usedPercent));
  if (!ventanas.length && info?.status !== 'rejected') return false;
  try { if (Date.parse(JSON.parse(fs.readFileSync(ruta('claude'), 'utf8')).observado) >= cuando) return false; } catch {}
  const maximo = info?.status === 'rejected' ? 100 : Math.max(...ventanas.map(v => v.usedPercent));
  const estado = maximo >= 100 ? 'limite' : maximo >= UMBRAL ? 'reserva' : 'disponible';
  const e = { estado, observado: new Date(cuando).toISOString(), porcentajeUsado: Math.round(maximo), ventanas, vence: cuando + 30 * 60e3 };
  if (estado !== 'disponible') {
    const altas = ventanas.filter(v => v.usedPercent >= UMBRAL);
    const reinicio = Math.max(0, ...altas.map(v => v.resetsAt * 1000), Number(info?.resetsAt) * 1000 || 0);
    e.hasta = reinicio > ahora() ? reinicio : ahora() + 30 * 60e3;
    e.detalle = `Claude al ${e.porcentajeUsado} % (${altas.map(v => v.nombre).join(', ') || 'límite'}); trabajo nuevo a Codex hasta el ${new Date(e.hasta).toLocaleString(LOCALE)}.`;
  }
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(ruta('claude'), JSON.stringify(e));
  return true;
}
// Los logs actuales son UTF-8; los antiguos, de PowerShell 5.1, UTF-16LE con BOM.
export function leerLog(rutaLog) {
  const b = fs.readFileSync(rutaLog);
  if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
  const nulos = b.subarray(0, 200).filter((x) => x === 0).length;
  return nulos > 40 ? b.toString('utf16le') : b.toString('utf8');
}
const eventos = (texto, tipo) => texto.split(/\r?\n/).filter(l => l.includes(`"type":"${tipo}"`))
  .map(l => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch { return null; } }).filter(Boolean);
// Lee del log la última cuota publicada por Claude y la registra.
export function cuotaDesdeLog(rutaLog) {
  try {
    const info = eventos(leerLog(rutaLog), 'rate_limit_event').pop()?.rate_limit_info;
    return info ? registrarCuotaClaude(info, fs.statSync(rutaLog).mtimeMs) : false;
  } catch { return false; }
}
// Resumen del evento final de Claude: pasos usados, costo y si se cortó por el tope de pasos.
export function resumenDeLog(rutaLog) {
  try {
    const r = eventos(leerLog(rutaLog), 'result').pop();
    if (!r) return {};
    return { subtipo: r.subtype || null, turnos: r.num_turns ?? null, costo: r.total_cost_usd ?? null, duracionMs: r.duration_ms ?? null };
  } catch { return {}; }
}
export function detectarLimite(texto = '') {
  return /hit your (?:session|usage|rate|weekly) limit|usage limit (?:reached|exceeded)|rate limit (?:reached|exceeded)|you've reached (?:your|the) (?:usage|rate) limit|insufficient_quota|rate_limit_exceeded/i.test(texto);
}
// «resets 12:30am» / «resets 3pm» → próxima ocurrencia de esa hora local.
function horaDeReinicio(texto = '') {
  const m = String(texto).match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12; if (m[3].toLowerCase() === 'pm') h += 12;
  const d = new Date(); d.setHours(h, Number(m[2] || 0), 0, 0);
  if (d.getTime() <= ahora()) d.setDate(d.getDate() + 1);
  return d.getTime() + 60e3;
}
// Devuelve true si el motor comunicó un límite (en el error o en el texto).
export function registrarResultado(motor, resultado = {}) {
  const todo = `${resultado.error || ''}\n${resultado.texto || ''}`;
  if (!detectarLimite(todo)) return false;
  fs.mkdirSync(carpeta, { recursive: true });
  const reinicio = horaDeReinicio(todo);
  const e = { estado: 'limite', observado: new Date().toISOString(), hasta: reinicio || ahora() + 30 * 60e3,
    detalle: reinicio ? `Límite comunicado por el motor; se reinicia el ${new Date(reinicio).toLocaleString(LOCALE)}.` : 'Límite comunicado por el motor; revisión en 30 minutos.' };
  fs.writeFileSync(ruta(motor), JSON.stringify(e));
  return true;
}
export function registrarLimiteInformado(motor, minutos = 30) {
  if (!['claude', 'codex'].includes(motor)) throw new Error('Motor inválido');
  fs.mkdirSync(carpeta, { recursive: true });
  const e = { estado: 'limite', observado: new Date().toISOString(), hasta: ahora() + minutos * 60000, detalle: 'Límite informado por el titular; se volverá a evaluar, sin afirmar que se haya restablecido.' };
  fs.writeFileSync(ruta(motor), JSON.stringify(e));
}
// «desconocido» cuenta como disponible: Claude no publica su cuota y solo sabemos
// de su límite cuando lo comunica. En auto, la programación y los agentes con
// permisos totales prefieren Claude; lo demás, Codex; si el preferido está en
// límite (o en reserva), pasa al otro. En manual, el elegido salvo límite.
// Política (config/motores.json): motores activos, relevo, preferencias y umbral de reserva.
export function politicaMotores() { return configDe(raiz).leer('motores'); }

/**
 * `modo`: «auto» o un motor concreto (manual). `relevo: true` cuando se pide el otro motor
 * porque el primero se quedó sin cuota a mitad de un trabajo: solo procede si la política
 * tiene el relevo activo. Un motor desactivado nunca se elige.
 */
export function elegirMotor({ modo = 'auto', empleado = '', texto = '', requiereEscrituraTotal = false, relevo = false, politica = politicaMotores(), estado = estadoMotor } = {}) {
  const activo = (m) => politica[`${m}Activo`] !== false;
  if (modo !== 'auto') {
    if (relevo && !politica.relevo) return { motor: null, motivo: 'El relevo entre motores está desactivado en la configuración.' };
    if (!activo(modo)) return { motor: null, motivo: `${modo} está desactivado en la configuración.` };
  }
  const programacion = requiereEscrituraTotal || /\b(programar|programaci[oó]n|implementa|implementaci[oó]n|c[oó]digo|desarroll[oa]|backend|frontend|bug|arregla|importante|cr[ií]tic[ao])\b/i.test(texto);
  const tipo = programacion || empleado === 'cto' ? 'programación o trabajo prioritario' : 'investigación o trabajo general';
  let preferido = modo === 'auto' ? (programacion || empleado === 'cto' ? politica.programacion : politica.general) : modo;
  let otro = otroMotor(preferido);
  if (modo === 'auto' && !activo(preferido)) {
    if (!activo(otro)) return { motor: null, motivo: 'Los dos motores están desactivados en la configuración.' };
    [preferido, otro] = [otro, preferido];
  }
  // En auto el otro motor solo entra si está activo y el relevo está permitido.
  const otroPermitido = modo === 'auto' && activo(otro) && politica.relevo;
  const libre = m => !['limite', 'reserva'].includes(estado(m).estado);
  const usable = m => estado(m).estado !== 'limite';
  const permitido = modo === 'auto' ? libre : usable;
  if (permitido(preferido)) return { motor: preferido, motivo: modo === 'auto' ? tipo : relevo ? 'relevo del otro motor' : 'selección manual' };
  if (otroPermitido && libre(otro)) return { motor: otro, motivo: `${preferido} está en límite o reserva; continúa ${otro}` };
  // Los dos en reserva (o uno en límite y el otro en reserva): se gasta la reserva antes que parar.
  if (modo === 'auto' && usable(preferido)) return { motor: preferido, motivo: otroPermitido ? `${otro} no está libre; ${preferido} usa su reserva` : `${preferido} usa su reserva (relevo desactivado)` };
  if (otroPermitido && usable(otro)) return { motor: otro, motivo: `${preferido} está en límite; ${otro} usa su reserva` };
  return { motor: null, motivo: modo === 'auto'
    ? (otroPermitido ? 'Los dos motores están en límite; el trabajo queda pendiente hasta que uno se libere.' : `${preferido} está en límite y el relevo está desactivado; el trabajo queda pendiente.`)
    : `${preferido} está en límite y el motor está fijado manualmente; cambia a «auto» para que continúe ${otro}.` };
}
export function registrarDecision({ empleado, motor, motivo }) {
  fs.mkdirSync(carpeta, { recursive: true });
  fs.appendFileSync(path.join(carpeta, 'decisiones.jsonl'), JSON.stringify({ fecha: new Date().toISOString(), empleado, motor, motivo }) + '\n');
}
