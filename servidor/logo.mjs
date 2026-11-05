// Logo de la casa: fachada, encabezado y pestaña del navegador. Vive en config/logo/ (los agentes
// no leen config/ y no entra en el paquete para compartir). Hay como mucho uno, con la huella en
// el nombre para que el navegador no muestre uno antiguo. La lista de ya disponibles sale de
// assets/logos/. El tipo se decide por el contenido, nunca por el nombre que trae el archivo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIPOS = { png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };

const mal = (mensaje) => { throw Object.assign(new Error(mensaje), { codigo: 400 }); };

// Un SVG es un documento y puede llevar código o cargar cosas de fuera. En <img> el navegador no
// lo ejecutaría, pero la ruta también se puede abrir directamente, así que no se admite.
const SVG_PROHIBIDO = /<\s*(script|foreignObject|iframe|embed|object|audio|video)\b|<!(ENTITY|DOCTYPE)|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)|url\(\s*["']?\s*(?!#)|@import/i;

/** Devuelve 'png', 'webp' o 'svg' según el contenido; rechaza cualquier otra cosa. */
export function tipoDeImagen(datos) {
  if (!datos?.length) mal('El archivo está vacío.');
  if (datos.length > MAX_BYTES) mal('El logo no puede pasar de 2 MB.');
  if (datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (datos.subarray(0, 4).toString('latin1') === 'RIFF' && datos.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const texto = datos.toString('utf8').replace(/^﻿/, '');
  const inicio = texto.replace(/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*/, '');
  if (/^<svg[\s>]/i.test(inicio) && /<\/svg\s*>\s*$/i.test(texto)) {
    if (SVG_PROHIBIDO.test(texto)) mal('Ese SVG trae código o enlaces externos. Expórtalo como imagen simple o usa PNG.');
    return 'svg';
  }
  return mal('Formato no admitido: usa PNG, WebP o SVG.');
}

export function crearLogo({ RAIZ, auditar = () => {} }) {
  const DIR = path.join(RAIZ, 'config', 'logo');
  const GALERIA = path.join(RAIZ, 'assets', 'logos');
  const NOMBRE = /^logo-[0-9a-f]{12}\.(png|webp|svg)$/;
  const MOTORES = path.join(RAIZ, 'assets', 'motores');
  // Archivos que puede traer cada motor en assets/motores/ (no entra en el paquete para compartir).
  const NOMBRES_MOTOR = new Map([['claude', ['claude']], ['codex', ['codex', 'chatgpt']]]);

  const archivos = () => { try { return fs.readdirSync(DIR).filter((f) => NOMBRE.test(f)); } catch { return []; } };

  /** El logo actual, o null si la casa no tiene. */
  function actual() {
    const archivo = archivos()[0];
    return archivo ? { archivo, url: `/logo/actual/${archivo}`, tipo: path.extname(archivo).slice(1) } : null;
  }

  function guardar(datos, origen) {
    const tipo = tipoDeImagen(datos);
    const antes = archivos();
    const archivo = `logo-${crypto.createHash('sha256').update(datos).digest('hex').slice(0, 12)}.${tipo}`;
    fs.mkdirSync(DIR, { recursive: true });
    // Primero el nuevo y después borrar el anterior: si algo falla, sigue habiendo un logo válido.
    const temporal = path.join(DIR, `${archivo}.tmp`);
    fs.writeFileSync(temporal, datos);
    fs.renameSync(temporal, path.join(DIR, archivo));
    for (const viejo of antes) if (viejo !== archivo) fs.rmSync(path.join(DIR, viejo), { force: true });
    auditar({ quien: 'panel', seccion: 'logo', campos: { logo: { antes: antes[0] ?? null, despues: archivo, origen } } });
    return actual();
  }

  /** Recibe el archivo en base64 (con o sin el prefijo «data:…;base64,»). */
  function subir(base64) {
    const limpio = String(base64 || '').replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
    if (!limpio) mal('Falta la imagen.');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) mal('La imagen no llegó bien. Inténtalo de nuevo.');
    return guardar(Buffer.from(limpio, 'base64'), 'subido');
  }

  /** Un nombre de la galería solo si es un archivo directo de assets/logos/, sin rutas. */
  function rutaGaleria(nombre) {
    const n = String(nombre || '');
    if (n !== path.basename(n) || n.startsWith('.') || !/\.(png|webp|svg)$/i.test(n)) return null;
    const ruta = path.join(GALERIA, n);
    return fs.existsSync(ruta) && fs.statSync(ruta).isFile() ? ruta : null;
  }

  function elegir(nombre) {
    const ruta = rutaGaleria(nombre);
    if (!ruta) mal('Ese logo no está en la carpeta de logos.');
    return guardar(fs.readFileSync(ruta), `galeria:${nombre}`);
  }

  function quitar() {
    const antes = archivos();
    for (const f of antes) fs.rmSync(path.join(DIR, f), { force: true });
    if (antes.length) auditar({ quien: 'panel', seccion: 'logo', campos: { logo: { antes: antes[0], despues: null } } });
    return null;
  }

  /** Logos listos para elegir; se omiten los que no se podrían usar (demasiado grandes). */
  function galeria() {
    let nombres = [];
    try { nombres = fs.readdirSync(GALERIA); } catch { return []; }
    return nombres
      .filter((n) => { const r = rutaGaleria(n); return r && fs.statSync(r).size <= MAX_BYTES; })
      .map((nombre) => ({ nombre, url: `/logo/galeria/${encodeURIComponent(nombre)}` }));
  }

  function rutaMotor(motor) {
    for (const base of NOMBRES_MOTOR.get(motor) || []) {
      for (const ext of ['webp', 'png', 'svg']) {
        const ruta = path.join(MOTORES, `${base}.${ext}`);
        if (fs.existsSync(ruta)) return ruta;
      }
    }
    return null;
  }

  /** URL del logo de un motor, o null si este equipo no tiene el archivo. */
  const urlMotor = (motor) => (rutaMotor(motor) ? `/logo/motor/${motor}` : null);

  /** Para servir la imagen: { datos, tipo } o null. `carpeta` es 'actual', 'galeria' o 'motor'. */
  function archivo(carpeta, nombre) {
    let ruta = null;
    if (carpeta === 'actual' && NOMBRE.test(nombre) && fs.existsSync(path.join(DIR, nombre))) ruta = path.join(DIR, nombre);
    if (carpeta === 'galeria') ruta = rutaGaleria(nombre);
    if (carpeta === 'motor') ruta = rutaMotor(nombre);
    if (!ruta) return null;
    const datos = fs.readFileSync(ruta);
    try { return { datos, tipo: TIPOS[tipoDeImagen(datos)] }; } catch { return null; }
  }

  return { actual, subir, elegir, quitar, galeria, archivo, urlMotor };
}
