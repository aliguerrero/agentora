import { spawn } from 'node:child_process';
import { buscarCodex } from './motores.mjs';
import { registrarCuotaCodex } from './coordinador.mjs';
import { crearCuentasCodex } from './cuentas-codex.mjs';
import path from 'node:path';

export const cuentas = crearCuentasCodex({ RAIZ: path.resolve(import.meta.dirname, '..') });

// Solo consulta el saldo; no inicia sesiones de modelo ni consume resets.
export function consultarCuotaCodex() {
  return new Promise(resolve => {
    const bin = buscarCodex();
    if (!bin) return resolve({ ok: false, error: 'CLI de escritorio no encontrada' });
    const child = spawn(bin, ['app-server', '--listen', 'stdio://'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', finalizado = false;
    const terminar = resultado => { if (finalizado) return; finalizado = true; clearTimeout(timer); child.kill(); resolve(resultado); };
    const enviar = (id, method, params) => child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    const timer = setTimeout(() => terminar({ ok: false, error: 'Tiempo agotado al consultar Codex' }), 15000);
    child.stdin.on('error', () => {});
    child.on('error', e => terminar({ ok: false, error: e.message }));
    child.on('close', () => terminar({ ok: false, error: 'El servicio de cuota se cerró' }));
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lineas = buffer.split('\n'); buffer = lineas.pop();
      for (const linea of lineas) {
        let ev; try { ev = JSON.parse(linea); } catch { continue; }
        if (ev.id === 1 && ev.result) {
          child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
          enviar(2, 'account/rateLimits/read', {});
        } else if (ev.id === 2) {
          const datos = ev.result?.rateLimitsByLimitId?.codex || ev.result?.rateLimits;
          const ok = !!datos && registrarCuotaCodex(datos);
          // La misma lectura queda guardada para la cuenta activa (panel de motores).
          if (ok) try { cuentas.registrarLectura(datos); } catch { /* no impide la consulta */ }
          terminar(ok ? { ok: true } : { ok: false, error: 'Sin datos de cuota disponibles' });
        } else if (ev.id === 1 && ev.error) terminar({ ok: false, error: 'No se pudo iniciar la consulta de cuota' });
      }
    });
    enviar(1, 'initialize', { clientInfo: { name: 'oficina', title: 'Coordinador de oficina', version: '1.0' }, capabilities: {} });
  });
}
