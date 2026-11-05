// Proyectos como contextos aislados. Cada proyecto tiene su propia carpeta de contexto con
//   empleados/  reuniones/  contrataciones/  organizacion.json
// El proyecto que ya existía antes de los contextos usa la raíz de la oficina tal
// cual («contexto: "."»): no se mueve ni un archivo. Los nuevos viven en contextos/<id>/.
//
// Los ids de empleado son únicos en toda la oficina (ningún proyecto repite uno), así los
// registros, las marcas en-curso y los chats no se mezclan entre proyectos.
//
// Estado de cada proyecto: «activo» (su cola trabaja) o «pausado» (no arranca trabajo nuevo;
// lo que ya estaba en marcha termina). El proyecto seleccionado siempre está activo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_POR_DEFECTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leerJson = (r, d = null) => { try { return JSON.parse(fs.readFileSync(r, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const escribirJson = (r, d) => { fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(`${r}.tmp`, JSON.stringify(d, null, 2)); fs.renameSync(`${r}.tmp`, r); };
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function crearContextos({ RAIZ = RAIZ_POR_DEFECTO } = {}) {
  const PROYECTOS = path.join(RAIZ, 'proyectos.json');

  /**
   * proyectos.json con cada proyecto completado: contexto y estado. La primera vez, el
   * proyecto que ya trabajaba con empleados/ en la raíz queda como contexto «.».
   */
  function leer() {
    const d = leerJson(PROYECTOS, { activo: null, proyectos: [] });
    d.proyectos ||= [];
    let cambio = false;
    const raizUsada = d.proyectos.some((p) => p.contexto === '.');
    const legado = fs.existsSync(path.join(RAIZ, 'empleados'));
    for (const p of d.proyectos) {
      if (!p.contexto) {
        const usarRaiz = legado && !raizUsada && !d.proyectos.some((x) => x.contexto === '.') && (p.id === d.activo || p === d.proyectos[0]);
        p.contexto = usarRaiz ? '.' : `contextos/${p.id}`;
        cambio = true;
      }
      if (!['activo', 'pausado'].includes(p.estado)) { p.estado = 'activo'; cambio = true; }
    }
    if (d.activo && !d.proyectos.some((p) => p.id === d.activo)) { d.activo = d.proyectos[0]?.id ?? null; cambio = true; }
    if (cambio && d.proyectos.length) escribirJson(PROYECTOS, d);
    return d;
  }

  const raizDe = (p) => path.resolve(RAIZ, p.contexto || `contextos/${p.id}`);
  /** Rutas de un contexto (proyecto). */
  function ctx(p) {
    const raiz = raizDe(p);
    return {
      id: p.id, nombre: p.nombre, repo: p.ruta, estado: p.estado, raiz,
      empleados: path.join(raiz, 'empleados'),
      reuniones: path.join(raiz, 'reuniones'),
      contrataciones: path.join(raiz, 'contrataciones'),
      organizacion: path.join(raiz, 'organizacion.json'),
    };
  }

  const todos = () => leer().proyectos.map(ctx);
  const porId = (id) => { const p = leer().proyectos.find((x) => x.id === id); return p ? ctx(p) : null; };
  function activo() {
    const d = leer();
    const p = d.proyectos.find((x) => x.id === d.activo) || d.proyectos[0];
    return p ? ctx(p) : null;
  }
  /** Proyectos cuya cola trabaja: los «activo» (el seleccionado siempre lo está). */
  const enMarcha = () => todos().filter((c) => c.estado === 'activo');

  const idsDe = (c) => {
    if (!c || !fs.existsSync(c.empleados)) return [];
    return fs.readdirSync(c.empleados, { withFileTypes: true }).filter((d) => d.isDirectory() && ID.test(d.name)).map((d) => d.name).sort();
  };

  /** Contexto al que pertenece un empleado (o null). */
  function deEmpleado(id) {
    if (!ID.test(String(id))) return null;
    return todos().find((c) => fs.existsSync(path.join(c.empleados, id))) || null;
  }
  /** Carpeta del empleado; si aún no existe, la que tendría en el proyecto activo. */
  function dirEmpleado(id) {
    const c = deEmpleado(id) || activo();
    return path.join(c ? c.empleados : path.join(RAIZ, 'empleados'), String(id));
  }
  const todosLosIds = () => todos().flatMap(idsDe);

  /** Id libre en TODA la oficina a partir de un nombre ya convertido en slug. */
  function idLibre(base, sufijo) {
    const usados = new Set(todosLosIds());
    if (!usados.has(base)) return base;
    const conSufijo = `${base}-${sufijo}`.slice(0, 60).replace(/-+$/, '');
    if (!usados.has(conSufijo)) return conSufijo;
    for (let n = 2; ; n++) if (!usados.has(`${conSufijo}-${n}`)) return `${conSufijo}-${n}`;
  }

  /** Crea la estructura de un contexto nuevo (vacío: sin agentes). */
  function preparar(c) {
    for (const d of [c.empleados, c.reuniones, c.contrataciones]) fs.mkdirSync(d, { recursive: true });
    if (!fs.existsSync(c.organizacion)) escribirJson(c.organizacion, { gerente: null, departamentos: [], asignaciones: {} });
  }

  function cambiarEstado(id, estado) {
    if (!['activo', 'pausado'].includes(estado)) throw Object.assign(new Error('Estado no válido.'), { codigo: 400 });
    const d = leer();
    const p = d.proyectos.find((x) => x.id === id);
    if (!p) throw Object.assign(new Error('No existe ese proyecto.'), { codigo: 404 });
    if (estado === 'pausado' && d.activo === id) throw Object.assign(new Error('El proyecto seleccionado no se puede pausar.'), { codigo: 409 });
    p.estado = estado;
    escribirJson(PROYECTOS, d);
  }

  /** Selecciona un proyecto (queda activo) y decide qué pasa con el anterior. */
  function seleccionar(id, anterior = 'segundo-plano') {
    const d = leer();
    const nuevo = d.proyectos.find((x) => x.id === id);
    if (!nuevo) throw Object.assign(new Error('No existe ese proyecto.'), { codigo: 404 });
    const viejo = d.proyectos.find((x) => x.id === d.activo);
    if (viejo && viejo.id !== id) viejo.estado = anterior === 'pausar' ? 'pausado' : 'activo';
    nuevo.estado = 'activo';
    d.activo = id;
    escribirJson(PROYECTOS, d);
    preparar(ctx(nuevo));
    return ctx(nuevo);
  }

  return { leer, todos, porId, activo, enMarcha, idsDe, deEmpleado, dirEmpleado, todosLosIds, idLibre, preparar, cambiarEstado, seleccionar, RAIZ };
}

// Uso desde ejecutar.mjs: node servidor/contextos.mjs ubicar <empleado>
// → JSON { dir, contexto, empleados, contrataciones, repo, proyecto }
// node servidor/contextos.mjs empleados → carpetas de los empleados de los proyectos en marcha.
// node servidor/contextos.mjs activo → carpeta empleados/ del proyecto seleccionado.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'empleados') {
  const c = crearContextos();
  process.stdout.write(c.enMarcha().flatMap((x) => c.idsDe(x).map((id) => path.join(x.empleados, id))).join('\n'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'activo') {
  process.stdout.write(crearContextos().activo()?.empleados || '');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'ubicar') {
  const c = crearContextos();
  const id = process.argv[3];
  const x = c.deEmpleado(id);
  if (!x) { process.stderr.write(`No existe el empleado «${id}» en ningún proyecto.`); process.exit(2); }
  process.stdout.write(JSON.stringify({ dir: path.join(x.empleados, id), contexto: x.raiz, empleados: x.empleados, contrataciones: x.contrataciones, repo: x.repo, proyecto: x.id, estado: x.estado }));
}
