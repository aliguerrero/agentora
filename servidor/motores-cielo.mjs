// Cuántos trabajos corre cada motor ahora mismo, para los motores que vuelan sobre la casa. Los
// trabajos vienen por dos caminos: lo que lanza este servidor (chats, reuniones, inducciones) y lo
// que corre scripts/ejecutar.mjs en su propio proceso, que deja el motor en su marca de en-curso.
// Una marca sin motor (todavía eligiendo, o de antes de este cambio) no se atribuye a ninguno.
import fs from 'node:fs';
import path from 'node:path';

export const MOTORES = ['claude', 'codex'];

/** Contador de lo que corre dentro de este servidor. */
export function crearContador() {
  const activos = { claude: 0, codex: 0 };
  return {
    entra(motor) { if (MOTORES.includes(motor)) activos[motor]++; },
    sale(motor) { if (MOTORES.includes(motor)) activos[motor] = Math.max(0, activos[motor] - 1); },
    activos: () => ({ ...activos }),
  };
}

/** Lee logs/en-curso/*.json. `vivo(id)` dice si el trabajo de esa marca sigue en marcha. */
export function trabajosEnMarcas(dir, vivo) {
  const cuenta = { claude: 0, codex: 0 };
  let archivos = [];
  try { archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return cuenta; }
  for (const f of archivos) {
    let marca;
    // ejecutar.mjs puede estar escribiéndola en este instante: se cuenta en la siguiente lectura.
    try { marca = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '')); } catch { continue; }
    if (MOTORES.includes(marca?.motor) && vivo(f.slice(0, -'.json'.length))) cuenta[marca.motor]++;
  }
  return cuenta;
}
