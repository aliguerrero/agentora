import { api } from '../api';
import type { ConfigCasa } from '../api';

export interface General {
  casa: string;
  titular: string;
  titularCorto: string;
  asistente: string;
  idioma: 'es' | 'en' | 'pt';
  locale: string;
  pais: string;
  zonaHoraria: string;
  moneda: string;
  autonomia: 'autonoma' | 'supervisada';
  configurado: boolean;
}

export type Motor = 'claude' | 'codex';

export interface PoliticaMotores {
  modo: 'auto' | 'manual';
  manual: Motor;
  claudeActivo: boolean;
  codexActivo: boolean;
  relevo: boolean;
  programacion: Motor;
  general: Motor;
  umbralReserva: number;
  simultaneos: number;
  inactividadMin: number;
}

export interface Ventana {
  etiqueta: string;
  porcentaje: number;
  reinicia: string | null;
}

export interface EstadoMotor {
  activo: boolean;
  instalado: boolean;
  ruta: string | null;
  estado: 'disponible' | 'reserva' | 'limite' | 'desconocido';
  detalle: string | null;
  ventanas: Ventana[];
  observado: string | null;
  fuente: string;
}

export interface CuentaCodex {
  etiqueta: string;
  email: string | null;
  plan: string | null;
  activa: boolean;
  valida: boolean;
  ultimaCuota: { ventanas: { minutos: number | null; porcentaje: number; reinicia: string | null }[]; observado: string } | null;
}

export interface PanelMotores {
  politica: PoliticaMotores;
  actual: 'auto' | Motor;
  claude: EstadoMotor;
  codex: EstadoMotor & {
    consulta: { ok: boolean; error?: string; fecha: string } | null;
    cuentas: { carpeta: string; hayActiva: boolean; total: number; validas: number; cuentas: CuentaCodex[] };
  };
  perfiles: Record<string, { maxTurnos: number; descripcion: string }>;
}

export async function pedir<T>(ruta: string, o: RequestInit = {}): Promise<T> {
  const r = await api(ruta, o);
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  // El resto de la respuesta viaja con el error: hay rechazos que traen detalle (obras).
  if (!r.ok) throw Object.assign(new Error(datos.error || `HTTP ${r.status}`), { datos });
  return datos;
}

export const leerConfig = () => pedir<{ general: General; motores: PoliticaMotores; casa: ConfigCasa }>('/api/config');
export const guardarSeccion = <T,>(seccion: string, cambios: Partial<T>) =>
  pedir<Record<string, T>>(`/api/config/${seccion}`, { method: 'PUT', body: JSON.stringify(cambios) }).then((r) => r[seccion] as T);
export const leerMotores = () => pedir<PanelMotores>('/api/motores');
export const actualizarCuotaCodex = () => pedir<PanelMotores>('/api/motores/cuota-codex', { method: 'POST' });
export const guardarTope = (perfil: string, maxTurnos: number) =>
  pedir<PanelMotores>(`/api/config/perfiles/${perfil}`, { method: 'PUT', body: JSON.stringify({ maxTurnos }) });

/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function hace(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
