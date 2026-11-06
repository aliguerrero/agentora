import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSelectorCarpeta } from './elegir-carpeta.mjs';
import { soloLocal } from './tunel.mjs';

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
const conDisplay = { DISPLAY: ':0', HOME: '/home/ana' };

test('Windows: devuelve la ruta con acentos y sin pasarle datos del usuario al comando', async () => {
  let args = null;
  const elegir = crearSelectorCarpeta({ esWindows: true, ejecutar: async (bin, a) => { args = [bin, ...a]; return { codigo: 0, stdout: `${b64('C:\\Años\\Peña')}\r\n` }; } });
  assert.equal(await elegir(), 'C:\\Años\\Peña');
  assert.equal(args[0], 'powershell.exe');
  assert.ok(args.includes('-STA'));
  assert.ok(args.includes('-EncodedCommand'));
});

test('Windows: cancelar no es un error', async () => {
  const elegir = crearSelectorCarpeta({ esWindows: true, ejecutar: async () => ({ codigo: 0, stdout: '' }) });
  assert.equal(await elegir(), '');
});

test('Windows: si falla, pide escribir la ruta y permite reintentar', async () => {
  let veces = 0;
  const elegir = crearSelectorCarpeta({ esWindows: true, ejecutar: async () => { veces++; return veces === 1 ? { codigo: 1, stdout: '' } : { codigo: 0, stdout: b64('C:\\x') }; } });
  await assert.rejects(elegir(), /Escribe la ruta/);
  assert.equal(await elegir(), 'C:\\x');
});

test('solo una ventana a la vez', async () => {
  let soltar;
  const elegir = crearSelectorCarpeta({ esWindows: true, ejecutar: () => new Promise((r) => { soltar = () => r({ codigo: 0, stdout: b64('C:\\y') }); }) });
  const primera = elegir();
  await assert.rejects(elegir(), (e) => e.codigo === 409);
  soltar();
  assert.equal(await primera, 'C:\\y');
});

test('Linux: usa zenity si está, y conserva espacios', async () => {
  let args = null;
  const elegir = crearSelectorCarpeta({ esWindows: false, entorno: conDisplay, buscar: (p) => (p === 'zenity' ? '/usr/bin/zenity' : null), ejecutar: async (bin, a) => { args = [bin, ...a]; return { codigo: 0, stdout: '/home/ana/mi repo\n' }; } });
  assert.equal(await elegir(), '/home/ana/mi repo');
  assert.equal(args[0], '/usr/bin/zenity');
  assert.ok(args.includes('--directory'));
});

test('Linux: sin zenity usa kdialog; cancelar no es un error', async () => {
  let bin = null;
  const elegir = crearSelectorCarpeta({ esWindows: false, entorno: conDisplay, buscar: (p) => (p === 'kdialog' ? '/usr/bin/kdialog' : null), ejecutar: async (b) => { bin = b; return { codigo: 1, stdout: '' }; } });
  assert.equal(await elegir(), '');
  assert.equal(bin, '/usr/bin/kdialog');
});

test('Linux sin escritorio o sin selector: lo dice y no intenta abrir nada', async () => {
  const nunca = async () => { throw new Error('no debía ejecutarse'); };
  const sinPantalla = crearSelectorCarpeta({ esWindows: false, entorno: {}, buscar: () => '/usr/bin/zenity', ejecutar: nunca });
  await assert.rejects(sinPantalla(), (e) => e.codigo === 501 && /Escribe la ruta/.test(e.message));
  const sinPrograma = crearSelectorCarpeta({ esWindows: false, entorno: conDisplay, buscar: () => null, ejecutar: nunca });
  await assert.rejects(sinPrograma(), (e) => e.codigo === 501);
});

test('por el túnel no se puede abrir el selector', () => {
  assert.equal(soloLocal('/api/sistema/elegir-carpeta'), true);
});
