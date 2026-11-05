/** Rejilla de un atlas de texturas: `columnas × filas` celdas de `celdaAncho × celdaAlto` px. */
export interface GeometriaAtlas {
  columnas: number;
  filas: number;
  celdaAncho: number;
  celdaAlto: number;
  /** Texels que se recortan por cada lado de la celda para que el mipmapping no mezcle vecinas. */
  margen: number;
}

export interface UvCelda {
  x: number;
  y: number;
}

export const anchoAtlas = (g: GeometriaAtlas) => g.columnas * g.celdaAncho;
export const altoAtlas = (g: GeometriaAtlas) => g.filas * g.celdaAlto;

/** Reparte celdas por clave, en orden de llegada. */
export function crearAsignador(capacidad: number) {
  const indices = new Map<string, number>();
  return {
    asignar(clave: string): { indice: number; nueva: boolean } {
      const existente = indices.get(clave);
      if (existente !== undefined) return { indice: existente, nueva: false };
      if (indices.size >= capacidad) {
        throw new Error(`Atlas lleno: ${capacidad} celdas ocupadas, no cabe "${clave}"`);
      }
      const indice = indices.size;
      indices.set(clave, indice);
      return { indice, nueva: true };
    },
  };
}

/**
 * Desplazamiento UV (esquina inferior izquierda del recorte) de una celda. El lienzo se
 * recorre de arriba abajo y la textura tiene `flipY`, de ahí el `1 -`.
 */
export function uvDeCelda(g: GeometriaAtlas, indice: number, salida: UvCelda): void {
  const columna = indice % g.columnas;
  const fila = Math.floor(indice / g.columnas);
  salida.x = (columna * g.celdaAncho + g.margen) / anchoAtlas(g);
  salida.y = 1 - ((fila + 1) * g.celdaAlto - g.margen) / altoAtlas(g);
}

/** Escala UV del recorte de una celda (igual para todas). */
export function escalaDeCelda(g: GeometriaAtlas): UvCelda {
  return {
    x: (g.celdaAncho - 2 * g.margen) / anchoAtlas(g),
    y: (g.celdaAlto - 2 * g.margen) / altoAtlas(g),
  };
}
