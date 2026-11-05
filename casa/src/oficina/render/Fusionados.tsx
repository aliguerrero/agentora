import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Mesh } from 'three';
import type { Group } from 'three';
import { fusionar } from './fusion';
import { ProveedorPartes } from './Pieza';
import type { Parte } from './Pieza';

interface Props {
  children: ReactNode;
}

/**
 * Cada `Pieza` de los hijos se anota aquí y, una vez montados, sus geometrías se fusionan
 * en una malla por material (matrices y colores horneados). Es para decorado que no se
 * mueve: si los hijos cambian, hay que remontar este componente (cambiar su `key`).
 */
export function Fusionados({ children }: Props) {
  const partes = useMemo<Parte[]>(() => [], []);
  const origen = useRef<Group>(null);
  const salida = useRef<Group>(null);

  useLayoutEffect(() => {
    const raiz = origen.current;
    const destino = salida.current;
    if (!raiz || !destino) return;
    raiz.updateMatrixWorld(true);
    const fusiones = fusionar(
      partes.map((p) => ({
        geometria: p.geometria,
        estilo: p.estilo,
        matriz: p.ancla.matrixWorld,
      })),
    );
    const mallas = fusiones.map(({ geometria, material }) => {
      const malla = new Mesh(geometria, material);
      malla.castShadow = true;
      malla.receiveShadow = true;
      malla.matrixAutoUpdate = false;
      destino.add(malla);
      return malla;
    });
    return () => {
      for (const malla of mallas) {
        destino.remove(malla);
        malla.geometry.dispose();
      }
    };
  }, [partes]);

  return (
    <ProveedorPartes value={partes}>
      <group ref={origen}>{children}</group>
      <group ref={salida} />
    </ProveedorPartes>
  );
}
