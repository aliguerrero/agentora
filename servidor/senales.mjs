import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ruta = (raiz) => path.join(raiz, 'logs', 'senales-agentes.jsonl');
export function leerSenales(raiz) {
  try { return fs.readFileSync(ruta(raiz), 'utf8').trim().split('\n').slice(-100).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }); }
  catch { return []; }
}
export function emitirSenal(raiz, de, para, archivo) {
  const evento = { id: randomUUID(), fecha: new Date().toISOString(), de, para, archivo };
  fs.mkdirSync(path.dirname(ruta(raiz)), { recursive: true });
  fs.appendFileSync(ruta(raiz), JSON.stringify(evento) + '\n');
  return evento;
}

const normalizar = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const contiene = (texto, frase) => (` ${texto.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${frase.replace(/[^a-z0-9]+/g, ' ').trim()} `);
/** Selección local y explicable. Lo ambiguo va al gerente, que puede delegarlo con su motor. */
export function elegirDestinatarios(texto, modo, organizacion, agentes) {
  const ids = new Set(agentes.map((a) => a.id));
  if (modo === 'todos') return { ids: [...ids], motivo: 'Me pediste avisar a todo el equipo.' };
  const t = normalizar(texto);
  const directos = agentes.filter((a) => [a.id, a.nombre].some((n) => n && contiene(t, normalizar(n)))).map((a) => a.id);
  const departamentos = organizacion.departamentos.filter((d) => contiene(t, normalizar(d.nombre)) || contiene(t, normalizar(d.id)));
  const seleccion = [...new Set([...directos, ...departamentos.flatMap((d) => agentes.filter((a) => organizacion.asignaciones[a.id] === d.id).map((a) => a.id))])];
  if (seleccion.length) return { ids: seleccion, motivo: 'Elegí los agentes o departamentos que mencionaste.' };
  if (organizacion.gerente && ids.has(organizacion.gerente)) return { ids: [organizacion.gerente], motivo: 'Se lo envío al gerente para que determine quién debe participar y lo delegue.' };
  throw new Error('No hay gerente ni destinatarios reconocidos. Menciona un agente o elige todo el equipo.');
}
