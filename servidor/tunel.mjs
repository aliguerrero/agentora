// Acceso desde otros dispositivos: abre un túnel hacia el servidor local, a petición del titular.
//
//   - Tailscale (`tailscale serve`): privado, solo entran los equipos de su red.
//   - Cloudflare (Quick Tunnel): enlace público; según Cloudflare no admite SSE, lo que usan los
//     chats y las reuniones para llegar en directo.
//
// El servidor sigue escuchando solo en 127.0.0.1: el túnel entra por ahí, así que lo que distingue a
// un visitante remoto es la cabecera Host. Toda petición remota necesita una sesión, que se obtiene
// con el código de acceso. El código y las sesiones viven solo en memoria: al cerrar el túnel o
// reiniciar el servidor dejan de valer, y sin túnel activo cualquier Host ajeno se rechaza.
import { execFile, spawn as spawnReal } from 'node:child_process';
import { enElPath, ES_WINDOWS } from './plataforma.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DURACION_SESION = 12 * 3600e3;
const MAX_FALLOS = 10;
const BLOQUEO = 5 * 60e3;
const ESPERA_URL = 45e3;
const ESPERA_PERMISO = 5 * 60e3;
const COOKIE = 'oficina_sesion';
const REENVIO = ['cf-connecting-ip', 'x-forwarded-for', 'forwarded', 'tailscale-user-login'];
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Lo que nunca se hace desde fuera: gestionar el túnel y tocar secretos o conexiones. */
const SOLO_LOCAL = /^\/api\/(?:tunel|conexiones|config\/(?:secretos|exportar|importar|restablecer|paquete))(?:\/|$)/;
export const soloLocal = (ruta) => SOLO_LOCAL.test(ruta);

const hash = (t) => crypto.createHash('sha256').update(t).digest();
const normalizar = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 16 caracteres (80 bits) sin letras que se confundan, en grupos de 4. */
export function generarCodigo() {
  let c = '';
  for (let i = 0; i < 16; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return c.match(/.{4}/g).join('-');
}

function buscarBin(variable, rutas, programa) {
  if (process.env[variable]) return process.env[variable];
  return rutas.find((r) => fs.existsSync(r)) || enElPath(programa);
}

const consultarReal = (bin, args) => new Promise((ok, mal) => {
  execFile(bin, args, { timeout: 15000, windowsHide: true, encoding: 'utf8' }, (e, salida) => (e ? mal(e) : ok(salida)));
});

export function crearTunel({
  puerto,
  logs,
  spawn = spawnReal,
  consultar = consultarReal,
  ahora = Date.now,
  bins = {},
}) {
  const locales = new Set([`127.0.0.1:${puerto}`, `localhost:${puerto}`]);
  const destino = `http://127.0.0.1:${puerto}`;
  // Se recuerda unos segundos: la pestaña pregunta seguido para notar cuando alguien lo instala.
  const hallados = new Map();
  const binDe = (id) => {
    if (id in bins) return bins[id];
    const previo = hallados.get(id);
    if (previo && previo.hasta > ahora()) return previo.bin;
    const bin = id === 'tailscale'
      ? buscarBin('TAILSCALE_BIN', ES_WINDOWS ? ['C:\\Program Files\\Tailscale\\tailscale.exe'] : [], 'tailscale')
      : buscarBin('CLOUDFLARED_BIN', ES_WINDOWS ? ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'] : [], 'cloudflared');
    hallados.set(id, { bin, hasta: ahora() + 10000 });
    return bin;
  };

  let t = null; // { proveedor, estado, url, host, codigo, hijo, requiere, temporizador, cerrando }
  let ultimoError = '';
  const sesiones = new Map();
  let fallos = 0;
  let bloqueadoHasta = 0;

  function anotar(evento, datos = {}) {
    if (!logs) return;
    try {
      fs.mkdirSync(logs, { recursive: true });
      fs.appendFileSync(path.join(logs, 'tunel.jsonl'), `${JSON.stringify({ fecha: new Date(ahora()).toISOString(), evento, ...datos })}\n`);
    } catch { /* el registro no debe tumbar el acceso */ }
  }
  const origen = (req) => req.headers['cf-connecting-ip'] || req.headers['tailscale-user-login'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '';

  /** 'local' (este equipo), 'remoto' (por el túnel activo) o 'rechazar'. */
  function clasificar(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (locales.has(host)) return REENVIO.some((h) => h in req.headers) ? 'rechazar' : 'local';
    return t?.estado === 'activo' && host === t.host ? 'remoto' : 'rechazar';
  }

  function sesionValida(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie || '');
    if (!m) return false;
    const id = hash(m[1]).toString('hex');
    const fin = sesiones.get(id);
    if (!fin) return false;
    if (fin <= ahora()) { sesiones.delete(id); return false; }
    return true;
  }

  /** Comprueba el código. Si vale devuelve la cabecera Set-Cookie de la sesión nueva. */
  function entrar(codigo, req) {
    if (t?.estado !== 'activo') return { ok: false, error: 'El túnel está cerrado.' };
    if (bloqueadoHasta > ahora()) return { ok: false, error: 'Demasiados intentos. Espera unos minutos.' };
    const bueno = crypto.timingSafeEqual(hash(normalizar(codigo)), hash(normalizar(t.codigo)));
    if (!bueno) {
      fallos++;
      anotar('codigo-incorrecto', { origen: origen(req) });
      if (fallos >= MAX_FALLOS) { fallos = 0; bloqueadoHasta = ahora() + BLOQUEO; anotar('bloqueo', {}); }
      return { ok: false, error: 'Código incorrecto.' };
    }
    fallos = 0;
    const secreto = crypto.randomBytes(32).toString('hex');
    sesiones.set(hash(secreto).toString('hex'), ahora() + DURACION_SESION);
    anotar('entrada', { origen: origen(req) });
    return { ok: true, cookie: `${COOKIE}=${secreto}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACION_SESION / 1000}` };
  }

  /** Qué falta en este equipo para cada túnel; `falta` decide qué instrucciones se muestran. */
  let consulta = null;
  function proveedores() {
    if (!consulta || consulta.hasta <= ahora()) consulta = { hasta: ahora() + 8000, datos: consultarProveedores() };
    return consulta.datos;
  }
  async function consultarProveedores() {
    const ts = binDe('tailscale');
    const tailscale = { id: 'tailscale', nombre: 'Tailscale', instalado: !!ts, listo: false, falta: 'instalar', https: false, otrosEquipos: 0 };
    if (ts) {
      try {
        const j = JSON.parse(await consultar(ts, ['status', '--json']));
        tailscale.otrosEquipos = Object.keys(j.Peer || {}).length;
        tailscale.listo = j.BackendState === 'Running' && !!j.Self?.DNSName;
        tailscale.https = (j.CertDomains || []).length > 0;
        tailscale.falta = tailscale.listo ? null : 'sesion';
      } catch { tailscale.falta = 'responde'; }
    }
    const cf = !!binDe('cloudflare');
    return [tailscale, { id: 'cloudflare', nombre: 'Cloudflare', instalado: cf, listo: cf, falta: cf ? null : 'instalar' }];
  }

  function estado() {
    let vivas = 0;
    for (const [id, fin] of sesiones) { if (fin <= ahora()) sesiones.delete(id); else vivas++; }
    if (!t) return { estado: ultimoError ? 'error' : 'apagado', error: ultimoError || null, proveedor: null, url: null, codigo: null, requiere: null, sesiones: 0 };
    return { estado: t.estado, error: null, proveedor: t.proveedor, url: t.url, codigo: t.estado === 'activo' ? t.codigo : null, requiere: t.requiere, sesiones: vivas };
  }

  function apagarHijo(hijo) {
    if (!hijo?.pid) return;
    try {
      if (ES_WINDOWS) spawn('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on?.('error', () => {});
      else hijo.kill();
    } catch { /* ya no está */ }
  }
  /** Retira solo el puerto que abrimos, sin tocar otras publicaciones de Tailscale. */
  const limpiarTailscale = () => {
    const bin = binDe('tailscale');
    return bin ? consultar(bin, ['serve', '--https=443', 'off']).catch(() => {}) : Promise.resolve();
  };

  function terminar(error = '') {
    if (!t) return;
    const viejo = t;
    t = null;
    clearTimeout(viejo.temporizador);
    sesiones.clear();
    fallos = 0;
    bloqueadoHasta = 0;
    ultimoError = error;
    apagarHijo(viejo.hijo);
    if (viejo.proveedor === 'tailscale') void limpiarTailscale();
    anotar('cerrado', { proveedor: viejo.proveedor, ...(error ? { error } : {}) });
  }

  async function abrir(proveedor) {
    if (t) throw Object.assign(new Error('Ya hay un túnel abierto.'), { codigo: 409 });
    if (!['tailscale', 'cloudflare'].includes(proveedor)) throw Object.assign(new Error('Proveedor inválido.'), { codigo: 400 });
    const bin = binDe(proveedor);
    if (!bin) throw Object.assign(new Error(`${proveedor} no está instalado en este equipo.`), { codigo: 400 });

    let esperado = null;
    if (proveedor === 'tailscale') {
      const j = JSON.parse(await consultar(bin, ['status', '--json']));
      if (j.BackendState !== 'Running' || !j.Self?.DNSName) throw Object.assign(new Error('Tailscale no tiene la sesión iniciada en este equipo.'), { codigo: 400 });
      esperado = j.Self.DNSName.replace(/\.$/, '').toLowerCase();
      await limpiarTailscale();
      if (t) throw Object.assign(new Error('Ya hay un túnel abierto.'), { codigo: 409 });
    }

    ultimoError = '';
    const args = proveedor === 'tailscale'
      ? ['serve', '--https=443', destino]
      : ['tunnel', '--no-autoupdate', '--url', destino];
    const hijo = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const yo = { proveedor, estado: 'abriendo', url: null, host: null, codigo: null, hijo, requiere: null, temporizador: null };
    t = yo;
    let salida = '';
    const plazo = (ms) => {
      clearTimeout(yo.temporizador);
      yo.temporizador = setTimeout(() => { if (t === yo && yo.estado === 'abriendo') terminar(`No se abrió a tiempo. ${salida.trim().slice(-300)}`.trim()); }, ms);
      yo.temporizador.unref?.();
    };
    plazo(ESPERA_URL);
    const activar = (host) => {
      clearTimeout(yo.temporizador);
      Object.assign(yo, { estado: 'activo', host, url: `https://${host}/`, codigo: generarCodigo(), requiere: null });
      anotar('abierto', { proveedor, host });
    };
    const leer = (trozo) => {
      if (t !== yo) return;
      salida = (salida + trozo).slice(-4000);
      if (yo.estado !== 'abriendo') return;
      if (proveedor === 'tailscale') {
        const permiso = /https:\/\/(?:login|console)\.tailscale\.com\/\S+/.exec(salida);
        if (permiso && yo.requiere !== permiso[0]) { yo.requiere = permiso[0]; plazo(ESPERA_PERMISO); }
        if (salida.toLowerCase().includes(`https://${esperado}`)) activar(esperado);
      } else {
        const hallada = [...salida.matchAll(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/g)].find((m) => m[1] !== 'api.trycloudflare.com');
        if (hallada) activar(hallada[1]);
      }
    };
    hijo.stdout?.setEncoding?.('utf8');
    hijo.stderr?.setEncoding?.('utf8');
    hijo.stdout?.on('data', leer);
    hijo.stderr?.on('data', leer);
    hijo.on('error', (e) => { if (t === yo) terminar(`No se pudo iniciar: ${e.message}`); });
    hijo.on('exit', () => { if (t === yo) terminar(`El túnel se cerró solo. ${salida.trim().slice(-300)}`.trim()); });
    return estado();
  }

  function cerrar() {
    ultimoError = '';
    terminar();
    return estado();
  }

  return { clasificar, sesionValida, entrar, proveedores, estado, abrir, cerrar, apagar: () => terminar() };
}

/** La página donde un dispositivo remoto escribe el código. Sin datos de la oficina. */
export function paginaAcceso(error = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Acceso</title><style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14171c;color:#e8e6e1;font:16px system-ui,sans-serif;padding:16px;box-sizing:border-box}
form{width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px}h1{font-size:20px;margin:0}p{margin:0;font-size:14px;color:#a9adb5}
input{font:18px ui-monospace,monospace;padding:12px;border-radius:10px;border:1px solid #3a3f48;background:#0f1216;color:inherit;text-transform:uppercase}
button{font:600 16px system-ui,sans-serif;padding:12px;border-radius:10px;border:0;background:#e8a33d;color:#14171c;cursor:pointer}.error{color:#ff8a80}
</style></head><body><form method="post" action="/acceso"><h1>Acceso a la oficina</h1><p>Escribe el código que aparece en Configuración › Túnel, en el equipo de la oficina.</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<label for="c">Código de acceso</label><input id="c" name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" required autofocus><button>Entrar</button></form></body></html>`;
}
