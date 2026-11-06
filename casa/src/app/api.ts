import type { AgenteOficina, Departamento, EstadoAgente, SenalAgente } from '@jules/oficina';
import { aplicarAlas, marcarObras } from '@jules/oficina';
import type { ObraEnCurso, PlantaAla } from '@jules/oficina';
import { asignarSalas, SALA_REUNIONES } from './salas';
import type { DeptoSala } from './salas';
import { motoresParaCielo } from './motoresCielo';
import type { MotorApi } from './motoresCielo';
import type { MotorCielo } from '../oficina/render/casa/MotoresCielo';

/** El servidor de la oficina inyecta el token en <meta name="oficina-token">. */
const TOKEN =
  document.querySelector<HTMLMetaElement>('meta[name="oficina-token"]')?.content ?? '';

export const api = (ruta: string, o: RequestInit = {}) =>
  fetch(ruta, {
    ...o,
    headers: { 'x-oficina-token': TOKEN, 'content-type': 'application/json', ...(o.headers ?? {}) },
  });

/* ---------- Lo que devuelve /api/estado (solo lo que usa la casa) ---------- */

interface MdArchivo {
  archivo: string;
  meta: Record<string, string>;
  cuerpo: string;
  modificado?: string;
}

interface EmpleadoApi {
  id: string;
  ficha: MdArchivo;
  bandeja: MdArchivo[];
  enCurso: { rutina?: string; encargo?: string; titulo?: string } | null;
  conversando: { inicio: string } | null;
  actividad: { texto: string; clase?: string }[];
  perfil?: string;
}

interface DepartamentoApi {
  id: string;
  nombre: string;
  color: string;
  jefe?: string;
  miembros: string[];
}

export interface EstadoApi {
  senales?: SenalAgente[];
  empleados: EmpleadoApi[];
  organizacion: {
    ceo?: { nombre?: string; titular?: string };
    gerente?: string;
    departamentos: DepartamentoApi[];
    roles: Record<string, string>;
    asignaciones: Record<string, string>;
  };
  reunion: { tema: string; participantes: string[]; turno?: string | null } | null;
  general?: { casa?: string; titular?: string; titularCorto?: string; asistente?: string; zonaHoraria?: string; locale?: string; configurado?: boolean };
  casa?: ConfigCasa;
  logo?: string | null;
  motoresCielo?: MotorApi[];
  obras?: PlantaAla[];
  obrasEnCurso?: ObraEnCurso[];
  retenidos?: number;
  proyectos?: { activo: string | null; proyectos: { id: string; nombre: string; descripcion?: string }[] };
}

/** config/casa.json (Configuración › Casa). */
export interface ConfigCasa {
  etiquetas: 'siempre' | 'hover' | 'nunca';
  letrero: boolean;
  motoresCielo: boolean;
  horaModo: 'real' | 'fija';
  horaFija: number;
  calidad: 'auto' | 'alta' | 'media' | 'baja';
  deriva: boolean;
  salas: Record<string, string>;
  musica: boolean;
  volumen: number;
  aleatorio: boolean;
  pausarOculta: boolean;
  listaUrls: string[];
}

/* ---------- Traducción a la casa ---------- */

/** Una fila de la lista de agentes: un departamento, o quienes no tienen ninguno. */
export interface GrupoEquipo {
  id: string;
  nombre: string;
  color: string;
  ids: string[];
}

export interface Casa {
  senales: SenalAgente[];
  agentes: AgenteOficina[];
  departamentos: Departamento[];
  /** id de sala de la casa -> nombre del departamento real que la ocupa. */
  nombreSala: Record<string, string>;
  /** id real de departamento -> id de sala. */
  salaDe: Record<string, string>;
  /** Todos los departamentos del proyecto, con o sin sala. */
  deptos: DeptoSala[];
  /** El equipo por departamento, con el jefe primero. */
  grupos: GrupoEquipo[];
  /** id de empleado -> gerente, jefe o agente. */
  roles: Record<string, string>;
  reunion: EstadoApi['reunion'];
  /** Ids de las salas construidas. */
  construidas: string[];
  /** Salas que se están levantando. */
  obrasEnCurso: ObraEnCurso[];
  /** Cuántas cosas esperan en cuarentena la decisión del titular. */
  retenidos: number;
  ceo: string;
  /** Nombre de la casa y zona horaria (config/general.json). */
  casa: string;
  zonaHoraria: string;
  /** false en una instalación nueva: se muestra el asistente. */
  configurado: boolean;
  config: ConfigCasa | null;
  /** URL del logo de la casa, o null si no tiene. */
  logo: string | null;
  /** Los motores que vuelan sobre la casa, con sus trabajos reales. */
  motores: MotorCielo[];
  proyecto: { id: string; nombre: string } | null;
  proyectos: { id: string; nombre: string; descripcion?: string }[];
}

/** ¿La pregunta ya tiene respuesta escrita bajo «## Respuesta de …» (y no «(pendiente)»)? */
const respondida = (cuerpo: string) => {
  const resto = cuerpo.split(/^##\s*Respuesta de [^\n]*$/m)[1];
  return !!resto && !!resto.trim() && !/^\(pendiente\)$/i.test(resto.trim());
};

const tituloMd = (m: MdArchivo) => (/^#\s+(.*)$/m.exec(m.cuerpo)?.[1] ?? m.archivo).trim();

export function aCasa(e: EstadoApi): Casa {
  const org = e.organizacion;
  // Primero el plano: todo lo que sigue, y la escena, leen de ahí las salas construidas.
  aplicarAlas(e.obras ?? []);
  marcarObras(e.obrasEnCurso ?? []);
  const construidas = (e.obras ?? []).map((o) => o.sala);
  const salaDe = asignarSalas(org.departamentos, e.casa?.salas, e.proyectos?.activo, construidas);
  const colorDe = Object.fromEntries(org.departamentos.map((d) => [d.id, d.color]));
  const nombreDe = (id: string) =>
    e.empleados.find((x) => x.id === id)?.ficha.meta['nombre'] || id;

  const departamentos: Departamento[] = org.departamentos
    .filter((d) => salaDe[d.id])
    .map((d) => ({
      id: salaDe[d.id] as string,
      nombre: d.nombre,
      lider: d.jefe ? nombreDe(d.jefe) : '',
      color: d.color,
    }));
  // Con su cartel y su botón como cualquier sala, pero no es de ningún departamento.
  departamentos.push({ id: SALA_REUNIONES, nombre: 'Sala de reuniones', lider: '', color: '#f0a848' });
  departamentos.push({ id: 'gerencia', nombre: 'Gerencia · Cuotas', lider: org.gerente ? nombreDe(org.gerente) : '', color: '#e9be77' });
  const nombreSala = Object.fromEntries(departamentos.map((d) => [d.id, d.nombre]));

  const agentes: AgenteOficina[] = e.empleados.map((x) => {
    const pendientes = x.bandeja.filter((b) => !respondida(b.cuerpo));
    const reunido = !!e.reunion?.participantes.includes(x.id);
    let estado: EstadoAgente = 'libre';
    let tarea = '';
    if (x.enCurso || x.conversando || reunido) {
      estado = 'trabajando';
      const ultima = x.actividad.at(-1)?.texto;
      tarea = reunido
        ? `En reunión: ${e.reunion?.tema ?? ''}`
        : x.conversando
          ? 'Conversando contigo'
          : [x.enCurso?.titulo || x.enCurso?.rutina || x.enCurso?.encargo, ultima]
              .filter(Boolean)
              .join(' · ');
    } else if (pendientes.length > 0) {
      estado = 'esperando_decision';
      tarea = `${pendientes.length === 1 ? 'Pregunta' : `${pendientes.length} preguntas`}: ${tituloMd(pendientes[0] as MdArchivo)}`;
    } else {
      tarea = x.actividad.at(-1)?.texto || 'Sin trabajo en curso.';
    }
    const deptoReal = org.asignaciones[x.id];
    return {
      id: x.id,
      nombre: x.ficha.meta['nombre'] || x.id,
      rol: x.ficha.meta['puesto'] || org.roles[x.id] || x.perfil || 'Empleado',
      // En reunión va a la mesa. Sin sala (gerente, supervisor o departamento sin sala libre): al atrio.
      departamento: reunido ? SALA_REUNIONES : x.id === org.gerente || x.id === 'supervisor' || /supervisor.*cuota|supervisi[oó]n.*motores/i.test(x.ficha.meta['puesto'] || '') ? 'gerencia' : (deptoReal && salaDe[deptoReal]) || 'atrio',
      estado,
      color: deptoReal ? colorDe[deptoReal] : undefined,
      actividad: x.conversando || e.reunion?.turno === x.id ? 'hablando' : x.enCurso ? 'escribiendo' : undefined,
      tarea,
    };
  });

  const idsDe = (filtro: (id: string) => boolean) => e.empleados.map((x) => x.id).filter(filtro);
  const gerente = org.gerente ?? null;
  const conDepto = new Set(org.departamentos.map((d) => d.id));
  const grupos: GrupoEquipo[] = [
    { id: '_gerencia', nombre: 'Gerencia y cuotas', color: '#f0a848', ids: idsDe((id) => id === gerente || id === 'supervisor') },
    ...org.departamentos.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      color: d.color,
      ids: idsDe((id) => id !== gerente && id !== 'supervisor' && org.asignaciones[id] === d.id).sort((a, b) => Number(b === d.jefe) - Number(a === d.jefe)),
    })),
    { id: '_sin', nombre: 'Sin departamento', color: '#8a8f98', ids: idsDe((id) => id !== gerente && id !== 'supervisor' && !conDepto.has(org.asignaciones[id] ?? '')) },
  ].filter((g) => g.ids.length > 0);

  return {
    senales: e.senales ?? [],
    agentes,
    grupos,
    roles: org.roles ?? {},
    reunion: e.reunion,
    departamentos,
    nombreSala,
    salaDe,
    deptos: org.departamentos.map(({ id, nombre, color }) => ({ id, nombre, color })),
    construidas,
    obrasEnCurso: e.obrasEnCurso ?? [],
    retenidos: e.retenidos ?? 0,
    ceo: e.general?.asistente || org.ceo?.nombre || 'J.A.R.V.I.S.',
    casa: e.general?.casa || 'Mi oficina',
    zonaHoraria: e.general?.zonaHoraria || Intl.DateTimeFormat().resolvedOptions().timeZone,
    configurado: e.general?.configurado !== false,
    config: e.casa ?? null,
    logo: e.logo ?? null,
    motores: e.casa?.motoresCielo === false ? [] : motoresParaCielo(e.motoresCielo),
    proyecto: e.proyectos?.proyectos.find((p) => p.id === e.proyectos?.activo) ?? null,
    proyectos: e.proyectos?.proyectos ?? [],
  };
}

/* ---------- Reuniones ---------- */

export interface EventoReunion {
  tipo: string;
  empleado?: string;
  nombre?: string;
  ronda?: number;
  delta?: string;
  texto?: string;
}

/** Convoca y va entregando lo que pasa; resuelve al terminar. Cortar la conexión cancela la reunión. */
export async function convocarReunion(datos: { tema: string; participantes: string[]; rondas: number }, alEvento: (ev: EventoReunion) => void, signal: AbortSignal): Promise<void> {
  const r = await api('/api/reuniones', { method: 'POST', body: JSON.stringify(datos), signal });
  if (!r.ok || !r.body) {
    const error = ((await r.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(error || `HTTP ${r.status}`);
  }
  const lector = r.body.getReader();
  const deco = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return;
    buffer += deco.decode(value, { stream: true });
    let corte: number;
    while ((corte = buffer.indexOf('\n\n')) >= 0) {
      const datosEv = buffer
        .slice(0, corte)
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      buffer = buffer.slice(corte + 2);
      if (!datosEv) continue;
      try {
        alEvento(JSON.parse(datosEv) as EventoReunion);
      } catch {
        // Un evento ilegible no detiene la reunión.
      }
    }
  }
}

export interface ActaPendiente {
  archivo: string;
  tema: string;
  acta: string;
}

/** Las actas del proyecto seleccionado que esperan la decisión del titular. */
export async function actasPendientes(): Promise<ActaPendiente[]> {
  const r = await api('/api/reuniones');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { reuniones } = (await r.json()) as { reuniones: MdArchivo[] };
  return reuniones
    .filter((m) => m.meta['estado'] === 'pendiente')
    .map((m) => ({
      archivo: m.archivo,
      tema: m.meta['tema'] || m.archivo,
      acta: (/^## Acta\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(m.cuerpo)?.[1] ?? m.cuerpo).trim(),
    }));
}

export async function decidirActa(archivo: string, decision: 'aprobada' | 'rechazada', nota: string): Promise<void> {
  const r = await api(`/api/reuniones/${encodeURIComponent(archivo)}/decision`, { method: 'POST', body: JSON.stringify({ decision, nota }) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${r.status}`);
}

/* ---------- Chat (SSE de /api/chat/:id) ---------- */

export interface MensajeChat {
  rol: 'ali' | 'agente' | 'error';
  texto: string;
  fecha?: string;
}

export async function historial(id: string): Promise<{ mensajes: MensajeChat[]; ocupado: boolean }> {
  const r = await api(`/api/chat/${id}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Envía un mensaje y va entregando el texto que llega; resuelve con la respuesta final. */
export async function conversar(
  id: string,
  mensaje: string,
  alAvanzar: (parcial: string, actividad?: string) => void,
): Promise<string> {
  const r = await api(`/api/chat/${id}`, { method: 'POST', body: JSON.stringify({ mensaje }) });
  if (!r.ok || !r.body) {
    const error = ((await r.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(error || `HTTP ${r.status}`);
  }
  const lector = r.body.getReader();
  const deco = new TextDecoder();
  let buffer = '';
  let texto = '';
  let final = '';
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += deco.decode(value, { stream: true });
    let corte: number;
    while ((corte = buffer.indexOf('\n\n')) >= 0) {
      const bloque = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);
      const datos = bloque
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!datos) continue;
      let ev: { tipo: string; delta?: string; texto?: string };
      try {
        ev = JSON.parse(datos);
      } catch {
        continue;
      }
      if (ev.tipo === 'texto' && ev.delta) {
        texto += ev.delta;
        alAvanzar(texto);
      } else if (ev.tipo === 'actividad' && ev.texto) alAvanzar(texto, ev.texto);
      else if (ev.tipo === 'error') throw new Error(ev.texto || 'Error del agente');
      else if (ev.tipo === 'fin') final = ev.texto || texto;
    }
  }
  return final || texto;
}
