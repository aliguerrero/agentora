// Directorio del equipo humano: las personas con las que trabajan los agentes (nombre, cargo,
// correo, Telegram, teléfono, zona horaria, horario, proyectos, su usuario de Jira…).
//
// Datos completos en config/personas.json (vetado para los agentes: contiene correos y
// teléfonos). A cada proyecto se le genera EQUIPO.md en la raíz de su contexto con lo que sus
// agentes necesitan para saber a quién pedir qué; el teléfono solo si la persona lo permite.
import fs from 'node:fs';
import path from 'node:path';

const CORREO = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const zonaValida = (z) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
export const slugPersona = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const normalizarNombre = (t) => slugPersona(t).replace(/-/g, ' ');

export const CANALES = ['correo', 'telegram', 'ninguno'];
export const CONTACTO = ['permitido', 'pide-permiso', 'no'];

/** Valida y normaliza una persona. `proyectosValidos`: ids existentes (o '*' = todos). */
export function validarPersona(d, proyectosValidos = []) {
  const mal = (m) => { throw Object.assign(new Error(m), { codigo: 400 }); };
  const texto = (v, max, campo, { min = 0, multilinea = false } = {}) => {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') mal(`${campo}: debe ser texto`);
    v = multilinea ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : v.replace(/[\r\n\t]+/g, ' ').trim();
    if (v.length < min) mal(v.length ? `${campo}: mínimo ${min} caracteres` : `${campo}: obligatorio`);
    if (v.length > max) mal(`${campo}: máximo ${max} caracteres`);
    return v;
  };
  const p = {
    nombre: texto(d.nombre, 80, 'nombre', { min: 2 }),
    cargo: texto(d.cargo, 80, 'cargo'),
    correo: texto(d.correo, 254, 'correo').toLowerCase(),
    telegramUsuario: texto(d.telegramUsuario, 33, 'usuario de Telegram').replace(/^@/, ''),
    telefono: texto(d.telefono, 25, 'teléfono'),
    zonaHoraria: texto(d.zonaHoraria, 60, 'zona horaria'),
    horario: texto(d.horario, 120, 'horario'),
    canal: d.canal ?? 'correo',
    contacto: d.contacto ?? 'pide-permiso',
    compartirTelefono: d.compartirTelefono === true,
    proyectos: Array.isArray(d.proyectos) ? [...new Set(d.proyectos.map(String))] : ['*'],
    jira: d.jira && (d.jira.accountId || d.jira.nombre) ? { accountId: texto(d.jira.accountId, 128, 'cuenta de Jira'), nombre: texto(d.jira.nombre, 120, 'nombre en Jira') } : null,
    notas: texto(d.notas, 500, 'notas', { multilinea: true }),
  };
  if (p.correo && !CORREO.test(p.correo)) mal('correo: no es válido');
  if (p.telegramUsuario && !/^[A-Za-z0-9_]{5,32}$/.test(p.telegramUsuario)) mal('usuario de Telegram: 5 a 32 letras, números o _');
  if (p.telefono && !/^\+?[0-9 ()-]{6,24}$/.test(p.telefono)) mal('teléfono: solo números, espacios, + ( ) -');
  if (p.zonaHoraria && !zonaValida(p.zonaHoraria)) mal('zona horaria: no válida');
  if (!CANALES.includes(p.canal)) mal(`canal: uno de ${CANALES.join(', ')}`);
  if (!CONTACTO.includes(p.contacto)) mal(`contacto: uno de ${CONTACTO.join(', ')}`);
  if (p.jira?.accountId && !/^[\w:.-]+$/.test(p.jira.accountId)) mal('cuenta de Jira: formato no válido');
  if (!p.proyectos.length) p.proyectos = ['*'];
  for (const id of p.proyectos) if (id !== '*' && !proyectosValidos.includes(id)) mal(`proyecto desconocido: ${id}`);
  if (p.proyectos.includes('*')) p.proyectos = ['*'];
  return p;
}

/**
 * `contextos` (contextos.mjs) da los proyectos; `telegram()` el estado del bot (quién vinculó su
 * chat); `auditar` deja constancia de cada cambio en logs/config.jsonl.
 */
export function crearPersonas({ RAIZ, contextos, telegram = () => ({ personas: {} }), auditar = () => {}, general = () => ({}) }) {
  const RUTA = path.join(RAIZ, 'config', 'personas.json');
  const leer = () => { try { return JSON.parse(fs.readFileSync(RUTA, 'utf8')).personas || []; } catch { return []; } };
  const escribir = (personas) => {
    fs.mkdirSync(path.dirname(RUTA), { recursive: true });
    fs.writeFileSync(`${RUTA}.tmp`, JSON.stringify({ personas }, null, 2));
    fs.renameSync(`${RUTA}.tmp`, RUTA);
  };
  const ids = () => contextos.todos().map((c) => c.id);

  function listar() {
    const vinculados = telegram().personas || {};
    return leer().map((p) => ({ ...p, telegramVinculado: !!vinculados[p.id] }));
  }
  const obtener = (id) => leer().find((p) => p.id === id) || null;

  function crear(datos, quien = 'panel') {
    const p = validarPersona(datos, ids());
    const todas = leer();
    let id = slugPersona(p.nombre) || 'persona';
    for (let n = 2; todas.some((x) => x.id === id); n++) id = `${slugPersona(p.nombre)}-${n}`;
    const nueva = { id, ...p, creado: new Date().toISOString() };
    escribir([...todas, nueva]);
    auditar({ quien, seccion: 'personas', campos: { [id]: 'creada' } });
    generarEquipos();
    return nueva;
  }

  function actualizar(id, datos, quien = 'panel') {
    const todas = leer();
    const i = todas.findIndex((x) => x.id === id);
    if (i < 0) throw Object.assign(new Error('No existe esa persona.'), { codigo: 404 });
    const p = validarPersona({ ...todas[i], ...datos }, ids());
    const cambiados = Object.keys(p).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(todas[i][k]));
    todas[i] = { ...todas[i], ...p, actualizado: new Date().toISOString() };
    escribir(todas);
    if (cambiados.length) auditar({ quien, seccion: 'personas', campos: { [id]: `cambió ${cambiados.join(', ')}` } });
    generarEquipos();
    return todas[i];
  }

  function borrar(id, quien = 'panel') {
    const todas = leer();
    if (!todas.some((x) => x.id === id)) throw Object.assign(new Error('No existe esa persona.'), { codigo: 404 });
    escribir(todas.filter((x) => x.id !== id));
    auditar({ quien, seccion: 'personas', campos: { [id]: 'borrada' } });
    generarEquipos();
  }

  /**
   * Candidatos de Jira frente al directorio: para cada usuario, la persona con la que coincide
   * (misma cuenta, mismo correo o mismo nombre) o ninguna. No guarda nada.
   */
  function emparejarJira(usuarios) {
    const todas = leer();
    return usuarios.map((u) => {
      const p = todas.find((x) => x.jira?.accountId && x.jira.accountId === u.accountId)
        || (u.correo && todas.find((x) => x.correo && x.correo === u.correo.toLowerCase()))
        || todas.find((x) => normalizarNombre(x.nombre) === normalizarNombre(u.nombre) || (x.jira?.nombre && normalizarNombre(x.jira.nombre) === normalizarNombre(u.nombre)));
      return { ...u, persona: p ? { id: p.id, nombre: p.nombre, vinculada: p.jira?.accountId === u.accountId } : null };
    });
  }

  /**
   * Aplica lo que el titular confirmó: `[{ accountId, nombre, correo, accion: 'crear' | 'vincular', persona? }]`.
   * Vincular solo añade la cuenta de Jira (y el correo si la persona no tenía); nunca pisa datos.
   */
  function importarJira(lista, proyecto, quien = 'panel') {
    const hechas = [];
    for (const u of lista) {
      if (!u?.accountId) continue;
      const jira = { accountId: String(u.accountId), nombre: String(u.nombre || '') };
      if (u.accion === 'vincular' && u.persona) {
        const p = obtener(u.persona);
        if (!p) continue;
        const proyectos = p.proyectos.includes('*') || !proyecto ? p.proyectos : [...new Set([...p.proyectos, proyecto])];
        hechas.push(actualizar(p.id, { jira, correo: p.correo || u.correo || '', proyectos }, quien));
      } else if (u.accion === 'crear') {
        hechas.push(crear({ nombre: u.nombre, correo: u.correo || '', jira, proyectos: proyecto ? [proyecto] : ['*'], cargo: '' }, quien));
      }
    }
    return hechas;
  }

  /** Personas de un proyecto (las de «todos los proyectos» incluidas). */
  const delProyecto = (c) => listar().filter((p) => p.proyectos.includes('*') || p.proyectos.includes(c.id));

  const CANAL = { correo: 'correo', telegram: 'Telegram', ninguno: 'no contactar directamente' };
  const POLITICA = { permitido: 'puedes escribirle directamente', 'pide-permiso': 'pide permiso antes de escribirle', no: 'no la contactes; pide al titular' };

  /** EQUIPO.md de un proyecto: lo que sus agentes necesitan para coordinarse con personas. */
  function textoEquipo(c) {
    const personas = delProyecto(c);
    const filas = personas.map((p) => {
      const lineas = [`### ${p.nombre}${p.cargo ? ` — ${p.cargo}` : ''}`, '', `- Id: \`${p.id}\``];
      if (p.correo) lineas.push(`- Correo: ${p.correo}`);
      lineas.push(`- Telegram: ${p.telegramVinculado ? 'vinculado con la oficina' : p.telegramUsuario ? `@${p.telegramUsuario} (aún no vinculado)` : 'no'}`);
      if (p.telefono && p.compartirTelefono) lineas.push(`- Teléfono: ${p.telefono}`);
      if (p.jira) lineas.push(`- Jira: ${p.jira.nombre || '—'}${p.jira.accountId ? ` (accountId \`${p.jira.accountId}\`)` : ''}`);
      if (p.horario || p.zonaHoraria) lineas.push(`- Disponibilidad: ${[p.horario, p.zonaHoraria].filter(Boolean).join(' · ')}`);
      lineas.push(`- Canal preferido: ${CANAL[p.canal]}`, `- Contacto: ${POLITICA[p.contacto]}`);
      if (p.notas) lineas.push(`- Notas: ${p.notas.replace(/\n+/g, ' ')}`);
      return lineas.join('\n');
    });
    return `# Equipo humano de «${c.nombre}»

Generado por la oficina a partir del directorio de ${general().titular || 'el titular'}; no lo edites (se reescribe).
Úsalo para saber a quién pedir qué: si una tarea tuya depende de una persona (por ejemplo, la
que tiene asignada una tarea en Jira), busca aquí su nombre o su cuenta de Jira.

${filas.length ? filas.join('\n\n') : '_Todavía no hay personas en este proyecto._'}
`;
  }

  /** Reescribe EQUIPO.md en cada proyecto si cambió. */
  function generarEquipos() {
    for (const c of contextos.todos()) {
      const ruta = path.join(c.raiz, 'EQUIPO.md');
      const texto = textoEquipo(c);
      let actual = null;
      try { actual = fs.readFileSync(ruta, 'utf8'); } catch {}
      if (actual !== texto) { fs.mkdirSync(c.raiz, { recursive: true }); fs.writeFileSync(ruta, texto); }
    }
  }

  return { listar, obtener, crear, actualizar, borrar, emparejarJira, importarJira, delProyecto, textoEquipo, generarEquipos };
}
