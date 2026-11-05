// Envío de correo por SMTP sin dependencias (node:net / node:tls).
//   seguridad «tls»: conexión cifrada desde el inicio (normalmente puerto 465).
//   seguridad «starttls»: se conecta en claro y sube a TLS antes de autenticarse (587).
//   seguridad «ninguna»: sin cifrado (solo para un relé local de pruebas).
// Siempre se verifica el certificado del servidor. La contraseña nunca se registra.
// El cuerpo va en base64 (UTF-8) y el asunto como encoded-word: nada de lo que escriba un
// agente puede inyectar cabeceras ni terminar el DATA antes de tiempo.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CORREO = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const esCorreo = (c) => typeof c === 'string' && c.length <= 254 && CORREO.test(c);
const sinSaltos = (t) => String(t ?? '').replace(/[\r\n\t]+/g, ' ').trim();
const palabraCodificada = (t) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`);
const nombreYCorreo = (nombre, correo) => (nombre ? `${palabraCodificada(sinSaltos(nombre).replace(/"/g, "'"))} <${correo}>` : `<${correo}>`);
const base64Lineas = (texto) => Buffer.from(texto, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');

/** Mensaje RFC 5322 completo (cabeceras + cuerpo texto plano UTF-8). */
export function componerMensaje({ de, deNombre, para, asunto, texto, idMensaje, fecha = new Date() }) {
  const dominio = de.split('@')[1];
  const cabeceras = [
    `From: ${nombreYCorreo(deNombre, de)}`,
    `To: ${para.map((p) => `<${p}>`).join(', ')}`,
    `Subject: ${palabraCodificada(sinSaltos(asunto))}`,
    `Date: ${fecha.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${idMensaje || crypto.randomUUID()}@${dominio}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    'X-Mailer: Oficina DevBox',
  ];
  return `${cabeceras.join('\r\n')}\r\n\r\n${base64Lineas(texto.replace(/\r?\n/g, '\r\n'))}`;
}

/** Lector de respuestas SMTP (multilínea «250-…» hasta «250 …»). */
function crearLector(socket) {
  let buffer = '';
  let espera = null;
  const pendientes = [];
  const alDatos = (d) => {
    buffer += d.toString('utf8');
    for (;;) {
      const lineas = buffer.split('\r\n');
      let fin = -1;
      for (let i = 0; i < lineas.length - 1; i++) if (/^\d{3} /.test(lineas[i]) || /^\d{3}$/.test(lineas[i])) { fin = i; break; }
      if (fin < 0) return;
      const bloque = lineas.slice(0, fin + 1);
      buffer = lineas.slice(fin + 1).join('\r\n');
      const r = { codigo: Number(bloque[fin].slice(0, 3)), lineas: bloque.map((l) => l.slice(4)) };
      if (espera) { const e = espera; espera = null; e.ok(r); } else pendientes.push(r);
    }
  };
  socket.on('data', alDatos);
  return {
    leer: () => new Promise((ok, mal) => {
      if (pendientes.length) return ok(pendientes.shift());
      espera = { ok, mal };
    }),
    fallar: (e) => { if (espera) { const x = espera; espera = null; x.mal(e); } },
    soltar: () => socket.off('data', alDatos),
  };
}

/**
 * Envía un correo. `config`: { host, puerto, seguridad, usuario, remitenteCorreo, remitenteNombre }.
 * Devuelve { ok: true, id, respuesta } o lanza un Error con el motivo (sin la contraseña).
 */
export async function enviarCorreo({ config, password, para, asunto, texto, limiteMs = 20000, tlsOpciones = {} }) {
  const destinatarios = (Array.isArray(para) ? para : [para]).map((p) => String(p).trim()).filter(Boolean);
  if (!config?.host) throw new Error('Falta el servidor SMTP.');
  if (!esCorreo(config.remitenteCorreo)) throw new Error('El correo remitente no es válido.');
  if (!destinatarios.length || destinatarios.length > 20) throw new Error('Indica entre 1 y 20 destinatarios.');
  for (const d of destinatarios) if (!esCorreo(d)) throw new Error(`Destinatario no válido: ${d.slice(0, 80)}`);
  if (config.usuario && !password) throw new Error('Falta la contraseña SMTP (Configuración › Correo).');

  const idMensaje = crypto.randomUUID();
  const mensaje = componerMensaje({ de: config.remitenteCorreo, deNombre: config.remitenteNombre, para: destinatarios, asunto, texto, idMensaje });
  const nombreEquipo = (os.hostname() || 'oficina').replace(/[^A-Za-z0-9.-]/g, '') || 'oficina';
  const opcionesTls = { servername: config.host, minVersion: 'TLSv1.2', ...tlsOpciones };

  let socket = config.seguridad === 'tls'
    ? tls.connect({ host: config.host, port: config.puerto, ...opcionesTls })
    : net.connect({ host: config.host, port: config.puerto });
  let lector = crearLector(socket);
  let ultimo = '';
  const temporizador = setTimeout(() => socket.destroy(new Error(`Sin respuesta del servidor SMTP en ${limiteMs / 1000} s.`)), limiteMs);
  const alError = (e) => lector.fallar(e);
  socket.on('error', alError);
  socket.on('close', () => lector.fallar(new Error(`El servidor SMTP cerró la conexión${ultimo ? ` (último: ${ultimo})` : ''}.`)));

  const esperar = async (paso, aceptados) => {
    const r = await lector.leer();
    ultimo = `${r.codigo} ${r.lineas.at(-1)}`;
    if (!aceptados.includes(r.codigo)) throw new Error(`SMTP rechazó ${paso}: ${ultimo}`);
    return r;
  };
  const orden = async (linea, paso, aceptados) => { socket.write(`${linea}\r\n`); return esperar(paso, aceptados); };

  try {
    await esperar('la conexión', [220]);
    let ehlo = await orden(`EHLO ${nombreEquipo}`, 'EHLO', [250]);
    if (config.seguridad === 'starttls') {
      if (!ehlo.lineas.some((l) => /^STARTTLS\b/i.test(l))) throw new Error('El servidor no ofrece STARTTLS; usa «TLS» (puerto 465) o revisa el puerto.');
      await orden('STARTTLS', 'STARTTLS', [220]);
      lector.soltar();
      socket.off('error', alError);
      socket = await new Promise((ok, mal) => {
        const s = tls.connect({ socket, ...opcionesTls }, () => ok(s));
        s.once('error', mal);
      });
      lector = crearLector(socket);
      socket.on('error', alError);
      socket.on('close', () => lector.fallar(new Error(`El servidor SMTP cerró la conexión${ultimo ? ` (último: ${ultimo})` : ''}.`)));
      ehlo = await orden(`EHLO ${nombreEquipo}`, 'EHLO', [250]);
    }
    if (config.usuario) {
      const auth = ehlo.lineas.find((l) => /^AUTH\b/i.test(l)) || '';
      if (/\bPLAIN\b/i.test(auth)) {
        await orden(`AUTH PLAIN ${Buffer.from(`\0${config.usuario}\0${password}`, 'utf8').toString('base64')}`, 'la autenticación (revisa usuario y contraseña de aplicación)', [235]);
      } else if (/\bLOGIN\b/i.test(auth)) {
        await orden('AUTH LOGIN', 'AUTH LOGIN', [334]);
        await orden(Buffer.from(config.usuario, 'utf8').toString('base64'), 'el usuario', [334]);
        await orden(Buffer.from(password, 'utf8').toString('base64'), 'la autenticación (revisa usuario y contraseña de aplicación)', [235]);
      } else throw new Error('El servidor no ofrece AUTH PLAIN ni LOGIN.');
    }
    await orden(`MAIL FROM:<${config.remitenteCorreo}>`, 'el remitente', [250]);
    for (const d of destinatarios) await orden(`RCPT TO:<${d}>`, `el destinatario ${d}`, [250, 251]);
    await orden('DATA', 'DATA', [354]);
    socket.write(`${mensaje}\r\n.\r\n`);
    const fin = await esperar('el mensaje', [250]);
    socket.write('QUIT\r\n');
    return { ok: true, id: idMensaje, respuesta: `${fin.codigo} ${fin.lineas.at(-1)}` };
  } finally {
    clearTimeout(temporizador);
    socket.end();
    setTimeout(() => socket.destroy(), 1000).unref();
  }
}

/** Registro de lo que la oficina envía (correo y Telegram) en logs/comunicaciones.jsonl. */
export function registrarComunicacion(RAIZ, entrada) {
  const ruta = path.join(RAIZ, 'logs', 'comunicaciones.jsonl');
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.appendFileSync(ruta, JSON.stringify({ fecha: new Date().toISOString(), ...entrada, texto: entrada.texto ? String(entrada.texto).slice(0, 2000) : undefined }) + '\n');
}

export function leerComunicaciones(RAIZ, n = 50) {
  try {
    return fs.readFileSync(path.join(RAIZ, 'logs', 'comunicaciones.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-n)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch { return []; }
}
