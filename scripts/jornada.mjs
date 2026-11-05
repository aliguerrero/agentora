// Jornada diaria de la oficina: la lanza el Programador de tareas (Windows) o cron (Linux), de lunes
// a viernes. Por cada empleado: rutina diaria; los lunes, también la semanal; la mensual en la primera
// jornada del mes en que aún no exista su informe. Después, los encargos que quedaron pendientes.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OFICINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hoy = new Date();
const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
const ejecutar = (...args) => spawnSync(process.execPath, [path.join(OFICINA, 'scripts', 'ejecutar.mjs'), ...args], { stdio: 'inherit', windowsHide: true });

// Todos los proyectos en marcha (los pausados no arrancan trabajo nuevo).
const carpetas = execFileSync(process.execPath, [path.join(OFICINA, 'servidor', 'contextos.mjs'), 'empleados'], { encoding: 'utf8', windowsHide: true })
  .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

for (const carpeta of carpetas) {
  const id = path.basename(carpeta);
  const rutina = (n) => fs.existsSync(path.join(carpeta, 'rutinas', `${n}.md`));
  const pendientes = [];
  if (rutina('diaria')) pendientes.push('diaria');
  if (hoy.getDay() === 1 && rutina('semanal')) pendientes.push('semanal');
  if (rutina('mensual')) {
    let informes = [];
    try { informes = fs.readdirSync(path.join(carpeta, 'informes')); } catch { /* sin informes */ }
    if (!informes.some((f) => f.startsWith(`${mes}-`) && f.endsWith('-mensual.md'))) pendientes.push('mensual');
  }
  for (const r of pendientes) ejecutar('--empleado', id, '--rutina', r);

  // Encargos que dejó un colega (o un acta aprobada) mientras el servidor estaba apagado.
  const dirEncargos = path.join(carpeta, 'encargos');
  if (!fs.existsSync(dirEncargos)) continue;
  for (const f of fs.readdirSync(dirEncargos).filter((x) => x.endsWith('.md')).sort()) {
    const ruta = path.join(dirEncargos, f);
    const texto = fs.readFileSync(ruta, 'utf8');
    if (!/^estado:\s*pendiente\s*$/m.test(texto)) continue;
    fs.writeFileSync(ruta, texto.replace(/^estado:\s*pendiente\s*$/m, 'estado: en-curso'));
    ejecutar('--empleado', id, '--encargo', f);
  }
}
