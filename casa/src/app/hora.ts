import { horaChile } from '@jules/oficina';

/**
 * Fecha cuya hora en America/Santiago es `hora` (0–24, decimal), tomando como base el día de
 * `ahora`. Sirve para simular la hora con la prop `horaChile` de `<Oficina>`.
 */
export function fechaChileA(hora: number, ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + (hora - horaChile(ahora)) * 3_600_000);
}

/** Hora decimal (0 ≤ h < 24) en una zona IANA; si la zona no existe, la del navegador. */
export function horaEnZona(zona: string, fecha: Date = new Date()): number {
  try {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(fecha)
        .map((p) => [p.type, p.value]),
    );
    return Number(partes['hour']) + Number(partes['minute']) / 60 + Number(partes['second']) / 3600;
  } catch {
    return fecha.getHours() + fecha.getMinutes() / 60;
  }
}

/** `14.5` -> `14:30`. */
export function formatearHora(hora: number): string {
  const total = Math.round((((hora % 24) + 24) % 24) * 60) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
