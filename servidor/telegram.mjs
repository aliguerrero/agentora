import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

// Teléfono real del CEO: un bot de Telegram (token cifrado en config/secretos.json). Sondeo
// largo (getUpdates): no hace falta abrir puertos ni un servidor público.
//
// Dos roles, en chats privados separados (nadie ve lo que el bot le envía a otro):
//   - Titular: el chat vinculado con el código de 6 dígitos que muestra la oficina. Recibe
//     informes, preguntas, encargos terminados y actas (con botones Aprobar / Rechazar), y es el
//     único que da órdenes (/estado, /pendientes, /ayuda, texto o nota de voz → gerente).
//   - Persona del equipo: se vincula con su propio código de 8 dígitos (un solo uso, caduca a
//     los 7 días). Solo recibe lo que un agente le escribe y puede responder; no tiene comandos
//     ni da órdenes. Su respuesta se entrega como dato (alResponderPersona), nunca como orden.
// Cualquier otro chat recibe «No autorizado».
const DIAS_INVITACION = 7;

export function crearTelegram({ RAIZ, EMPLEADOS, dirEmpleado = (id) => path.join(EMPLEADOS, id), mensajes, decidirReunion, estadoTexto, gerente, nombreDe, idsEmpleados, hoy, slug, registrar,
  // El token sale del almacén cifrado (secretos.mjs); si no se pasa, se lee de .env como antes.
  leerToken = () => { try { return fs.readFileSync(path.join(RAIZ, '.env'), 'utf8').match(/^TELEGRAM_TOKEN=(.+)$/m)?.[1].trim() || null; } catch { return null; } },
  activo: estaActivo = () => true,
  general = () => ({ titularCorto: 'Titular', asistente: 'J.A.R.V.I.S.', casa: 'la oficina' }),
  // (personaId, texto, { respuestaA }) → se llama cuando una persona del equipo escribe al bot.
  alResponderPersona = null,
  // (id, 'aprobar' | 'rechazar') → decide un mensaje a una persona que espera aprobación del titular.
  decidirContacto = null,
  // Inyectable en pruebas.
  fetchImpl = (...a) => fetch(...a) }) {
  const ESTADO = path.join(RAIZ, 'logs', 'telegram.json');
  const TIT = () => general().titularCorto;
  let token = null;
  let est = { chatId: null, codigo: null, offset: 0, enviados: null, respuestas: {}, botones: {}, personas: {}, invitaciones: {}, entregas: {} };
  try { est = { ...est, ...JSON.parse(fs.readFileSync(ESTADO, 'utf8')) }; } catch {}
  est.personas ||= {}; est.invitaciones ||= {}; est.entregas ||= {};
  const guardar = () => { fs.mkdirSync(path.dirname(ESTADO), { recursive: true }); fs.writeFileSync(ESTADO, JSON.stringify(est, null, 2)); };
  if (!est.chatId && !est.codigo) { est.codigo = String(crypto.randomInt(100000, 1000000)); guardar(); }

  let ultimoError = null;
  let bot = null; // { usuario, nombre } de getMe

  async function api(metodo, datos = {}, ms = 15000, opciones = {}) {
    const tk = opciones.token ?? token;
    if (!tk) throw new Error('Telegram no está configurado (falta el token).');
    const r = await fetchImpl(`https://api.telegram.org/bot${tk}/${metodo}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos), signal: opciones.signal ?? AbortSignal.timeout(ms),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`${metodo}: ${j.description || r.status}`);
    return j.result;
  }
  const recortar = (t, n = 3500) => (t.length > n ? t.slice(0, n) + '…' : t);
  const enviarA = (chat, texto, extra = {}) => api('sendMessage', { chat_id: chat, text: recortar(texto), disable_web_page_preview: true, ...extra });
  const enviar = (texto, extra = {}) => enviarA(est.chatId, texto, extra);

  // Deja un encargo para un agente, como lo haría el titular desde la oficina.
  function encargar(para, titulo, texto, extra = {}) {
    const destino = path.join(dirEmpleado(para), 'encargos');
    fs.mkdirSync(destino, { recursive: true });
    const archivo = `${hoy()}-telegram-${slug(titulo, 40)}-${Date.now().toString(36).slice(-4)}.md`;
    const cab = Object.entries({ de: `${TIT()} (CEO, por Telegram)`, fecha: hoy(), estado: 'pendiente', prioridad: 'alta', ...extra })
      .map(([k, v]) => `${k}: ${String(v).replace(/\r?\n/g, ' ')}`).join('\n');
    fs.writeFileSync(path.join(destino, archivo), `---\n${cab}\n---\n# ${titulo}\n\n${texto}\n`);
    return archivo;
  }

  const ICONO = { informe: '📄', pregunta: '❓', encargo: '✅', reunion: '🗳️' };
  function formatear(m) {
    const cabeza = m.tipo === 'encargo' ? `${m.estado === 'hecho' ? '✅ Terminado' : '⛔ Bloqueado'} · ${m.nombre}`
      : m.tipo === 'reunion' ? '🗳️ Acta para tu decisión'
      : m.tipo === 'cuarentena' ? `🛡️ Cuarentena · ${m.nombre} (decide en ⚙ › Cuarentena)`
      : m.tipo === 'contacto' ? `✉️ ${m.nombre} quiere escribir a una persona del equipo`
      : `${ICONO[m.tipo] || '•'} ${m.nombre}${m.tipo === 'pregunta' ? ' te pregunta' : ''}`;
    return `${cabeza}\n${m.titulo}\n\n${(m.texto || '').trim()}`;
  }
  function botonesContacto(id) {
    const k = `c${crypto.createHash('sha1').update(id).digest('hex').slice(0, 9)}`;
    est.botones[k] = { tipo: 'contacto', id };
    return { inline_keyboard: [[{ text: '✅ Enviar', callback_data: `a:${k}` }, { text: '❌ No enviar', callback_data: `r:${k}` }]] };
  }
  function botonesActa(archivo) {
    const k = crypto.createHash('sha1').update(archivo).digest('hex').slice(0, 10);
    est.botones[k] = archivo;
    return { inline_keyboard: [[{ text: '✅ Aprobar', callback_data: `a:${k}` }, { text: '❌ Rechazar', callback_data: `r:${k}` }]] };
  }

  // Avisos nuevos al titular: la primera vez solo se marca lo existente, sin inundar el chat.
  let enviando = false;
  async function avisar() {
    if (!escuchando || !est.chatId || enviando) return;
    enviando = true;
    try {
      const lista = mensajes().filter((m) => m.tipo !== 'reunion' || m.estado === 'pendiente');
      if (!est.enviados) { est.enviados = lista.map((m) => m.id); guardar(); return; }
      const ya = new Set(est.enviados);
      for (const m of lista.filter((x) => !ya.has(x.id)).reverse()) {
        const extra = m.tipo === 'reunion' ? { reply_markup: botonesActa(m.archivo) } : m.tipo === 'contacto' ? { reply_markup: botonesContacto(m.archivo) } : {};
        const r = await enviar(formatear(m), extra);
        if (m.tipo === 'pregunta') est.respuestas[r.message_id] = { para: m.de, titulo: m.titulo };
        est.enviados.push(m.id);
      }
      est.enviados = est.enviados.slice(-500);
      const claves = Object.keys(est.respuestas); if (claves.length > 200) for (const k of claves.slice(0, claves.length - 200)) delete est.respuestas[k];
      guardar();
    } catch (e) { ultimoError = { texto: e.message, fecha: new Date().toISOString() }; console.error('Telegram (avisos):', e.message); }
    finally { enviando = false; }
  }

  const personaDeChat = (chat) => Object.entries(est.personas).find(([, p]) => String(p.chatId) === String(chat))?.[0] || null;

  async function atender(u) {
    if (u.callback_query) {
      const q = u.callback_query;
      if (!est.chatId || String(q.message?.chat?.id) !== String(est.chatId)) return api('answerCallbackQuery', { callback_query_id: q.id, text: 'No autorizado' });
      const [accion, k] = String(q.data || '').split(':');
      const archivo = est.botones[k];
      let texto;
      try {
        if (!archivo) throw new Error('Esa decisión ya no está disponible.');
        if (typeof archivo === 'object' && archivo.tipo === 'contacto') {
          if (!decidirContacto) throw new Error('No disponible.');
          await decidirContacto(archivo.id, accion === 'a' ? 'aprobar' : 'rechazar');
          texto = accion === 'a' ? 'Aprobado: se enviará respetando su horario.' : 'No se enviará.';
        } else {
          decidirReunion(archivo, accion === 'a' ? 'aprobada' : 'rechazada', 'Decidido desde Telegram.');
          texto = accion === 'a' ? 'Aprobada. El gerente ya la está ejecutando.' : 'Rechazada.';
        }
        delete est.botones[k]; guardar();
        await api('editMessageReplyMarkup', { chat_id: est.chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      } catch (e) { texto = e.message; }
      await api('answerCallbackQuery', { callback_query_id: q.id, text: texto });
      return enviar(texto);
    }
    const msg = u.message;
    if (!msg?.chat) return;
    const chat = String(msg.chat.id);
    const texto = (msg.text || '').trim();
    const privado = msg.chat.type === 'private';
    const esTitular = !!est.chatId && chat === String(est.chatId);

    // Vinculación del titular: «/vincular 123456» o «/start 123456», solo en chat privado.
    const codigo = texto.match(/^\/(?:vincular|start)\s+(\d{6})$/)?.[1];
    if (!est.chatId && privado && codigo && est.codigo && codigo === est.codigo && !personaDeChat(chat)) {
      est.chatId = chat; est.codigo = null; guardar();
      registrar?.('Telegram vinculado con el teléfono del CEO');
      return enviar(`Vinculado. Soy ${general().asistente}: te avisaré aquí de informes, preguntas, actas y trabajos terminados. Escríbeme una orden y se la paso al gerente. /ayuda para ver los comandos.`);
    }

    // Vinculación de una persona del equipo: «/start 12345678».
    const invitacion = texto.match(/^\/(?:vincular|start)\s+(\d{8})$/)?.[1];
    if (invitacion && privado && !esTitular) {
      const inv = est.invitaciones[invitacion];
      if (!inv || Date.parse(inv.vence) < Date.now()) return enviarA(chat, 'Ese código no es válido o ya caducó. Pide uno nuevo a quien te invitó.');
      const otra = personaDeChat(chat);
      if (otra && otra !== inv.persona) return enviarA(chat, 'Este Telegram ya está vinculado a otra persona de la oficina.');
      est.personas[inv.persona] = { chatId: chat, nombre: inv.nombre, vinculado: new Date().toISOString() };
      delete est.invitaciones[invitacion];
      guardar();
      registrar?.(`Telegram vinculado con ${inv.nombre}`);
      return enviarA(chat, `Hola, ${inv.nombre}. Quedaste vinculado con ${general().casa}. Aquí te escribirán sus agentes cuando necesiten algo de ti; para contestar, responde a su mensaje. No verás mensajes de nadie más.`);
    }

    if (esTitular) {
      if (msg.voice || msg.audio) {
        await enviar('🎙️ Escuchando tu nota de voz…');
        let dicho;
        try { dicho = await transcribir(msg.voice || msg.audio); } catch (e) { return enviar(`No pude transcribirla (${e.message}). Escríbeme la orden.`); }
        if (!dicho) return enviar('No entendí nada en la nota. ¿Me la repites o la escribes?');
        await enviar(`Entendí: «${dicho}»`);
        return procesarTexto(dicho, msg);
      }
      if (!texto) return;
      return procesarTexto(texto, msg);
    }

    const persona = personaDeChat(chat);
    if (persona) {
      if (!texto) return enviarA(chat, 'Por ahora solo puedo recibir texto.');
      if (texto.startsWith('/')) return enviarA(chat, 'Aquí no hay comandos: responde al mensaje del agente con tu texto y se lo haré llegar.');
      const respuestaA = msg.reply_to_message ? est.entregas[msg.reply_to_message.message_id] || null : null;
      try {
        if (alResponderPersona) await alResponderPersona(persona, texto, { respuestaA });
        return enviarA(chat, respuestaA ? `Gracias. Se lo hice llegar a ${respuestaA.agenteNombre || 'quien te escribió'}.` : 'Gracias, quedó registrado. Si contestas a un mensaje concreto, responde sobre él para que llegue a quien te escribió.');
      } catch (e) { return enviarA(chat, `No pude registrar tu respuesta (${e.message}).`); }
    }

    return enviarA(chat, est.chatId ? 'No autorizado.' : 'No autorizado. Envía /vincular <código> con el código que te dio la oficina.');
  }

  // Notas de voz: se descargan a logs/voz y se transcriben en local con faster-whisper
  // (servidor/transcribir.py); el audio se borra al terminar.
  async function transcribir(archivo) {
    if (archivo.file_size > 20e6) throw new Error('la nota es demasiado larga');
    const info = await api('getFile', { file_id: archivo.file_id });
    const r = await fetchImpl(`https://api.telegram.org/file/bot${token}/${info.file_path}`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`descarga ${r.status}`);
    const dir = path.join(RAIZ, 'logs', 'voz');
    fs.mkdirSync(dir, { recursive: true });
    const ruta = path.join(dir, `${Date.now()}${path.extname(info.file_path) || '.ogg'}`);
    fs.writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
    try {
      return await new Promise((resolver, rechazar) => {
        execFile('py', ['-3.12', path.join(import.meta.dirname, 'transcribir.py'), ruta], { timeout: 300000, windowsHide: true, encoding: 'buffer', maxBuffer: 1e6 },
          (error, salida, errores) => (error ? rechazar(new Error(String(errores).trim().split('\n').pop() || error.message)) : resolver(salida.toString('utf8').trim())));
      });
    } finally { fs.rmSync(ruta, { force: true }); }
  }

  async function procesarTexto(texto, msg) {
    if (/^\/(ayuda|help|start)\b/.test(texto)) {
      return enviar('Comandos:\n/estado — quién trabaja, cola, motores y costo de hoy\n/pendientes — actas que esperan tu decisión\n\nCualquier otro texto o nota de voz es una orden para el gerente (prioridad alta). Si respondes a una pregunta de un agente, la respuesta le llega a ese agente.');
    }
    if (/^\/estado\b/.test(texto)) return enviar(estadoTexto());
    if (/^\/pendientes\b/.test(texto)) {
      const actas = mensajes().filter((m) => m.tipo === 'reunion' && m.estado === 'pendiente');
      if (!actas.length) return enviar('No hay actas esperando tu decisión.');
      for (const m of actas) await enviar(formatear(m), { reply_markup: botonesActa(m.archivo) });
      return guardar();
    }
    if (texto.startsWith('/')) return enviar('No conozco ese comando. /ayuda');
    const resp = msg.reply_to_message && est.respuestas[msg.reply_to_message.message_id];
    if (resp && idsEmpleados().includes(resp.para)) {
      encargar(resp.para, `Respuesta de ${TIT()}: ${resp.titulo}`, `${TIT()} respondió por Telegram a tu pregunta «${resp.titulo}»:\n\n${texto}\n\nContinúa tu trabajo con esta respuesta.`);
      return enviar(`Se lo hice llegar a ${nombreDe(resp.para)}.`);
    }
    const para = gerente();
    if (!para || !idsEmpleados().includes(para)) return enviar('No hay un gerente asignado en la oficina.');
    const titulo = texto.split(/\n/)[0].slice(0, 80);
    encargar(para, titulo, `Orden del CEO recibida por Telegram:\n\n${texto}\n\nActúa con tu autonomía delegada (OFICINA.md). Al terminar, deja el resultado en «## Resultado»: le llegará a ${TIT()} por Telegram.`);
    registrar?.(`Orden del CEO por Telegram: ${titulo}`);
    return enviar(`Recibido. Se lo pasé a ${nombreDe(para)} con prioridad alta; te aviso aquí cuando termine.`);
  }

  /* ---------- Ciclo de vida: se puede detener y reiniciar sin reiniciar el servidor ---------- */

  let escuchando = false;
  let generacion = 0;
  let cortar = null; // AbortController del getUpdates en curso
  async function escuchar(mia) {
    while (escuchando && mia === generacion) {
      try {
        cortar = new AbortController();
        const temporizador = setTimeout(() => cortar.abort(), 35000);
        let updates;
        try { updates = await api('getUpdates', { offset: est.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, 35000, { signal: cortar.signal }); }
        finally { clearTimeout(temporizador); }
        if (mia !== generacion) return;
        ultimoError = null;
        for (const u of updates) {
          est.offset = u.update_id + 1; guardar();
          try { await atender(u); } catch (e) { console.error('Telegram (mensaje):', e.message); }
        }
      } catch (e) {
        if (mia !== generacion || !escuchando) return;
        ultimoError = { texto: e.message, fecha: new Date().toISOString() };
        console.error('Telegram (escucha):', e.message);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }

  async function iniciar() {
    detener();
    token = leerToken() || null;
    if (!token || !estaActivo()) return;
    const mia = ++generacion;
    escuchando = true;
    try { const yo = await api('getMe'); bot = { usuario: yo.username, nombre: yo.first_name }; } catch (e) { ultimoError = { texto: e.message, fecha: new Date().toISOString() }; }
    if (mia !== generacion) return;
    escuchar(mia);
    setTimeout(avisar, 5000);
  }
  function detener() {
    escuchando = false;
    generacion++;
    try { cortar?.abort(); } catch {}
  }
  setInterval(avisar, 30000).unref?.();

  /* ---------- Acciones del panel ---------- */

  function nuevoCodigo() {
    est.codigo = String(crypto.randomInt(100000, 1000000));
    guardar();
    return est.codigo;
  }
  function desvincular() {
    est.chatId = null; est.enviados = null; est.respuestas = {}; est.botones = {};
    nuevoCodigo();
    registrar?.('Telegram del CEO desvinculado');
  }
  async function probar() {
    if (!est.chatId) throw new Error('Primero vincula tu Telegram con el código.');
    await enviar(`✅ Prueba de ${general().casa}: el bot funciona y este chat recibe los avisos.`);
  }
  /** Comprueba un token sin guardarlo (getMe). */
  async function verificarToken(tk) {
    if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(String(tk || ''))) throw new Error('El token no tiene el formato de BotFather (números:letras).');
    const yo = await api('getMe', {}, 10000, { token: tk });
    return { usuario: yo.username, nombre: yo.first_name };
  }

  /** Código de 8 dígitos para que una persona del equipo vincule su Telegram (un solo uso). */
  function invitar(persona, nombre) {
    if (!/^[a-z0-9-]{1,60}$/.test(String(persona))) throw new Error('Persona no válida.');
    for (const [c, inv] of Object.entries(est.invitaciones)) if (inv.persona === persona || Date.parse(inv.vence) < Date.now()) delete est.invitaciones[c];
    let codigo;
    do codigo = String(crypto.randomInt(10_000_000, 100_000_000)); while (est.invitaciones[codigo]);
    est.invitaciones[codigo] = { persona, nombre: String(nombre || persona).slice(0, 80), vence: new Date(Date.now() + DIAS_INVITACION * 864e5).toISOString() };
    guardar();
    return { codigo, vence: est.invitaciones[codigo].vence, enlace: bot?.usuario ? `https://t.me/${bot.usuario}?start=${codigo}` : null };
  }
  function desvincularPersona(persona) {
    delete est.personas[persona];
    for (const [c, inv] of Object.entries(est.invitaciones)) if (inv.persona === persona) delete est.invitaciones[c];
    guardar();
  }
  /** Mensaje de un agente a una persona del equipo. Recuerda a quién responder. */
  async function enviarAPersona(persona, texto, { agente = null, agenteNombre = null, asunto = null } = {}) {
    const p = est.personas[persona];
    if (!p) throw new Error('Esa persona no tiene Telegram vinculado.');
    if (!escuchando) throw new Error('Telegram está desactivado.');
    const r = await enviarA(p.chatId, texto);
    est.entregas[r.message_id] = { persona, agente, agenteNombre, asunto, fecha: new Date().toISOString() };
    const claves = Object.keys(est.entregas); if (claves.length > 500) for (const k of claves.slice(0, claves.length - 500)) delete est.entregas[k];
    guardar();
    return r.message_id;
  }

  return {
    get disponible() { return !!token; },
    estado: () => ({
      configurado: !!(token || leerToken()), activo: estaActivo(), escuchando, vinculado: !!est.chatId,
      codigo: est.chatId ? null : est.codigo, bot, error: ultimoError,
      personas: Object.fromEntries(Object.entries(est.personas).map(([id, p]) => [id, { nombre: p.nombre, vinculado: p.vinculado }])),
      invitaciones: Object.values(est.invitaciones).filter((i) => Date.parse(i.vence) > Date.now()).map((i) => ({ persona: i.persona, vence: i.vence })),
    }),
    iniciar, detener, reiniciar: iniciar,
    nuevoCodigo, desvincular, probar, verificarToken,
    invitar, desvincularPersona, enviarAPersona,
    // Para pruebas: procesar una actualización como si llegara de Telegram.
    _atender: atender,
  };
}
