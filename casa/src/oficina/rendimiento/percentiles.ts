export interface VentanaCuadros {
  agregar(milisegundos: number): void;
  /** Percentil por rango más cercano sobre la ventana (0 si está vacía). */
  percentil(p: number): number;
  tamano(): number;
}

/** Ventana deslizante (ring buffer) de tiempos de cuadro. */
export function crearVentana(capacidad: number): VentanaCuadros {
  if (!Number.isInteger(capacidad) || capacidad < 1) {
    throw new Error(`La capacidad debe ser un entero ≥ 1 (recibido: ${capacidad})`);
  }
  const datos: number[] = [];
  let siguiente = 0;
  return {
    agregar(milisegundos) {
      if (datos.length < capacidad) datos.push(milisegundos);
      else datos[siguiente] = milisegundos;
      siguiente = (siguiente + 1) % capacidad;
    },
    percentil(p) {
      if (datos.length === 0) return 0;
      const ordenados = [...datos].sort((a, b) => a - b);
      const rango = Math.max(1, Math.ceil((p / 100) * ordenados.length));
      return ordenados[Math.min(rango, ordenados.length) - 1] ?? 0;
    },
    tamano: () => datos.length,
  };
}
