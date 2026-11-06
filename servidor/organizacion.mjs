// Organización de la oficina: departamentos (las puntas de la estrella), roles
// (CEO = el titular, gerente general, jefes de departamento y agentes), nombres humanos
// y personalidades. El gerente y los jefes actúan dejando «solicitudes» JSON en su
// propia carpeta (empleados/<id>/solicitudes/); el servidor las atiende aquí, así
// ningún agente necesita permisos de escritura fuera de su carpeta.
import fs from 'node:fs';
import { emitirSenal } from './senales.mjs';
import path from 'node:path';
import { detectarInyeccion } from './cuarentena.mjs';

export const PERSONALIDADES = [
  { id: 'analista', nombre: 'El Analista', rasgos: 'Meticuloso y basado en datos. Antes de opinar pregunta «¿cuál es la evidencia?». Prefiere tablas, cifras y fuentes.' },
  { id: 'pragmatico', nombre: 'El Pragmático', rasgos: 'Orientado a resultados. Prioriza lo que entrega valor pronto y corta discusiones que no llevan a una decisión.' },
  { id: 'visionario', nombre: 'El Visionario', rasgos: 'Creativo y de largo plazo. Propone ideas nuevas y conecta el trabajo con la estrategia del proyecto.' },
  { id: 'diplomatico', nombre: 'El Diplomático', rasgos: 'Mediador. Busca consenso entre departamentos, reconoce el aporte de cada uno y cuida las relaciones.' },
  { id: 'guardian', nombre: 'El Guardián', rasgos: 'Prudente con riesgos, normas y calidad. Detecta qué puede fallar y exige pruebas antes de dar algo por hecho.' },
  { id: 'mentor', nombre: 'El Mentor', rasgos: 'Paciente y didáctico. Explica con ejemplos, documenta y ayuda a los colegas nuevos.' },
  { id: 'esceptico', nombre: 'El Escéptico constructivo', rasgos: 'Cuestiona los supuestos con respeto y siempre trae una alternativa concreta.' },
  { id: 'ejecutor', nombre: 'El Ejecutor', rasgos: 'Disciplinado y confiable. Cumple plazos, sigue procesos y avisa temprano cuando algo se atrasa.' },
  { id: 'comunicador', nombre: 'El Comunicador', rasgos: 'Claro y entusiasta. Resume para el negocio y mantiene a todos informados.' },
  { id: 'innovador', nombre: 'El Innovador técnico', rasgos: 'Curioso. Prueba herramientas nuevas, prototipa rápido y comparte lo que aprende.' },
];
const COLORES = ['#2f7cf6', '#0f9d7a', '#c2410c', '#9333ea', '#d97706', '#db2777', '#0891b2', '#65a30d'];
const MARCA_INI = '<!-- rol:inicio -->', MARCA_FIN = '<!-- rol:fin -->';

export function crearOrganizacion({ RAIZ, OFICINA = RAIZ, EMPLEADOS, idsEmpleados, leerMd, leerTexto, leerJson, slug, contratar, hoy, cuarentena = null,
  general = () => ({ titular: 'Titular', titularCorto: 'Titular', asistente: 'J.A.R.V.I.S.' }),
  // Política de contacto (contacto.mjs): { solicitar(de, s), decidir(id, decision, quien, nota) }.
  contacto = null,
  // Matriz de permisos (matriz.mjs): contratar, contactar y otorgar accesos a conexiones.
  matriz = null,
  // Obras de la casa: { pedir(de, s), decidir(de, s) }. El servidor comprueba autonomía y proyecto.
  obrasCasa = null }) {
  const TIT = () => general().titularCorto;
  const RUTA = path.join(RAIZ, 'organizacion.json');

  function leer() {
    const org = leerJson(RUTA, null) || {};
    // El titular y el asistente salen de la configuración (config/general.json).
    org.ceo = { nombre: general().asistente, titular: general().titular };
    org.gerente ??= idsEmpleados().includes('cto') ? 'cto' : null;
    org.departamentos ||= [];
    org.asignaciones ||= {};
    return org;
  }
  function guardar(org) { fs.writeFileSync(RUTA, JSON.stringify(org, null, 2)); }

  const personalidad = (id) => PERSONALIDADES.find((p) => p.id === id) || null;
  function rolDe(org, id) {
    if (org.gerente === id) return 'gerente';
    if (org.departamentos.some((d) => d.jefe === id)) return 'jefe';
    return 'agente';
  }

  // Cambia o agrega una clave del encabezado YAML del CLAUDE.md del empleado.
  function fijarMeta(id, clave, valor) {
    const ruta = path.join(EMPLEADOS, id, 'CLAUDE.md');
    if (!fs.existsSync(ruta)) return;
    let texto = leerTexto(ruta).replace(/\r\n/g, '\n');
    const limpio = String(valor).replace(/\r?\n/g, ' ').trim();
    const m = texto.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return;
    const re = new RegExp(`^${clave}:.*$`, 'm');
    const cab = re.test(m[1]) ? m[1].replace(re, () => `${clave}: ${limpio}`) : `${m[1]}\n${clave}: ${limpio}`;
    texto = texto.replace(m[0], () => `---\n${cab}\n---`);
    fs.writeFileSync(ruta, texto);
  }

  // Sección «Rol en la organización» del CLAUDE.md, regenerada al cambiar de rol.
  function escribirRol(org, id) {
    const ruta = path.join(EMPLEADOS, id, 'CLAUDE.md');
    if (!fs.existsSync(ruta)) return;
    const rol = rolDe(org, id);
    const depId = rol === 'jefe' ? org.departamentos.find((d) => d.jefe === id)?.id : org.asignaciones[id];
    const dep = org.departamentos.find((d) => d.id === depId);
    const carpeta = path.join(EMPLEADOS, id, 'solicitudes');
    const jefes = org.departamentos.filter((d) => d.jefe).map((d) => `- ${d.nombre}: \`${d.jefe}\``).join('\n') || '- (todavía no hay jefes)';
    const lista = PERSONALIDADES.map((p) => `\`${p.id}\` (${p.nombre})`).join(', ');
    const comunes = `**Organización** (\`${path.join(RAIZ, 'organizacion.json')}\`): el CEO es ${TIT()}, que solo aprueba lo realmente importante; el gerente general es \`${org.gerente}\`. Jefes de departamento:\n${jefes}\n\n**Pedir trabajo a otro departamento:** crea \`${carpeta}${path.sep}encargo-<tema>.json\` con \`{"para": "<id del jefe o agente>", "titulo": "...", "texto": "qué necesitas y qué entrega esperas"}\`. La oficina lo entrega en su carpeta \`encargos/\` y, cuando termina, **te llega sola su respuesta como un encargo nuevo** para que continúes.\n\n**Pedir permisos** (si te falta terminal o escribir en el proyecto): \`${carpeta}${path.sep}permiso-<tema>.json\` con \`{"nivel": "total", "motivo": "para qué"}\`. Lo decide el gerente al momento.\n\n**Autonomía total:** ${TIT()} solo indica en qué se trabaja. No le pidas revisión ni aprobación; tus dudas van a tu jefe o al gerente.\n\n**Escribir a una persona del equipo** (ver EQUIPO.md de tu proyecto) cuando tu trabajo dependa de ella: crea \`${carpeta}${path.sep}contacto-<tema>.json\` con \`{"para": "<id de la persona>", "canal": "auto" | "correo" | "telegram", "asunto": "...", "mensaje": "...", "motivo": "por qué lo necesitas"}\`. La oficina decide si sale directo o espera aprobación, respeta su horario y firma como agente de IA; si responde por Telegram, te llega como un encargo nuevo. Nunca incluyas secretos ni datos de pacientes.`;
    let cuerpo;
    if (rol === 'gerente') {
      cuerpo = `### Eres el Gerente General de la oficina

Diriges la oficina de forma autónoma: conviertes las necesidades de ${TIT()} (Jira, actas, chat) en trabajo de los departamentos, decides sin consultarle lo rutinario y escalas al CEO solo lo realmente importante (producto, dinero, riesgo legal o clínico).

- **Crear un departamento** (una nueva punta de la estrella): \`${carpeta}${path.sep}departamento-<nombre>.json\` con \`{"nombre": "...", "mision": "...", "jefe": {"nombre": "<nombre humano>", "puesto": "...", "descripcion": "...", "personalidad": "<id>"}}\`. La oficina lo crea y contrata a su jefe.
- **Contratar en un departamento:** \`${carpeta}${path.sep}contratar-<nombre>.json\` con \`{"departamento": "<id>", "nombre": "<nombre humano>", "puesto": "...", "descripcion": "...", "personalidad": "<id>"}\`. Normalmente lo hace el jefe del departamento.
- **Otorgar o retirar permisos** cuando tu análisis lo justifique: \`${carpeta}${path.sep}permisos-<empleado>.json\` con \`{"empleado": "<id>", "nivel": "total" | "basico", "perfil": "backend" | "frontend" | "qa" | "arquitectura" | "devops" | "investigacion" | "general", "motivo": "por qué"}\`. El perfil fija cuántos pasos puede dar por ejecución (servidor\\perfiles.json); si los agota, el encargo continúa solo en otra ejecución. Con «total», el agente trabaja dentro del proyecto activo con terminal y subagentes; con «basico», solo lee y escribe en su carpeta. Otorga lo mínimo necesario y retíralo al terminar.
- **Conceder conexiones** (GitHub, Jira, Gmail…) a un agente de tu proyecto: \`${carpeta}${path.sep}acceso-<empleado>.json\` con \`{"empleado": "<id>", "conexiones": {"<conexión>": "leer" | "escribir"}, "motivo": "..."}\`. Nunca por encima de tu propio nivel ni del techo que te fijó el CEO.
- **Salas de la casa:** si un departamento no tiene sala libre, pídesela al ingeniero civil de la casa con \`${carpeta}${path.sep}obra-<tema>.json\`: \`{"departamento": "<id>", "personas": 4, "necesidades": "qué hará el equipo y qué necesita la sala"}\`. Mientras tanto el departamento trabaja en el atrio: no lo esperes. El plano te llega como un encargo para decidir (en modo supervisado decide ${TIT()}).
- **Proyecto:** la oficina trabaja en el proyecto activo que elige el CEO (\`${path.join(OFICINA, 'proyectos.json')}\`). Para que un encargo se haga en otro proyecto, agrega \`proyecto: <id>\` al encabezado del encargo.
- Personalidades disponibles: ${lista}.

${comunes}`;
    } else if (rol === 'jefe') {
      cuerpo = `### Eres jefe del departamento «${dep?.nombre}»

Misión del departamento: ${dep?.mision || '(sin definir)'}

- Lideras a tu equipo, repartes el trabajo y respondes por él ante el gerente general.
- Coordinas con los demás jefes para resolver en equipo las tareas que crucen departamentos.
- **Contratar a tu equipo:** \`${carpeta}${path.sep}contratar-<nombre>.json\` con \`{"nombre": "<nombre y apellido humanos>", "puesto": "...", "descripcion": "misión concreta", "personalidad": "<id>"}\`. Combina personalidades complementarias en tu equipo. Disponibles: ${lista}. Contrata solo los agentes que realmente necesitas.

${comunes}`;
    } else {
      cuerpo = `### Formas parte del departamento «${dep?.nombre || 'sin asignar'}»

Tu jefe es \`${dep?.jefe || 'por definir'}\`: le reportas a él, y él coordina con los demás departamentos. Si necesitas algo de otro equipo, pídeselo a tu jefe o usa un encargo.

${comunes}`;
    }
    const p = personalidad(leerMd(ruta).meta.personalidad);
    const bloque = `${MARCA_INI}\n## Rol en la organización\n\n${cuerpo}\n${p ? `\n## Personalidad: ${p.nombre}\n\n${p.rasgos} Que se note en tu tono y tu forma de trabajar, sin perder el rigor.\n` : ''}${MARCA_FIN}`;
    let texto = leerTexto(ruta).replace(/\r\n/g, '\n');
    const i = texto.indexOf(MARCA_INI), f = texto.indexOf(MARCA_FIN);
    texto = i >= 0 && f > i ? texto.slice(0, i) + bloque + texto.slice(f + MARCA_FIN.length) : `${texto.trimEnd()}\n\n${bloque}\n`;
    fs.writeFileSync(ruta, texto);
  }
  function reescribirRoles(org) { for (const id of idsEmpleados()) escribirRol(org, id); }

  /** Un nombre visible: va al encabezado de la ficha y a los prompts, así que solo admite texto simple. */
  function nombreValido(nombre, max) {
    const limpio = String(nombre || '').replace(/\s+/g, ' ').trim();
    if (limpio.length < 2) throw Object.assign(new Error('El nombre es muy corto.'), { codigo: 400 });
    if (limpio.length > max) throw Object.assign(new Error(`El nombre admite hasta ${max} caracteres.`), { codigo: 400 });
    if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'’&()\/·-]*$/u.test(limpio)) throw Object.assign(new Error('Usa solo letras, números, espacios y . , \' & ( ) / · -'), { codigo: 400 });
    return limpio;
  }
  const iguales = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

  function crearDepartamento({ nombre, mision, color }) {
    const org = leer();
    nombre = String(nombre || '').trim().slice(0, 50);
    if (nombre.length < 2) throw Object.assign(new Error('El departamento necesita un nombre.'), { codigo: 400 });
    let id = slug(nombre, 30) || 'departamento';
    if (org.departamentos.some((d) => d.id === id)) throw Object.assign(new Error(`Ya existe el departamento «${id}».`), { codigo: 409 });
    org.departamentos.push({ id, nombre, mision: String(mision || '').trim().slice(0, 600), color: color || COLORES[org.departamentos.length % COLORES.length], jefe: null, creado: hoy() });
    guardar(org);
    return id;
  }

  function editarDepartamento(id, cambios) {
    const org = leer();
    const dep = org.departamentos.find((d) => d.id === id);
    if (!dep) throw Object.assign(new Error('No existe ese departamento'), { codigo: 404 });
    if (cambios.nombre) {
      const nombre = nombreValido(cambios.nombre, 50);
      if (org.departamentos.some((d) => d.id !== id && iguales(d.nombre, nombre))) throw Object.assign(new Error('Ya hay un departamento con ese nombre.'), { codigo: 409 });
      dep.nombre = nombre;
    }
    if (cambios.mision !== undefined) dep.mision = String(cambios.mision).trim().slice(0, 600);
    if (cambios.jefe !== undefined) {
      if (cambios.jefe && !idsEmpleados().includes(cambios.jefe)) throw Object.assign(new Error('No existe ese empleado'), { codigo: 404 });
      dep.jefe = cambios.jefe || null;
      if (dep.jefe) org.asignaciones[dep.jefe] = dep.id;
    }
    guardar(org); reescribirRoles(org);
    if (cambios.nombre) for (const [emp, d] of Object.entries(org.asignaciones)) if (d === id) fijarMeta(emp, 'departamento', dep.nombre);
  }

  function asignar(empleado, departamento) {
    const org = leer();
    if (!idsEmpleados().includes(empleado)) throw Object.assign(new Error('No existe ese empleado'), { codigo: 404 });
    if (departamento && !org.departamentos.some((d) => d.id === departamento)) throw Object.assign(new Error('No existe ese departamento'), { codigo: 404 });
    if (departamento) org.asignaciones[empleado] = departamento; else delete org.asignaciones[empleado];
    for (const d of org.departamentos) if (d.jefe === empleado && d.id !== departamento) d.jefe = null;
    guardar(org); reescribirRoles(org);
    const dep = org.departamentos.find((d) => d.id === departamento);
    fijarMeta(empleado, 'departamento', dep ? dep.nombre : '');
  }

  function renombrar(id, nombre) {
    if (!idsEmpleados().includes(id)) throw Object.assign(new Error('No existe ese empleado'), { codigo: 404 });
    nombre = nombreValido(nombre, 40);
    const nombreDe = (x) => leerMd(path.join(EMPLEADOS, x, 'CLAUDE.md')).meta.nombre || x;
    const anterior = nombreDe(id);
    if (anterior === nombre) return false;
    if (idsEmpleados().some((x) => x !== id && fs.existsSync(path.join(EMPLEADOS, x, 'CLAUDE.md')) && iguales(nombreDe(x), nombre))) throw Object.assign(new Error('Ya hay un empleado con ese nombre.'), { codigo: 409 });
    fijarMeta(id, 'nombre', nombre);
    // El título de la ficha, si era su nombre, y una nota en su memoria para que no se contradiga.
    const ruta = path.join(EMPLEADOS, id, 'CLAUDE.md');
    const ficha = leerTexto(ruta);
    const titulo = new RegExp(`^# ${anterior.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
    if (titulo.test(ficha)) fs.writeFileSync(ruta, ficha.replace(titulo, () => `# ${nombre}`));
    const hoyLocal = new Date().toLocaleDateString('sv');
    fs.appendFileSync(path.join(EMPLEADOS, id, 'memoria.md'), `\n- ${hoyLocal}: ${TIT()} cambió tu nombre de «${anterior}» a «${nombre}». Preséntate como ${nombre}.\n`);
    return true;
  }

  // Contrata con departamento, personalidad y rol, y deja escrito su lugar en la organización.
  function contratarEn({ departamento, nombre, puesto, descripcion, personalidad: per, comoJefe = false }) {
    const org = leer();
    const dep = org.departamentos.find((d) => d.id === departamento);
    if (!dep) throw Object.assign(new Error(`No existe el departamento «${departamento}».`), { codigo: 404 });
    const p = personalidad(per) || PERSONALIDADES[Math.floor(Math.random() * PERSONALIDADES.length)];
    const extra = `Departamento: ${dep.nombre}${comoJefe ? ' (eres su jefe)' : ''}. Personalidad: ${p.nombre}: ${p.rasgos}`;
    const id = contratar({ nombre, puesto, descripcion: `${descripcion}\n\n${extra}`, meta: { personalidad: p.id, departamento: dep.nombre } });
    const org2 = leer();
    org2.asignaciones[id] = dep.id;
    if (comoJefe) org2.departamentos.find((d) => d.id === dep.id).jefe = id;
    guardar(org2); reescribirRoles(org2);
    return id;
  }

  // Deja un encargo pendiente en la carpeta del destinatario; la oficina lo ejecuta
  // y, al terminar, le devuelve la respuesta a quien lo pidió.
  // Lo escriben agentes (que leen la web): si trae una inyección, no se entrega y queda en
  // cuarentena hasta que el titular decida (servidor/cuarentena.mjs). Devuelve el error para el agente.
  function escribirEncargo(de, para, titulo, texto, extra = {}, tipo = 'encargo') {
    const archivo = `${hoy()}-${de}-${slug(titulo, 40)}-${Date.now().toString(36).slice(-4)}.md`;
    const cab = Object.entries({ de, fecha: hoy(), estado: 'pendiente', ...extra }).map(([k, v]) => `${k}: ${String(v).replace(/\r?\n/g, ' ')}`).join('\n');
    const contenido = `---\n${cab}\n---\n# ${titulo}\n\n${texto}\n`;
    const hallazgos = cuarentena ? detectarInyeccion(contenido) : [];
    if (hallazgos.length) {
      const id = cuarentena.retener({ tipo, de, para, archivo, contenido, titulo, hallazgos });
      throw new Error(`Retenido en cuarentena (${hallazgos.join(', ')}): no se entregó. ${TIT()} decide si se libera (${id}). Si citaste texto de la web, resúmelo con tus palabras.`);
    }
    const destino = path.join(EMPLEADOS, para, 'encargos');
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, archivo), contenido);
    emitirSenal(RAIZ, extra.via === 'patricia' ? 'patricia' : de, para, archivo);
    return archivo;
  }

  // Atiende las solicitudes de los agentes (contratar, departamentos, permisos y encargos).
  function procesarSolicitudes() {
    const hechas = [];
    const org = leer();
    for (const id of idsEmpleados()) {
      const rol = rolDe(org, id);
      const dir = path.join(EMPLEADOS, id, 'solicitudes');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const ruta = path.join(dir, f);
        const s = leerJson(ruta, {});
        let resultado;
        try {
          // La matriz puede quitar capacidades a un perfil o a un agente concreto.
          const permite = (cap) => !matriz || matriz.efectivo(id)[cap] !== false;
          if ((f.startsWith('departamento-') || f.startsWith('contratar-')) && !permite('contratar')) throw new Error('Tu perfil no tiene permiso para contratar (Configuración › Permisos).');
          if (f.startsWith('contacto-') && !permite('contactar')) throw new Error('Tu perfil no tiene permiso para contactar personas (Configuración › Permisos).');
          if (f.startsWith('departamento-')) {
            if (rol !== 'gerente') throw new Error('Solo el gerente general crea departamentos.');
            const dep = crearDepartamento(s);
            resultado = { ok: true, departamento: dep };
            if (s.jefe?.nombre) resultado.jefe = contratarEn({ ...s.jefe, departamento: dep, comoJefe: true });
          } else if (f.startsWith('contratar-')) {
            if (rol === 'agente') throw new Error('Solo el gerente y los jefes contratan.');
            const departamento = rol === 'jefe' ? org.departamentos.find((d) => d.jefe === id).id : s.departamento;
            resultado = { ok: true, id: contratarEn({ ...s, departamento }) };
          } else if (f.startsWith('permisos-')) {
            // El CEO delegó en el gerente otorgar permisos según su análisis (2026-10-28).
            // Los vetos de servidor/vetado-total.json siguen aplicando a cualquier nivel.
            if (rol !== 'gerente') throw new Error('Solo el gerente general otorga permisos.');
            const quien = String(s.empleado || '');
            if (!idsEmpleados().includes(quien)) throw new Error(`No existe el empleado «${quien}».`);
            if (!['total', 'basico'].includes(s.nivel)) throw new Error('nivel debe ser «total» o «basico».');
            if (String(s.motivo || '').trim().length < 10) throw new Error('Explica el motivo (al menos 10 caracteres).');
            // El perfil (backend, frontend, qa...) fija su tope de pasos (servidor/perfiles.json).
            const perfiles = Object.keys(leerJson(path.join(OFICINA, 'servidor', 'perfiles.json'), {}).perfiles || {});
            if (s.perfil && !perfiles.includes(s.perfil)) throw new Error(`perfil debe ser uno de: ${perfiles.join(', ')}.`);
            const ruta = path.join(EMPLEADOS, quien, 'permisos.json');
            const previo = leerJson(ruta, {});
            fs.writeFileSync(ruta, JSON.stringify({ ...previo, nivel: s.nivel, ...(s.perfil ? { perfil: s.perfil } : {}), otorgadoPor: id, motivo: String(s.motivo).trim().slice(0, 500), fecha: hoy() }, null, 2));
            resultado = { ok: true, empleado: quien, nivel: s.nivel, perfil: s.perfil || previo.perfil || null };
          } else if (f.startsWith('permiso-')) {
            // Cualquier agente pide permisos al gerente; él decide sin esperar al titular.
            if (!org.gerente || !idsEmpleados().includes(org.gerente)) throw new Error('No hay gerente general asignado.');
            if (id === org.gerente) throw new Error('El gerente se otorga permisos con permisos-<id>.json.');
            const nivel = s.nivel === 'basico' ? 'basico' : 'total';
            const nombre = leerMd(path.join(EMPLEADOS, id, 'CLAUDE.md')).meta.nombre || id;
            const archivo = escribirEncargo(id, org.gerente, `Permiso «${nivel}» para ${nombre}`,
              `${nombre} (\`${id}\`) pide permisos de nivel «${nivel}».\n\nMotivo: ${s.motivo || '(sin motivo)'}\n\nDecide según tu análisis, sin consultar a ${TIT()}. Si procede, crea \`solicitudes/permisos-${id}.json\` con \`{"empleado": "${id}", "nivel": "${nivel}", "motivo": "..."}\`. Si no procede, explica por qué en tu resultado: la respuesta le llega sola a ${nombre}.`, {}, 'permiso');
            resultado = { ok: true, para: org.gerente, archivo };
          } else if (f.startsWith('encargo-')) {
            const para = String(s.para || '');
            if (!idsEmpleados().includes(para)) throw new Error(`No existe el destinatario «${para}».`);
            const archivo = escribirEncargo(id, para, s.titulo || 'Encargo', s.texto || '', s.proyecto ? { proyecto: s.proyecto } : {});
            resultado = { ok: true, para, archivo };
          } else if (f.startsWith('acceso-')) {
            // Conceder a otro agente de tu proyecto acceso a conexiones MCP, sin pasar tu techo.
            if (!matriz) throw new Error('La matriz de permisos no está disponible.');
            const quien = String(s.empleado || '');
            if (!idsEmpleados().includes(quien)) throw new Error(`No existe «${quien}» en tu proyecto.`);
            matriz.otorgar(id, rol === 'gerente', { empleado: quien, conexiones: s.conexiones || {} });
            resultado = { ok: true, empleado: quien, conexiones: s.conexiones };
          } else if (f.startsWith('contacto-')) {
            if (!contacto) throw new Error('La oficina no tiene la política de contacto disponible.');
            const r = contacto.solicitar(id, s);
            resultado = { ok: true, mensaje: r.id, estado: r.estado, motivo: r.porque, ...(r.enviarDesde ? { enviarDesde: r.enviarDesde } : {}) };
          } else if (f.startsWith('obra-')) {
            if (rol === 'jefe') throw new Error('Una sala se pide por el gerente general: envíale un encargo con lo que necesita tu departamento.');
            if (rol !== 'gerente') throw new Error('Solo el gerente general pide salas al ingeniero.');
            if (!obrasCasa) throw new Error('La oficina no tiene obras disponibles.');
            resultado = { ok: true, pedido: obrasCasa.pedir(id, s).id };
          } else if (f.startsWith('aprobar-obra-')) {
            if (rol !== 'gerente') throw new Error('Solo el gerente general decide sobre una obra.');
            if (!obrasCasa) throw new Error('La oficina no tiene obras disponibles.');
            const o = obrasCasa.decidir(id, s);
            resultado = { ok: true, obra: o.id, estado: o.estado };
          } else if (f.startsWith('aprobar-contacto-')) {
            // Solo el gerente del proyecto (y nunca sobre sus propios mensajes; lo valida contacto.mjs).
            if (rol !== 'gerente') throw new Error('Solo el gerente general aprueba mensajes a personas.');
            if (!contacto) throw new Error('La oficina no tiene la política de contacto disponible.');
            const r = contacto.decidir(String(s.id || ''), s.decision === 'rechazar' ? 'rechazar' : 'aprobar', id, s.nota || '');
            resultado = { ok: true, mensaje: r.id, estado: r.estado };
          } else throw new Error('Tipo de solicitud desconocido (usa departamento-, contratar-, permisos-, permiso-, acceso-, encargo-, contacto-, aprobar-contacto-, obra- o aprobar-obra-).');
        } catch (e) { resultado = { ok: false, error: e.message }; }
        fs.mkdirSync(path.join(dir, 'procesadas'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'procesadas', f), JSON.stringify({ solicitud: s, resultado, fecha: hoy() }, null, 2));
        fs.rmSync(ruta);
        hechas.push({ de: id, archivo: f, resultado });
      }
    }
    return hechas;
  }

  function resumen() {
    const org = leer();
    const ids = idsEmpleados();
    return {
      ceo: org.ceo, gerente: org.gerente,
      departamentos: org.departamentos.map((d) => ({ ...d, miembros: ids.filter((e) => org.asignaciones[e] === d.id) })),
      roles: Object.fromEntries(ids.map((e) => [e, rolDe(org, e)])),
      asignaciones: org.asignaciones,
      personalidades: PERSONALIDADES,
    };
  }

  return { leer, guardar, resumen, crearDepartamento, editarDepartamento, asignar, renombrar, contratarEn, procesarSolicitudes, reescribirRoles, escribirEncargo };
}
