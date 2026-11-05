// Reparto de salas en el servidor: al terminar una obra hay que mover el departamento sin que el
// navegador esté abierto. Es la misma lógica de casa/src/app/salas.ts, que el servidor no puede
// importar porque debe arrancar en Node 22, que no lee TypeScript. salas.test.mjs comprueba que
// las dos dan siempre lo mismo.
const SALAS = ['desarrollo', 'finanzas', 'personal', 'contenido', 'investigacion'];
const AFINIDAD = [
  [/plataforma|desarroll|ingenier|tecnolog|backend|frontend|qa|devops/i, 'desarrollo'],
  [/fiscal|finanz|contab|tribut|legal|cumplim/i, 'finanzas'],
  [/talento|personal|rrhh|cultura|contrat/i, 'personal'],
  [/contenido|marketing|marca|comunic|diseñ/i, 'contenido'],
  [/investig|producto|datos|ciencia|anál/i, 'investigacion'],
];

const clave = (proyecto, depto) => (proyecto ? `${proyecto}:${depto}` : depto);

export function asignarSalas(deptos, fijas = {}, proyecto, construidas = []) {
  const salaDe = {};
  const libres = new Set([...SALAS, ...construidas]);
  const enAtrio = new Set();
  for (const d of deptos) {
    const fija = fijas[clave(proyecto, d.id)] ?? fijas[d.id];
    if (fija === 'atrio') enAtrio.add(d.id);
    else if (fija && libres.has(fija)) {
      salaDe[d.id] = fija;
      libres.delete(fija);
    }
  }
  for (const d of deptos) {
    if (salaDe[d.id] || enAtrio.has(d.id)) continue;
    const texto = `${d.id} ${d.nombre}`;
    const sala = AFINIDAD.find(([re, s]) => re.test(texto) && libres.has(s))?.[1];
    if (sala) {
      salaDe[d.id] = sala;
      libres.delete(sala);
    }
  }
  for (const d of deptos) {
    if (salaDe[d.id] || enAtrio.has(d.id)) continue;
    const sala = libres.values().next().value;
    if (!sala) break;
    salaDe[d.id] = sala;
    libres.delete(sala);
  }
  return salaDe;
}

/** Lleva un departamento a una sala y fija el reparto del proyecto, para que nadie más salte de sala. */
export function reasignar(deptos, fijas, proyecto, depto, sala, modo = 'intercambiar', construidas = []) {
  const salaDe = asignarSalas(deptos, fijas, proyecto, construidas);
  const anterior = salaDe[depto] ?? 'atrio';
  const ocupante = deptos.find((d) => d.id !== depto && salaDe[d.id] === sala)?.id;
  const fuera = { ...fijas };
  for (const d of deptos) fuera[clave(proyecto, d.id)] = salaDe[d.id] ?? 'atrio';
  fuera[clave(proyecto, depto)] = sala;
  if (ocupante && sala !== 'atrio') fuera[clave(proyecto, ocupante)] = modo === 'intercambiar' ? anterior : 'atrio';
  return fuera;
}
