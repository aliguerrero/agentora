// Jira Cloud por su API REST v3, solo lectura, para saber quién trabaja en cada proyecto.
// Autenticación básica: correo de la cuenta + token de API (id.atlassian.com › Seguridad ›
// Tokens de API), que se guarda cifrado como JIRA_API_TOKEN. Jira Data Center no se admite.
//
// «Quién trabaja en el proyecto» = quienes pueden tener tareas asignadas (assignable) más
// quienes tuvieron tareas asignadas o reportadas en los últimos 90 días (marcados «activo»).
// El correo solo llega si la persona lo hace visible en su perfil de Atlassian.

export function crearJira({ config, token, fetchImpl = (...a) => fetch(...a) }) {
  function base() {
    const c = config();
    if (!c.sitio || !c.correo) throw Object.assign(new Error('Configura el sitio y el correo de Jira.'), { codigo: 400 });
    const t = token();
    if (!t) throw Object.assign(new Error('Falta el token de API de Jira.'), { codigo: 400 });
    return { sitio: c.sitio.replace(/\/+$/, ''), auth: `Basic ${Buffer.from(`${c.correo}:${t}`).toString('base64')}` };
  }

  async function pedir(ruta, { sitio, auth }) {
    const r = await fetchImpl(`${sitio}${ruta}`, { headers: { authorization: auth, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401) throw Object.assign(new Error('Jira rechazó el correo o el token (401).'), { codigo: 400 });
    if (r.status === 403) throw Object.assign(new Error('Tu cuenta de Jira no tiene permiso para ver eso (403).'), { codigo: 400 });
    if (r.status === 404) throw Object.assign(new Error('Jira no encontró ese recurso (404): revisa el sitio y la clave del proyecto.'), { codigo: 400 });
    if (!r.ok) throw Object.assign(new Error(`Jira respondió ${r.status}.`), { codigo: 502 });
    return r.json();
  }

  /** Comprueba la conexión: la cuenta con la que se conecta. */
  async function probar() {
    const b = base();
    const yo = await pedir('/rest/api/3/myself', b);
    return { nombre: yo.displayName, accountId: yo.accountId };
  }

  /** Personas del proyecto de Jira `clave`. */
  async function personasDeProyecto(clave) {
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(String(clave))) throw Object.assign(new Error('Clave de proyecto de Jira no válida (p. ej. KAN).'), { codigo: 400 });
    const b = base();
    const usuarios = new Map();
    const anotar = (u, activo) => {
      if (!u?.accountId || u.accountType === 'app' || u.active === false) return;
      const previo = usuarios.get(u.accountId);
      usuarios.set(u.accountId, { accountId: u.accountId, nombre: u.displayName || previo?.nombre || '', correo: u.emailAddress || previo?.correo || null, activo: !!(activo || previo?.activo), tareas: (previo?.tareas || 0) + (activo ? 1 : 0) });
    };
    for (let inicio = 0; inicio < 1000; inicio += 100) {
      const pagina = await pedir(`/rest/api/3/user/assignable/search?project=${encodeURIComponent(clave)}&startAt=${inicio}&maxResults=100`, b);
      for (const u of pagina) anotar(u, false);
      if (pagina.length < 100) break;
    }
    let siguiente = null;
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const jql = encodeURIComponent(`project = "${clave}" AND updated >= -90d ORDER BY updated DESC`);
      const datos = await pedir(`/rest/api/3/search/jql?jql=${jql}&fields=assignee,reporter&maxResults=100${siguiente ? `&nextPageToken=${encodeURIComponent(siguiente)}` : ''}`, b);
      for (const t of datos.issues || []) { anotar(t.fields?.assignee, true); anotar(t.fields?.reporter, true); }
      siguiente = datos.nextPageToken;
      if (!siguiente || datos.isLast) break;
    }
    return [...usuarios.values()].sort((a, b) => Number(b.activo) - Number(a.activo) || b.tareas - a.tareas || a.nombre.localeCompare(b.nombre, 'es'));
  }

  return { probar, personasDeProyecto };
}
