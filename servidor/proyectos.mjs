// Proyectos en los que trabaja la oficina. El CEO elige el activo desde la sala de
// Configuración › Proyectos, agrega una carpeta existente o crea uno nuevo (carpeta
// + git init). Un encargo puede indicar otro con «proyecto: <id>» en su encabezado.
// Uso: node servidor/proyectos.mjs ruta [archivo-del-encargo]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearContextos } from './contextos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = path.join(RAIZ, 'proyectos.json');
const CARPETA_NUEVOS = path.join(path.dirname(RAIZ), 'proyectos'); // Documentos\DevBox\proyectos
const leerJson = (r) => { try { return JSON.parse(fs.readFileSync(r, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

export function leerProyectos() {
  const datos = leerJson(RUTA);
  return datos?.proyectos ? datos : { activo: null, proyectos: [] };
}

export function proyectoActivo() {
  const d = leerProyectos();
  return d.proyectos.find((p) => p.id === d.activo) || d.proyectos[0] || null;
}

export function rutaProyecto(id) {
  const d = leerProyectos();
  const p = id ? d.proyectos.find((x) => x.id === id) : proyectoActivo();
  return p && fs.existsSync(p.ruta) ? p.ruta : null;
}

// Ruta donde debe trabajar una tarea: la que indique su encabezado; si no, el repositorio del
// proyecto al que pertenece el empleado (cada proyecto es un contexto); si no, el seleccionado.
export function rutaDeTrabajo(texto = '', empleado = '') {
  const m = String(texto).match(/^proyecto:\s*([a-z0-9-]+)\s*$/m);
  const propio = empleado ? crearContextos({ RAIZ }).deEmpleado(empleado) : null;
  return (m && rutaProyecto(m[1])) || (propio && rutaProyecto(propio.id)) || rutaProyecto();
}

export function agregarProyecto({ nombre, ruta, descripcion, crear }) {
  const d = leerProyectos();
  nombre = String(nombre || '').trim().slice(0, 60);
  const id = slug(nombre);
  if (!id) throw Object.assign(new Error('El proyecto necesita un nombre.'), { codigo: 400 });
  if (d.proyectos.some((p) => p.id === id)) throw Object.assign(new Error(`Ya existe el proyecto «${id}».`), { codigo: 409 });
  ruta = String(ruta || '').trim();
  if (crear) {
    ruta = ruta || path.join(CARPETA_NUEVOS, id);
    if (fs.existsSync(ruta) && fs.readdirSync(ruta).length) throw Object.assign(new Error('Esa carpeta ya existe y no está vacía: agrégala como proyecto existente.'), { codigo: 409 });
    fs.mkdirSync(ruta, { recursive: true });
    fs.writeFileSync(path.join(ruta, 'README.md'), `# ${nombre}\n\n${descripcion || ''}\n\nProyecto creado por la oficina DevBox el ${hoy()} a pedido del CEO.\n`);
    const git = spawnSync('git', ['init'], { cwd: ruta, windowsHide: true });
    if (git.status !== 0) throw Object.assign(new Error(`Se creó la carpeta, pero git init falló: ${String(git.stderr || git.error?.message || '').trim().slice(0, 300)}`), { codigo: 500 });
  } else if (!ruta || !fs.existsSync(ruta) || !fs.statSync(ruta).isDirectory()) {
    throw Object.assign(new Error('Esa carpeta no existe.'), { codigo: 400 });
  }
  d.proyectos.push({ id, nombre, ruta: path.resolve(ruta), descripcion: String(descripcion || '').trim().slice(0, 600), creado: hoy() });
  if (!d.activo) d.activo = id;
  fs.writeFileSync(RUTA, JSON.stringify(d, null, 2));
  return id;
}

export function activarProyecto(id) {
  const d = leerProyectos();
  if (!d.proyectos.some((p) => p.id === id)) throw Object.assign(new Error('No existe ese proyecto'), { codigo: 404 });
  d.activo = id;
  fs.writeFileSync(RUTA, JSON.stringify(d, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'ruta') {
  const archivo = process.argv[3];
  const texto = archivo && fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : '';
  process.stdout.write(rutaDeTrabajo(texto, process.argv[4] || '') || '');
}
