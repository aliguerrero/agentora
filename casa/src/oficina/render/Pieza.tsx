import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type { BufferGeometry, Group } from 'three';
import type { Estilo } from './flota';

type Tupla = [number, number, number];

/**
 * Una pieza visible: el `ancla` (un grupo vacío del esqueleto) dice dónde está; la
 * geometría y el estilo dicen cómo se dibuja. Quien lee las partes las instancia o las fusiona.
 */
export interface Parte {
  ancla: Group;
  geometria: BufferGeometry;
  estilo: Estilo;
  /** Celda del atlas (solo en familias con atlas); el animador la cambia cada cuadro. */
  celda: number;
  /** Mira siempre a la cámara (globos de estado). */
  cartel: boolean;
}

const Partes = createContext<Parte[] | null>(null);

/** Dentro de este proveedor, cada `Pieza` se anota en `partes`. */
export const ProveedorPartes = Partes.Provider;

interface Props {
  g: BufferGeometry;
  e: Estilo;
  p?: Tupla;
  r?: Tupla;
  visible?: boolean;
  celda?: number;
  cartel?: boolean;
  /** Recibe la parte registrada, para animarla (`celda`, `ancla.visible`…). */
  parte?: MutableRefObject<Parte | null>;
  children?: ReactNode;
}

/**
 * Una pieza del modelo. No crea una malla: deja un grupo vacío en el árbol y se anota en
 * las partes del proveedor más cercano. Así el esqueleto sigue siendo un árbol de grupos
 * articulados, pero se dibuja con instancias o geometría fusionada (muy pocos draw calls).
 * Los hijos cuelgan del mismo grupo y heredan su transformación.
 */
export function Pieza({ g, e, p, r, visible, celda = 0, cartel = false, parte, children }: Props) {
  const registro = useContext(Partes);
  const ancla = useRef<Group>(null);

  useLayoutEffect(() => {
    const nodo = ancla.current;
    if (!registro || !nodo) return;
    const entrada: Parte = { ancla: nodo, geometria: g, estilo: e, celda, cartel };
    registro.push(entrada);
    if (parte) parte.current = entrada;
    return () => {
      registro.splice(registro.indexOf(entrada), 1);
      if (parte?.current === entrada) parte.current = null;
    };
  }, [registro, g, e, celda, cartel, parte]);

  return (
    <group ref={ancla} position={p} rotation={r} visible={visible}>
      {children}
    </group>
  );
}
