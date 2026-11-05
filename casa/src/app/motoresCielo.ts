// De lo que informa el servidor a cómo se ve cada motor en el cielo. Lógica pura: la prueba
// servidor/motores-cielo.test.mjs.
import type { EstadoVisualMotor, MotorCielo } from '../oficina/render/casa/MotoresCielo';

export interface MotorApi {
  id: string;
  activo: boolean;
  instalado: boolean;
  /** disponible, reserva, limite o desconocido (coordinador.mjs). */
  estado: string;
  /** % de uso de la última lectura vigente; null si no hay. */
  uso: number | null;
  trabajos: number;
  logo: string | null;
}

const IDENTIDAD: Record<string, { nombre: string; color: string }> = {
  claude: { nombre: 'Claude', color: '#d97757' },
  codex: { nombre: 'Codex', color: '#10a37f' },
};

/** null = no se dibuja. Un trabajo en marcha manda: nunca se oculta lo que de verdad está corriendo. */
export function estadoVisual(m: Pick<MotorApi, 'activo' | 'instalado' | 'estado' | 'trabajos'>): EstadoVisualMotor | null {
  if (m.trabajos > 0) return 'trabajando';
  if (!m.instalado) return null;
  if (!m.activo) return 'apagado';
  if (m.estado === 'limite') return 'limite';
  if (m.estado === 'reserva') return 'reserva';
  return 'libre';
}

export function motoresParaCielo(lista: readonly MotorApi[] = []): MotorCielo[] {
  const fuera: MotorCielo[] = [];
  for (const m of lista) {
    const estado = estadoVisual(m);
    const identidad = IDENTIDAD[m.id];
    if (estado && identidad) fuera.push({ id: m.id, ...identidad, estado, trabajos: m.trabajos, uso: m.uso, logo: m.logo });
  }
  return fuera;
}
