import { ExtrudeGeometry, Path, PlaneGeometry, Shape } from 'three';
import type { BufferGeometry } from 'three';
import { plantilla } from './taller';

/**
 * Formas que no son cajas ni cilindros, compartidas por clave: respaldos curvos, cubiertas de
 * esquinas redondeadas, placas con agujero y planos. Todas en metros y listas para `pieza`.
 */

/** Plano unitario en xy (mira a +z); se escala y se gira al agregarlo. */
export const plano = (): BufferGeometry => plantilla('plano', () => new PlaneGeometry(1, 1));

/**
 * Lámina curva vertical (respaldo, crestas): sector de anillo de `radio` y `grosor` que abarca
 * `±angulo` detrás del origen (hacia -z) y sube de y = 0 a y = `alto`. Su cara trasera queda en
 * z = -radio - grosor.
 */
export function arco(radio: number, grosor: number, angulo: number, alto: number): BufferGeometry {
  return plantilla(`arco:${radio}:${grosor}:${angulo}:${alto}`, () => {
    const n = 12;
    const forma = new Shape();
    const desde = Math.PI / 2 - angulo;
    const hasta = Math.PI / 2 + angulo;
    for (let i = 0; i <= n; i++) {
      const a = desde + ((hasta - desde) * i) / n;
      const [x, y] = [radio * Math.cos(a), radio * Math.sin(a)];
      if (i === 0) forma.moveTo(x, y);
      else forma.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const a = desde + ((hasta - desde) * i) / n;
      forma.lineTo((radio + grosor) * Math.cos(a), (radio + grosor) * Math.sin(a));
    }
    forma.closePath();
    const g = new ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Cubierta horizontal de largo `largo` (x) y ancho `ancho` (z) con puntas semicirculares. */
export function pista(largo: number, ancho: number, grosor: number): BufferGeometry {
  return plantilla(`pista:${largo}:${ancho}:${grosor}`, () => {
    const r = ancho / 2;
    const a = largo / 2 - r;
    const forma = new Shape();
    forma.moveTo(-a, -r);
    forma.lineTo(a, -r);
    forma.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false);
    forma.lineTo(-a, r);
    forma.absarc(-a, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
    const g = new ExtrudeGeometry(forma, {
      depth: grosor,
      bevelEnabled: false,
      curveSegments: 16,
    });
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Placa vertical (en xy, de z = 0 a z = `grosor`) con un agujero circular en su centro. */
export function placaConAgujero(
  ancho: number,
  alto: number,
  radio: number,
  grosor: number,
): BufferGeometry {
  return plantilla(`placa:${ancho}:${alto}:${radio}:${grosor}`, () => {
    const forma = new Shape();
    forma.moveTo(-ancho / 2, -alto / 2);
    forma.lineTo(ancho / 2, -alto / 2);
    forma.lineTo(ancho / 2, alto / 2);
    forma.lineTo(-ancho / 2, alto / 2);
    forma.closePath();
    const hueco = new Path();
    hueco.absarc(0, 0, radio, 0, Math.PI * 2, true);
    forma.holes.push(hueco);
    return new ExtrudeGeometry(forma, { depth: grosor, bevelEnabled: false, curveSegments: 28 });
  });
}
