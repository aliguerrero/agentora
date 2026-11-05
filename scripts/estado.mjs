// Muestra en la terminal el estado de los empleados del proyecto seleccionado.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OFICINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let carpeta = '';
try { carpeta = execFileSync(process.execPath, [path.join(OFICINA, 'servidor', 'contextos.mjs'), 'activo'], { encoding: 'utf8', windowsHide: true }).trim(); } catch { /* sin proyecto */ }
if (!carpeta || !fs.existsSync(carpeta)) { console.log('No hay empleados en el proyecto seleccionado.'); process.exit(0); }

const ejecuciones = [];
try {
  for (const l of fs.readFileSync(path.join(OFICINA, 'logs', 'ejecuciones.jsonl'), 'utf8').split(/\r?\n/)) {
    try { if (l.trim()) ejecuciones.push(JSON.parse(l.replace(/^﻿/, ''))); } catch { /* línea dañada */ }
  }
} catch { /* sin registro */ }

const contar = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length; } catch { return 0; } };
const filas = fs.readdirSync(carpeta, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
  const marca = path.join(OFICINA, 'logs', 'en-curso', `${e.name}.json`);
  // Una marca de más de 3 horas es de una ejecución que murió sin limpiar.
  const activo = fs.existsSync(marca) && Date.now() - fs.statSync(marca).mtimeMs < 3 * 3600e3;
  return {
    Empleado: e.name,
    Estado: activo ? 'trabajando' : 'libre',
    Preguntas: String(contar(path.join(carpeta, e.name, 'bandeja'))),
    Informes: String(contar(path.join(carpeta, e.name, 'informes'))),
    Ultima: ejecuciones.filter((x) => x.empleado === e.name).at(-1)?.inicio || '',
  };
});
if (!filas.length) { console.log('No hay empleados en el proyecto seleccionado.'); process.exit(0); }
const columnas = Object.keys(filas[0]);
const ancho = Object.fromEntries(columnas.map((c) => [c, Math.max(c.length, ...filas.map((f) => f[c].length))]));
const linea = (f) => columnas.map((c) => f[c].padEnd(ancho[c])).join('  ').trimEnd();
console.log(linea(Object.fromEntries(columnas.map((c) => [c, c]))));
console.log(linea(Object.fromEntries(columnas.map((c) => [c, '-'.repeat(c.length)]))));
for (const f of filas) console.log(linea(f));
