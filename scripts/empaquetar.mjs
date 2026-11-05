// Crea el paquete para compartir la oficina con otra persona: solo el programa y la plantilla,
// sin empleados, proyectos, configuración, secretos, registros ni dependencias.
//
//   node scripts/empaquetar.mjs [carpeta-destino]
//
// Antes de comprimir revisa el contenido: si encuentra secretos reales, datos del titular, nombres
// de sus proyectos o agentes, correos o rutas de este equipo, NO crea el paquete y dice dónde están.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { crearSecretos } from '../servidor/secretos.mjs';
import { crearContextos } from '../servidor/contextos.mjs';
import { detectarSecretos } from '../servidor/contacto.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOMBRE = 'oficina-de-agentes';

/** Qué entra en el paquete. Todo lo demás (datos de esta oficina) queda fuera. */
const ENTRA = [
  ['servidor', (f) => !f.endsWith('.test.mjs')],
  ['scripts', () => true],
  ['casa/src', () => true],
];
const ARCHIVOS_CASA = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'LEEME.md', 'LICENSE', 'LICENCIAS.md', '.gitignore'];
const DE_PLANTILLA = ['OFICINA.md', 'CLAUDE.md', 'AGENTS.md', 'LEEME.md', '.gitignore', 'instalar.ps1', 'instalar.sh'];
const BINARIO = /\.(webp|png|jpe?g|svg|ico|woff2?)$/i;

function copiar(origen, destino, filtro = () => true) {
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const a = path.join(origen, e.name);
    const b = path.join(destino, e.name);
    if (e.isDirectory()) copiar(a, b, filtro);
    else if (filtro(e.name)) { fs.mkdirSync(destino, { recursive: true }); fs.copyFileSync(a, b); }
  }
}
function recorrer(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, fn); else fn(p);
  }
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Palabras prohibidas en el paquete: lo que identifica a ESTA oficina. */
function huellaPersonal() {
  const prohibidas = new Map();
  const anotar = (t, motivo) => { const v = String(t || '').trim(); if (v.length >= 3) prohibidas.set(v, motivo); };
  const leer = (r) => { try { return JSON.parse(fs.readFileSync(r, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
  const g = leer(path.join(RAIZ, 'config', 'general.json'));
  if (g) { anotar(g.titular, 'nombre del titular'); anotar(g.titularCorto, 'nombre del titular'); if (g.casa !== 'Oficina DevBox') anotar(g.casa, 'nombre de la casa'); }
  const c = crearContextos({ RAIZ });
  for (const p of c.todos()) {
    anotar(p.nombre, 'proyecto');
    if (p.repo) anotar(p.repo, 'ruta de un proyecto');
    for (const id of c.idsDe(p)) {
      // Los ids genéricos (cto, fiscal…) son palabras normales: se revisan los nombres propios.
      const ficha = (() => { try { return fs.readFileSync(path.join(p.empleados, id, 'CLAUDE.md'), 'utf8'); } catch { return ''; } })();
      anotar(/^nombre:\s*(.+)$/m.exec(ficha)?.[1], 'agente');
    }
  }
  for (const p of leer(path.join(RAIZ, 'config', 'personas.json'))?.personas || []) { anotar(p.nombre, 'persona del equipo'); anotar(p.correo, 'correo'); anotar(p.telefono, 'teléfono'); }
  const correo = leer(path.join(RAIZ, 'config', 'correo.json'));
  if (correo) { anotar(correo.usuario, 'correo'); anotar(correo.remitenteCorreo, 'correo'); }
  anotar(os.userInfo().username, 'usuario de Windows');
  anotar(os.homedir(), 'carpeta personal');
  return prohibidas;
}

/** Revisa cada archivo de texto del paquete. Devuelve [{ archivo, motivo, texto }]. */
export function revisar(dir, prohibidas, secretosReales = []) {
  const hallazgos = [];
  const patrones = [...prohibidas].map(([t, motivo]) => [new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, 'u'), motivo, t]);
  const CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const CORREOS_VALIDOS = /@(?:ejemplo\.com|example\.(?:com|invalid)|tuempresa\.com|x\.com)$/i;
  recorrer(dir, (p) => {
    if (BINARIO.test(p)) return;
    const texto = fs.readFileSync(p, 'utf8');
    const rel = path.relative(dir, p);
    for (const [re, motivo, t] of patrones) if (re.test(texto)) hallazgos.push({ archivo: rel, motivo, texto: t });
    for (const s of detectarSecretos(texto, secretosReales).filter((x) => x === 'secreto de la oficina' || x === 'token de bot de Telegram' || x === 'clave privada')) hallazgos.push({ archivo: rel, motivo: 'secreto', texto: s });
    for (const m of texto.match(CORREO) || []) if (!CORREOS_VALIDOS.test(m) && !/\.(?:js|ts|tsx|css|json|mjs)$/i.test(m) && !/^[\w-]+@\d/.test(m)) hallazgos.push({ archivo: rel, motivo: 'correo', texto: m });
  });
  return hallazgos;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(datos) {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Escribe un .zip de una carpeta sin herramientas externas: funciona igual en Windows y en Linux. */
export function escribirZip(carpeta, zip) {
  const raiz = path.basename(carpeta);
  const locales = [];
  const central = [];
  let posicion = 0;
  const archivos = [];
  recorrer(carpeta, (p) => archivos.push(p));
  for (const p of archivos.sort()) {
    const nombre = Buffer.from(`${raiz}/${path.relative(carpeta, p).replaceAll(path.sep, '/')}`, 'utf8');
    const datos = fs.readFileSync(p);
    const comprimido = zlib.deflateRawSync(datos);
    const crc = crc32(datos);
    const fijos = Buffer.alloc(26);
    fijos.writeUInt16LE(20, 0); // versión necesaria
    fijos.writeUInt16LE(0x0800, 2); // nombres en UTF-8
    fijos.writeUInt16LE(8, 4); // deflate
    fijos.writeUInt16LE(0, 6); // hora
    fijos.writeUInt16LE(0x21, 8); // fecha: 1980-01-01
    fijos.writeUInt32LE(crc, 10);
    fijos.writeUInt32LE(comprimido.length, 14);
    fijos.writeUInt32LE(datos.length, 18);
    fijos.writeUInt16LE(nombre.length, 22);
    fijos.writeUInt16LE(0, 24);
    const firmaLocal = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    locales.push(firmaLocal, fijos, nombre, comprimido);
    const cabeza = Buffer.alloc(46);
    cabeza.writeUInt32LE(0x02014b50, 0);
    cabeza.writeUInt16LE((3 << 8) | 20, 4); // creado en Unix, para que los .sh conserven el permiso
    fijos.copy(cabeza, 6);
    const modo = p.endsWith('.sh') ? 0o100755 : 0o100644;
    cabeza.writeUInt32LE(modo * 65536, 38);
    cabeza.writeUInt32LE(posicion, 42);
    central.push(cabeza, nombre);
    posicion += 4 + fijos.length + nombre.length + comprimido.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tamCentral, 12);
  fin.writeUInt32LE(posicion, 16);
  fs.writeFileSync(zip, Buffer.concat([...locales, ...central, fin]));
}

export function empaquetar(destino = path.dirname(RAIZ)) {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-paquete-'));
  const carpeta = path.join(trabajo, NOMBRE);
  try {
    for (const [rel, filtro] of ENTRA) copiar(path.join(RAIZ, rel), path.join(carpeta, rel), filtro);
    for (const f of ARCHIVOS_CASA) if (fs.existsSync(path.join(RAIZ, 'casa', f))) fs.copyFileSync(path.join(RAIZ, 'casa', f), path.join(carpeta, 'casa', f));
    for (const f of DE_PLANTILLA) fs.copyFileSync(path.join(RAIZ, 'plantilla', f), path.join(carpeta, f));
    copiar(path.join(RAIZ, 'plantilla'), path.join(carpeta, 'plantilla'));
    // PowerShell 5.1 solo lee bien los acentos con BOM.
    recorrer(carpeta, (p) => {
      if (!p.endsWith('.ps1')) return;
      const b = fs.readFileSync(p);
      if (!(b[0] === 0xef && b[1] === 0xbb)) fs.writeFileSync(p, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b]));
    });

    let reales = [];
    try {
      const s = crearSecretos({ RAIZ });
      reales = Object.keys(s.estado()).map((n) => s.obtener(n)).filter(Boolean);
    } catch { /* sin almacén de secretos */ }
    // Los que aún estén en .env también cuentan.
    try { reales.push(...fs.readFileSync(path.join(RAIZ, '.env'), 'utf8').split(/\r?\n/).map((l) => l.split('=').slice(1).join('=').trim()).filter(Boolean)); } catch { /* sin .env */ }
    const hallazgos = revisar(carpeta, huellaPersonal(), reales);
    if (hallazgos.length) return { ok: false, hallazgos };

    const zip = path.join(destino, `${NOMBRE}.zip`);
    fs.mkdirSync(destino, { recursive: true });
    fs.rmSync(zip, { force: true });
    escribirZip(carpeta, zip);
    let archivos = 0;
    recorrer(carpeta, () => { archivos++; });
    return { ok: true, zip, archivos, tamano: fs.statSync(zip).size };
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const comoJson = process.argv.includes('--json');
  const r = empaquetar(process.argv.slice(2).find((a) => a !== '--json'));
  // Nunca se imprime el texto de un secreto encontrado.
  if (comoJson) console.log(JSON.stringify(r.ok ? r : { ok: false, hallazgos: r.hallazgos.slice(0, 60).map((h) => ({ ...h, texto: h.motivo === 'secreto' ? 'oculto' : h.texto })) }));
  else if (r.ok) console.log(`Paquete listo: ${r.zip} (${r.archivos} archivos, ${(r.tamano / 1048576).toFixed(1)} MB)`);
  else {
    console.error(`NO se creó el paquete: ${r.hallazgos.length} datos personales o secretos encontrados:`);
    for (const h of r.hallazgos.slice(0, 60)) console.error(`  ${h.archivo}: ${h.motivo} (${h.motivo === 'secreto' ? 'oculto' : h.texto})`);
    process.exitCode = 1;
  }
}
