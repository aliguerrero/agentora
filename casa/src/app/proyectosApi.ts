import { api } from './api';

export interface ProyectoResumen {
  id: string;
  nombre: string;
  descripcion?: string;
  ruta: string;
  estado: 'activo' | 'pausado';
  contexto: string;
  empleados: number;
  gerente: string | null;
  trabajando: number;
  enCola: number;
}
export interface Proyectos {
  activo: string | null;
  proyectos: ProyectoResumen[];
}
export interface Decision {
  requiereDecision: true;
  proyecto: string;
  trabajando: number;
  enCola: number;
}

async function pedir<T>(ruta: string, o: RequestInit = {}): Promise<{ status: number; datos: T }> {
  const r = await api(ruta, o);
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string; requiereDecision?: boolean };
  if (!r.ok && !(r.status === 409 && datos.requiereDecision)) throw new Error(datos.error || `HTTP ${r.status}`);
  return { status: r.status, datos };
}

export const leerProyectos = async () => (await pedir<Proyectos>('/api/proyectos')).datos;

/** Cambia de proyecto. Si hay trabajo y no se dijo qué hacer, devuelve la pregunta (409). */
export async function cambiarProyecto(id: string, anterior?: 'pausar' | 'segundo-plano', recordar = false): Promise<Proyectos | Decision> {
  const { datos } = await pedir<Proyectos | Decision>('/api/proyectos/activo', { method: 'POST', body: JSON.stringify({ id, anterior, recordar }) });
  return datos;
}
export const esDecision = (x: Proyectos | Decision): x is Decision => 'requiereDecision' in x;

export const cambiarEstadoProyecto = async (id: string, estado: 'activo' | 'pausado') =>
  (await pedir<Proyectos>(`/api/proyectos/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) })).datos;

export const crearProyecto = async (datos: { nombre: string; descripcion: string; ruta: string; crear: boolean }) =>
  (await pedir<{ id: string; gerente: string }>('/api/proyectos', { method: 'POST', body: JSON.stringify(datos) })).datos;
