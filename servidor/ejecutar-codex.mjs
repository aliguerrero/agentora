import { correrCodex } from './motores.mjs';
import fs from 'node:fs';
import path from 'node:path';
let entrada = '';
for await (const chunk of process.stdin) entrada += chunk;
const opciones = JSON.parse(entrada);
// Puente deliberadamente acotado al encargo fiscal de investigación. El
// servidor lee las fuentes y escribe el informe dentro de esa carpeta.
const raiz = path.resolve(import.meta.dirname, '..');
const tareaEsperada = path.join(raiz, 'empleados', 'fiscal', 'encargos', '2026-10-27-continuidad-kan.md');
const puente = opciones.tarea && path.resolve(opciones.tarea) === tareaEsperada && !opciones.total;
// El CTO recibe el encargo completo aunque el entorno no permita leerlo desde
// el proceso hijo; las capacidades efectivas dependen de los permisos vigentes.
if (opciones.total && opciones.tarea && fs.existsSync(opciones.tarea)) {
  opciones.prompt += `\n\n--- Encargo proporcionado por la oficina ---\n${fs.readFileSync(opciones.tarea, 'utf8').slice(0, 50000)}\n\nIdentifica pasos pendientes y cambios parciales, y no afirmes que has escrito o publicado nada si no lo has hecho.`;
}
if (puente) {
  const directorios = [path.join(raiz, 'empleados', 'fiscal', 'informes'), path.join(raiz, 'reuniones')];
  const fuentes = directorios.flatMap(dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /kan-64|kan-104|2026-10-27-ok-/i.test(f) && f.endsWith('.md')).sort().slice(-12).map(f => path.join(dir, f)) : []);
  const documentos = [tareaEsperada, ...fuentes].map(f => `\n### ${path.relative(raiz, f)}\n${fs.readFileSync(f, 'utf8').slice(0, 30000)}`).join('\n');
  opciones.prompt = `Realiza la investigación siguiente usando únicamente los documentos incluidos. No necesitas ejecutar comandos ni escribir archivos: la oficina guardará tu informe. Distingue hechos, incertidumbres y pendientes; cita las rutas de las fuentes. Si la información es insuficiente, explica qué falta. Empieza tu respuesta final exactamente con INFORME_FISCAL y sigue con el informe en Markdown.\n${documentos}`;
  opciones.escribir = false;
}
const { promesa } = correrCodex({ ...opciones, alTexto: texto => console.log(JSON.stringify({ type: 'texto', texto })), alHerramienta: actividad => console.log(JSON.stringify({ type: 'actividad', ...actividad })) });
const resultado = await promesa;
if (puente && resultado.codigo === 0) {
  const texto = resultado.texto.trim();
  const inicio = texto.indexOf('INFORME_FISCAL');
  if (inicio >= 0 && texto.slice(inicio).length > 80) {
    const informe = texto.slice(inicio + 'INFORME_FISCAL'.length).trim();
    const rutaInforme = path.join(raiz, 'empleados', 'fiscal', 'informes', '2026-10-27-continuidad-kan.md');
    if (!fs.existsSync(rutaInforme)) fs.writeFileSync(rutaInforme, `# Continuidad fiscal de KAN-64\n\n${informe}\n`, { flag: 'wx' });
    const actual = fs.readFileSync(tareaEsperada, 'utf8');
    if (/^estado:\s*en-curso\s*$/m.test(actual)) fs.writeFileSync(tareaEsperada, actual.replace(/^estado:\s*en-curso\s*$/m, 'estado: hecho') + `\n\n## Resultado de la nueva ejecución\n\n${informe}\n`);
  } else {
    resultado.error = 'Codex no entregó un informe reconocible; el encargo sigue bloqueado.';
    resultado.codigo = 1;
  }
}
console.log(JSON.stringify({ type: 'result', ...resultado }));
process.exitCode = resultado.codigo || (resultado.error && !resultado.texto ? 1 : 0);
