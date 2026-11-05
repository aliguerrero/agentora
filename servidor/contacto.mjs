// Política de contacto: los agentes escriben a personas del equipo por correo o Telegram.
//
// Un agente deja solicitudes/contacto-<tema>.json; la oficina lo valida y lo pone en la bandeja
// de salida (config/salida/, vetada para los agentes: nadie puede falsificar una aprobación).
//   - Sin permiso previo SOLO si la política general está activa Y la persona lo permite.
//   - Si no, espera aprobación del gerente del proyecto o del titular (configurable). Un gerente
//     no aprueba sus propios mensajes.
// Siempre: la persona debe estar en el proyecto del agente y aceptar contacto, tope diario por
// persona (lo que sobra se aplaza), horario de silencio en la zona horaria de la persona, firma
// de agente de IA, cuarentena (instrucciones escondidas) y bloqueo de secretos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { detectarInyeccion } from './cuarentena.mjs';

const ESTADOS = ['pendiente-aprobacion', 'programado', 'enviado', 'rechazado', 'fallido'];

// Patrones de secretos que nunca deben salir en un mensaje.
const SECRETOS = [
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token de API', /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{20,}\b|\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/],
  ['token de bot de Telegram', /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ['contraseña', /\b(?:password|passwd|contrase(?:ñ|n)a|clave|api[_ -]?key|secret|token)\s*[:=]\s*\S{6,}/i],
];

/** Señales de secretos en un texto; `conocidos` son los valores reales guardados en la oficina. */
export function detectarSecretos(texto, conocidos = []) {
  const t = String(texto || '');
  const hallazgos = SECRETOS.filter(([, re]) => re.test(t)).map(([n]) => n);
  if (conocidos.some((v) => v && v.length >= 8 && t.includes(v))) hallazgos.push('secreto de la oficina');
  return [...new Set(hallazgos)];
}

/** Hora decimal en una zona IANA. */
function horaEn(zona, fecha = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(fecha).map((x) => [x.type, x.value]));
    return Number(p.hour) + Number(p.minute) / 60;
  } catch { return fecha.getHours() + fecha.getMinutes() / 60; }
}
/** ¿Está la hora `h` dentro del silencio [desde, hasta) (puede cruzar medianoche)? */
const enSilencio = (h, desde, hasta) => (desde === hasta ? false : desde < hasta ? h >= desde && h < hasta : h >= desde || h < hasta);
/** Momento en que termina el silencio, en la zona de la persona (aprox. al minuto). */
function finDelSilencio(zona, desde, hasta, ahora = new Date()) {
  for (let m = 1; m <= 24 * 60; m += 1) {
    const t = new Date(ahora.getTime() + m * 60000);
    if (!enSilencio(horaEn(zona, t), desde, hasta)) return t;
  }
  return ahora;
}

/**
 * Dependencias: `politica()` (config contacto), `personas`, `contextos`, `correo` { activo(),
 * enviar(para, asunto, texto) }, `telegram` { vinculado(persona), enviar(persona, texto, meta) },
 * `firma({ de, persona })`, `secretosConocidos()`, `nombreDe(id)`, `gerenteDe(ctx)`.
 */
export function crearContacto({ RAIZ, politica, personas, contextos, correo, telegram, firma, secretosConocidos = () => [], nombreDe = (x) => x, gerenteDe = () => null, alCambiar = () => {}, registrar = () => {} }) {
  const DIR = path.join(RAIZ, 'config', 'salida');
  const leer = (id) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8')); } catch { return null; } };
  const guardar = (r) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, `${r.id}.json.tmp`), JSON.stringify(r, null, 2)); fs.renameSync(path.join(DIR, `${r.id}.json.tmp`), path.join(DIR, `${r.id}.json`)); alCambiar(r); };
  function listar() {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => leer(f.slice(0, -5))).filter(Boolean).sort((a, b) => b.creado.localeCompare(a.creado));
  }
  const error = (m) => Object.assign(new Error(m), { codigo: 400 });

  /** Mensajes enviados (o programados) a una persona en las últimas 24 h. */
  const enviados24h = (persona, excepto) => listar().filter((r) => r.para === persona && r.id !== excepto && r.estado === 'enviado' && Date.now() - Date.parse(r.enviado) < 864e5).length;

  /** Momento a partir del cual se puede enviar (silencio y tope diario). */
  function cuandoEnviar(r, p) {
    const pol = politica();
    const zona = p.zonaHoraria || pol.zonaPorDefecto;
    let desde = Date.now();
    if (enviados24h(r.para, r.id) >= pol.maxPorDia) {
      const ultimos = listar().filter((x) => x.para === r.para && x.estado === 'enviado').map((x) => Date.parse(x.enviado)).sort((a, b) => a - b);
      const libre = ultimos[ultimos.length - pol.maxPorDia] + 864e5;
      if (libre > desde) desde = libre;
    }
    const t = new Date(desde);
    if (enSilencio(horaEn(zona, t), pol.silencioDesde, pol.silencioHasta)) desde = finDelSilencio(zona, pol.silencioDesde, pol.silencioHasta, t).getTime();
    return new Date(desde).toISOString();
  }

  /** Un agente pide contactar a alguien. Devuelve el registro (o lanza con el motivo). */
  function solicitar(de, s) {
    const ctx = contextos.deEmpleado(de);
    if (!ctx) throw error('Agente desconocido.');
    const p = personas.obtener(String(s.para || ''));
    if (!p) throw error(`No existe la persona «${s.para}». Mira EQUIPO.md de tu proyecto.`);
    if (!p.proyectos.includes('*') && !p.proyectos.includes(ctx.id)) throw error(`${p.nombre} no participa en tu proyecto.`);
    if (p.contacto === 'no') throw error(`${p.nombre} no acepta mensajes de los agentes: pídeselo al titular en tu informe.`);
    const canal = s.canal && s.canal !== 'auto' ? s.canal : p.canal;
    if (!['correo', 'telegram'].includes(canal)) throw error(`${p.nombre} no tiene un canal para los agentes (su canal es «${p.canal}»).`);
    if (canal === 'correo' && !p.correo) throw error(`${p.nombre} no tiene correo en el directorio.`);
    if (canal === 'correo' && !correo.activo()) throw error('El correo saliente de la oficina está desactivado.');
    if (canal === 'telegram' && !telegram.vinculado(p.id)) throw error(`${p.nombre} no tiene Telegram vinculado.`);
    const asunto = String(s.asunto || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 150);
    const mensaje = String(s.mensaje || '').replace(/\r\n?/g, '\n').trim();
    const motivo = String(s.motivo || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    if (mensaje.length < 5) throw error('El mensaje está vacío.');
    if (mensaje.length > 4000) throw error('El mensaje supera 4000 caracteres: resúmelo.');
    if (!motivo) throw error('Indica el motivo (para qué lo necesitas).');
    const todo = `${asunto}\n${mensaje}`;
    const secretos = detectarSecretos(todo, secretosConocidos());
    if (secretos.length) throw error(`Bloqueado: el mensaje parece contener ${secretos.join(', ')}. Nunca envíes secretos ni datos de pacientes.`);
    const inyeccion = detectarInyeccion(todo);
    const pol = politica();
    const directo = pol.activo && p.contacto === 'permitido' && !inyeccion.length;
    const r = {
      id: `${new Date().toISOString().slice(0, 10)}-${de}-${crypto.randomBytes(3).toString('hex')}`,
      de, proyecto: ctx.id, para: p.id, paraNombre: p.nombre, canal, asunto: asunto || `Mensaje de ${nombreDe(de)}`, mensaje, motivo,
      creado: new Date().toISOString(), estado: directo ? 'programado' : 'pendiente-aprobacion',
      // Con frases de inyección, solo el titular puede aprobarlo (no otro agente).
      soloTitular: inyeccion.length > 0,
      porque: directo ? 'política activa y la persona acepta contacto directo' : inyeccion.length ? `revisión: ${inyeccion.join(', ')}` : !pol.activo ? 'la política de contacto general está desactivada' : `${p.nombre} pide aprobación previa`,
    };
    if (directo) r.enviarDesde = cuandoEnviar(r, p);
    guardar(r);
    registrar(de, { texto: directo ? `Mensaje para ${p.nombre} programado (${canal})` : `Mensaje para ${p.nombre} espera aprobación`, clase: 'hablar' });
    return r;
  }

  /** Quién puede aprobar un mensaje: el titular, y/o el gerente del proyecto (nunca el suyo propio). */
  function puedeAprobar(r, quien) {
    const modo = politica().aprobador;
    if (quien === 'titular') return modo !== 'gerente' || r.soloTitular || !gerenteDe(r.proyecto) || gerenteDe(r.proyecto) === r.de;
    return modo !== 'titular' && !r.soloTitular && quien === gerenteDe(r.proyecto) && quien !== r.de;
  }

  function decidir(id, decision, quien, nota = '') {
    const r = leer(String(id));
    if (!r) throw Object.assign(new Error('No existe ese mensaje.'), { codigo: 404 });
    if (r.estado !== 'pendiente-aprobacion') throw Object.assign(new Error('Ese mensaje ya no espera aprobación.'), { codigo: 409 });
    if (!puedeAprobar(r, quien)) throw Object.assign(new Error(quien === 'titular' ? 'En esta oficina aprueba el gerente del proyecto.' : 'No puedes aprobar este mensaje.'), { codigo: 403 });
    if (decision === 'aprobar') {
      const p = personas.obtener(r.para);
      if (!p || p.contacto === 'no') throw error('La persona ya no acepta contacto.');
      Object.assign(r, { estado: 'programado', aprobadoPor: quien, aprobado: new Date().toISOString(), nota: String(nota).slice(0, 300) });
      r.enviarDesde = cuandoEnviar(r, p);
    } else if (decision === 'rechazar') {
      Object.assign(r, { estado: 'rechazado', rechazadoPor: quien, rechazado: new Date().toISOString(), nota: String(nota).slice(0, 300) });
    } else throw error('Decisión no válida (aprobar o rechazar).');
    guardar(r);
    registrar(r.de, { texto: `${decision === 'aprobar' ? 'Aprobado' : 'Rechazado'} su mensaje para ${r.paraNombre} (${quien})`, clase: 'hablar' });
    return r;
  }

  /** Envía lo programado cuyo momento llegó. Se llama desde el trabajador de la oficina. */
  let enviando = false;
  async function procesar() {
    if (enviando) return [];
    enviando = true;
    const hechos = [];
    try {
      for (const r of listar().filter((x) => x.estado === 'programado' && Date.parse(x.enviarDesde || 0) <= Date.now())) {
        const p = personas.obtener(r.para);
        if (!p || p.contacto === 'no') { Object.assign(r, { estado: 'rechazado', nota: 'La persona ya no acepta contacto.' }); guardar(r); continue; }
        // Si al llegar su turno se superaría el tope (otros salieron antes), se vuelve a programar.
        const momento = cuandoEnviar(r, p);
        if (Date.parse(momento) > Date.now() + 1000) { r.enviarDesde = momento; guardar(r); continue; }
        const pie = firma({ de: r.de, persona: p, canal: r.canal });
        try {
          if (r.canal === 'correo') await correo.enviar(p.correo, r.asunto, `${r.mensaje}\n\n${pie}`);
          else await telegram.enviar(p.id, `${pie.split('\n')[0]}\n\n${r.mensaje}\n\nResponde a este mensaje para contestarle.`, { agente: r.de, agenteNombre: nombreDe(r.de), asunto: r.asunto });
          Object.assign(r, { estado: 'enviado', enviado: new Date().toISOString() });
          registrar(r.de, { texto: `Envió un mensaje a ${r.paraNombre} (${r.canal})`, clase: 'hablar' });
        } catch (e) {
          r.intentos = (r.intentos || 0) + 1;
          r.error = e.message;
          if (r.intentos >= 3) r.estado = 'fallido';
          else r.enviarDesde = new Date(Date.now() + r.intentos * 15 * 60e3).toISOString();
        }
        guardar(r);
        hechos.push(r);
      }
    } finally { enviando = false; }
    return hechos;
  }

  return { solicitar, decidir, procesar, listar, leer, puedeAprobar, ESTADOS };
}
