// Secretos de la oficina (tokens, contraseñas SMTP, claves de conexiones), cifrados en
// config/secretos.json: con DPAPI en Windows y con una clave local (AES-256-GCM) en Linux. La API nunca los devuelve: solo «configurado» y una pista
// (últimos 4 caracteres). El valor viaja a PowerShell por la entrada estándar, nunca en la línea
// de comandos (visible para otros procesos).
//
// Alcance real de DPAPI (ámbito CurrentUser): impide leerlos desde otra cuenta u otro equipo y
// que queden en texto plano en disco o en una copia de la carpeta. NO protege frente a código
// que corre con tu mismo usuario; por eso config/ también está vetado para los agentes.
//
// Clave local en Linux: un archivo con permisos 600 fuera de la oficina (~/.config/oficina-devbox).
// Mismo alcance práctico: una copia de la carpeta no sirve sin la clave; otro usuario no la lee.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { carpetaClave, ES_WINDOWS } from './plataforma.mjs';

const ENTROPIA = 'oficina-devbox-secretos-v1';
const NOMBRE = /^[A-Z][A-Z0-9_]{1,63}$/;

function powershell(script, entrada) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { input: entrada, encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim();
}
const SCRIPT = (op) => `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security;`
  + ` $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());`
  + ` $e=[Text.Encoding]::UTF8.GetBytes('${ENTROPIA}');`
  + ` $o=[Security.Cryptography.ProtectedData]::${op}($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser);`
  + ` [Console]::Out.Write([Convert]::ToBase64String($o))`;

export const dpapi = {
  cifrar: (texto) => powershell(SCRIPT('Protect'), Buffer.from(texto, 'utf8').toString('base64')),
  descifrar: (b64) => Buffer.from(powershell(SCRIPT('Unprotect'), b64), 'base64').toString('utf8'),
};

/** Cifrador de Linux. La clave se crea la primera vez; `carpeta` solo cambia en las pruebas. */
export function claveLocal(carpeta = carpetaClave()) {
  const ruta = path.join(carpeta, 'clave');
  const leerClave = () => {
    try {
      const k = Buffer.from(fs.readFileSync(ruta, 'utf8').trim(), 'base64');
      if (k.length === 32) return k;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return null;
  };
  const clave = (crear) => {
    const hay = leerClave();
    if (hay || !crear) return hay;
    fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });
    const nueva = crypto.randomBytes(32);
    fs.writeFileSync(ruta, nueva.toString('base64'), { mode: 0o600, flag: 'wx' });
    return nueva;
  };
  return {
    cifrar(texto) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', clave(true), iv);
      const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
    },
    descifrar(b64) {
      const k = clave(false);
      if (!k) throw new Error('No encuentro la clave de los secretos de este equipo. Vuelve a escribirlos.');
      const b = Buffer.from(b64, 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

/**
 * `respaldo(nombre)` da el valor antiguo (p. ej. TELEGRAM_TOKEN de .env) mientras el secreto
 * no esté en el almacén; al leerlo se importa cifrado, sin borrar el original.
 */
export function crearSecretos({ RAIZ, cifrador = ES_WINDOWS ? dpapi : claveLocal(), respaldo = () => null, auditar = () => {} }) {
  const RUTA = path.join(RAIZ, 'config', 'secretos.json');
  const claros = new Map();

  const leerArchivo = () => { try { return JSON.parse(fs.readFileSync(RUTA, 'utf8')); } catch { return {}; } };
  const escribirArchivo = (datos) => {
    fs.mkdirSync(path.dirname(RUTA), { recursive: true });
    fs.writeFileSync(`${RUTA}.tmp`, JSON.stringify(datos, null, 2));
    fs.renameSync(`${RUTA}.tmp`, RUTA);
  };
  const validarNombre = (n) => { if (!NOMBRE.test(n)) throw Object.assign(new Error('Nombre de secreto inválido (MAYÚSCULAS_Y_GUIONES_BAJOS).'), { codigo: 400 }); };

  function definir(nombre, valor, quien = 'panel') {
    validarNombre(nombre);
    if (typeof valor !== 'string' || !valor.trim()) throw Object.assign(new Error('El secreto no puede quedar vacío.'), { codigo: 400 });
    if (valor.length > 8192) throw Object.assign(new Error('Secreto demasiado largo.'), { codigo: 400 });
    valor = valor.trim();
    const datos = leerArchivo();
    datos[nombre] = { cifrado: cifrador.cifrar(valor), pista: valor.length > 8 ? valor.slice(-4) : '', actualizado: new Date().toISOString() };
    escribirArchivo(datos);
    claros.set(nombre, valor);
    auditar({ quien, seccion: 'secretos', campos: { [nombre]: 'definido' } });
  }

  function borrar(nombre, quien = 'panel') {
    validarNombre(nombre);
    const datos = leerArchivo();
    if (!datos[nombre]) return false;
    delete datos[nombre];
    escribirArchivo(datos);
    claros.delete(nombre);
    auditar({ quien, seccion: 'secretos', campos: { [nombre]: 'borrado' } });
    return true;
  }

  /** Valor en claro (solo para uso interno del servidor) o null. */
  function obtener(nombre) {
    if (claros.has(nombre)) return claros.get(nombre);
    const entrada = leerArchivo()[nombre];
    if (entrada) {
      try { const v = cifrador.descifrar(entrada.cifrado); claros.set(nombre, v); return v; }
      catch (e) { console.error(`Secretos: no pude descifrar ${nombre} (${e.message.split('\n')[0]}).`); return null; }
    }
    const antiguo = respaldo(nombre);
    if (antiguo) {
      try { definir(nombre, antiguo, 'migracion'); } catch (e) { console.error(`Secretos: no pude importar ${nombre}: ${e.message.split('\n')[0]}`); }
      claros.set(nombre, antiguo);
      return antiguo;
    }
    return null;
  }

  /** Lo único que ve el panel: si existe, su pista y cuándo cambió. */
  function estado() {
    return Object.fromEntries(Object.entries(leerArchivo()).map(([n, e]) => [n, { configurado: true, pista: e.pista ? `••••${e.pista}` : '••••', actualizado: e.actualizado }]));
  }

  return { definir, borrar, obtener, estado };
}
