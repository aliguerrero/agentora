// Copias de la configuración: exportar a JSON, importar y restablecer valores de fábrica.
//
// Nunca salen secretos (solo la lista de nombres que hay que volver a escribir). Con
// `plantilla: true` también se quitan los datos que identifican a esta oficina, para pasar los
// ajustes a otra persona. Importar y restablecer guardan antes una copia en config/respaldos/.
import fs from 'node:fs';
import path from 'node:path';

export const FORMATO = 'oficina-config';
const VERSION = 1;
/** Lo que se puede restablecer: nunca identidad, secretos, personas, conexiones ni proyectos. */
export const RESTABLECIBLES = ['motores', 'casa', 'contacto', 'proyectos', 'telegram'];

export function crearRespaldo({ RAIZ, config, secciones, conexiones, matriz, personas, secretos, topes, proyectosValidos = () => [] }) {
  function exportar({ conPersonas = false, plantilla = false } = {}) {
    const datos = Object.fromEntries(secciones().map((s) => [s, config.leer(s)]));
    if (plantilla) {
      // Sin nada que identifique a esta oficina ni a sus proyectos.
      for (const k of ['casa', 'titular', 'titularCorto', 'pais', 'configurado']) delete datos.general[k];
      for (const k of ['usuario', 'remitenteNombre', 'remitenteCorreo', 'firma', 'host', 'activo']) delete datos.correo[k];
      delete datos.jira;
      delete datos.casa.salas;
      delete datos.casa.listaUrls;
    }
    const lista = conexiones.listar().map(({ ultimaPrueba, ...c }) => (plantilla ? { ...c, proyectos: ['*'] } : c));
    const m = matriz.leer();
    return {
      formato: FORMATO, version: VERSION, fecha: new Date().toISOString(), plantilla,
      secciones: datos, conexiones: lista,
      matriz: plantilla ? { perfiles: m.perfiles, otorgan: { gerente: m.otorgan.gerente || 'no' } } : m,
      topes: topes.leer(),
      ...(conPersonas && !plantilla ? { personas: personas.listar().map(({ telegramVinculado, ...p }) => p) } : {}),
      // Solo los nombres: los valores nunca salen de este equipo.
      secretosNecesarios: Object.keys(secretos.estado()),
    };
  }

  function copiaDeSeguridad(motivo) {
    const dir = path.join(RAIZ, 'config', 'respaldos');
    fs.mkdirSync(dir, { recursive: true });
    const ruta = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${motivo}.json`);
    fs.writeFileSync(ruta, JSON.stringify(exportar({ conPersonas: true }), null, 2));
    return ruta;
  }

  /**
   * Importa una copia. Primero valida todo (si algo falla, no se aplica nada) y después guarda.
   * Lo que no encaja en esta oficina (agentes o proyectos que no existen) se omite con un aviso.
   */
  function importar(datos, { conPersonas = false, quien = 'importar' } = {}) {
    const mal = (m) => { throw Object.assign(new Error(m), { codigo: 400 }); };
    if (datos?.formato !== FORMATO) mal('Ese archivo no es una copia de configuración de la oficina.');
    if (datos.version > VERSION) mal('La copia es de una versión más nueva de la oficina.');
    const avisos = [];
    const validas = new Set(proyectosValidos());
    const sec = datos.secciones && typeof datos.secciones === 'object' ? datos.secciones : {};
    for (const s of Object.keys(sec)) if (!secciones().includes(s)) mal(`Sección desconocida en la copia: ${s}`);
    for (const [s, v] of Object.entries(sec)) config.validar(s, v);
    const respaldo = copiaDeSeguridad('antes-de-importar');
    for (const [s, v] of Object.entries(sec)) config.guardar(s, v, quien);

    let nConexiones = 0;
    for (const c of datos.conexiones || []) {
      const proyectos = (c.proyectos || ['*']).filter((p) => p === '*' || validas.has(p));
      if ((c.proyectos || []).length && !proyectos.length) avisos.push(`La conexión ${c.id} era de proyectos que aquí no existen: queda para todos.`);
      try { conexiones.guardar({ ...c, proyectos: proyectos.length ? proyectos : ['*'] }, quien); nConexiones++; } catch (e) { avisos.push(`Conexión ${c.id}: ${e.message}`); }
    }
    const m = datos.matriz || {};
    for (const [perfil, bloque] of Object.entries(m.perfiles || {})) { try { matriz.guardar({ perfil, bloque }, quien); } catch (e) { avisos.push(`Perfil ${perfil}: ${e.message}`); } }
    for (const [agente, bloque] of Object.entries(m.agentes || {})) {
      if (!proyectosValidos.agentes?.().includes(agente)) { avisos.push(`Excepciones de ${agente} omitidas: ese agente no existe aquí.`); continue; }
      try { matriz.guardar({ agente, bloque }, quien); } catch (e) { avisos.push(`Agente ${agente}: ${e.message}`); }
    }
    if (m.otorgan) { try { matriz.guardar({ otorgan: m.otorgan }, quien); } catch (e) { avisos.push(e.message); } }
    for (const [perfil, n] of Object.entries(datos.topes || {})) { try { topes.cambiar(perfil, n); } catch (e) { avisos.push(`Tope de ${perfil}: ${e.message}`); } }

    let nPersonas = 0;
    if (conPersonas) {
      for (const p of datos.personas || []) {
        const proyectos = (p.proyectos || ['*']).filter((x) => x === '*' || validas.has(x));
        const limpia = { ...p, proyectos: proyectos.length ? proyectos : ['*'] };
        try { (personas.obtener(p.id) ? personas.actualizar(p.id, limpia, quien) : personas.crear(limpia, quien)); nPersonas++; } catch (e) { avisos.push(`Persona ${p.nombre || p.id}: ${e.message}`); }
      }
    }
    const faltan = (datos.secretosNecesarios || []).filter((n) => !secretos.estado()[n]);
    if (faltan.length) avisos.push(`Faltan estos secretos (no viajan en la copia): ${faltan.join(', ')}.`);
    return { ok: true, secciones: Object.keys(sec).length, conexiones: nConexiones, personas: nPersonas, avisos, respaldo: path.basename(respaldo) };
  }

  /** Valores de fábrica en ajustes generales. No toca identidad, secretos, personas ni proyectos. */
  function restablecer(lista, quien = 'panel') {
    const fuera = lista.filter((s) => !RESTABLECIBLES.includes(s));
    if (!lista.length || fuera.length) throw Object.assign(new Error(`Solo se puede restablecer: ${RESTABLECIBLES.join(', ')}.`), { codigo: 400 });
    const respaldo = copiaDeSeguridad('antes-de-restablecer');
    for (const s of lista) config.restablecer(s, quien);
    return { ok: true, restablecidas: lista, respaldo: path.basename(respaldo) };
  }

  return { exportar, importar, restablecer, copiaDeSeguridad };
}
