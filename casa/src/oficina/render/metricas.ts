import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { crearVentana } from '../rendimiento/percentiles';
import type { VentanaCuadros } from '../rendimiento/percentiles';
import type { MetricasRender } from '../tipos';

/** Cuadros que entran en la ventana (los mismos 120 que mira `decidirCalidad`). */
const CUADROS_VENTANA = 120;
const INTERVALO_S = 0.5;
/** Un cuadro más largo que esto es una pausa (pestaña oculta, `visible` volvió a true), no un cuadro lento. */
const PAUSA_MAXIMA_S = 0.25;

interface Opciones {
  agentes: number;
  onMetricas?: (metricas: MetricasRender) => void;
  /**
   * Recibe el p95 y el tamaño de la ventana cada 500 ms. Si devuelve `true`, la ventana
   * se vacía (por ejemplo, tras cambiar de nivel de calidad).
   */
  alMuestrear?: (p95: number, muestras: number) => boolean;
}

/**
 * Mide fps, p50, p95, draw calls y triángulos y los emite cada 500 ms. Se usa dentro del
 * `<Canvas>`; no dibuja nada.
 */
export function useMetricas({ agentes, onMetricas, alMuestrear }: Opciones): void {
  const gl = useThree((estado) => estado.gl);
  const ventana = useRef<VentanaCuadros>(crearVentana(CUADROS_VENTANA));
  const acumulado = useRef({ segundos: 0, cuadros: 0 });
  const opciones = useRef({ agentes, onMetricas, alMuestrear });
  opciones.current = { agentes, onMetricas, alMuestrear };

  useFrame((_, delta) => {
    if (delta > PAUSA_MAXIMA_S) return;
    ventana.current.agregar(delta * 1000);
    const acc = acumulado.current;
    acc.segundos += delta;
    acc.cuadros += 1;
    if (acc.segundos < INTERVALO_S) return;

    const p95 = ventana.current.percentil(95);
    const { agentes: n, onMetricas: emitir, alMuestrear: muestrear } = opciones.current;
    emitir?.({
      webgl: true,
      fps: Math.round(acc.cuadros / acc.segundos),
      p50: ventana.current.percentil(50),
      p95,
      drawCalls: gl.info.render.calls,
      triangulos: gl.info.render.triangles,
      agentes: n,
    });
    if (muestrear?.(p95, ventana.current.tamano())) ventana.current = crearVentana(CUADROS_VENTANA);
    acc.segundos = 0;
    acc.cuadros = 0;
  });
}
