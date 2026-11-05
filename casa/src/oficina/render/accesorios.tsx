import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { ConeGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three';
import { pintura } from './estilos';
import { Pieza } from './Pieza';
import { caja, cajaRedonda, geometria } from './recursos';

/**
 * Dónde cuelga una pieza: `cabeza` (coordenadas de la cabeza), `columna` (del torso, con el
 * origen en la cintura) o `mano` (del codo izquierdo, con la mano en [0, -0.33, 0.06]).
 */
export type Ancla = 'cabeza' | 'columna' | 'mano';

export interface Accesorio {
  ancla: Ancla;
  /** Cubre la cabeza: el peinado omite el flequillo que asomaría por encima. */
  sombrero?: boolean;
  dibujar: () => ReactNode;
}

const ROJO_NAVIDAD = '#c1272d';
const BLANCO = '#f4f4f4';
const PAJA = '#e0c98a';
const AZUL_CHILE = '#0039a6';
const ROJO_CHILE = '#d52b1e';

const base = (r: number, alto: number) =>
  geometria(`cono:${r}:${alto}`, () => new ConeGeometry(r, alto, 20).translate(0, alto / 2, 0));
const varilla = (r0: number, r1: number, alto: number) =>
  geometria(`varilla:${r0}:${r1}:${alto}`, () =>
    new CylinderGeometry(r0, r1, alto, 6).translate(0, alto / 2, 0),
  );
const cilindro = (r: number, alto: number) =>
  geometria(`cilindro:${r}:${alto}`, () => new CylinderGeometry(r, r, alto, 24));
const esfera = (r: number) => geometria(`esfera:${r}`, () => new SphereGeometry(r, 12, 10));

/** Estrella de cinco puntas, de pie, de radio `r`. */
const estrella = (r: number) =>
  geometria(`estrella:${r}`, () => {
    const forma = new Shape();
    for (let i = 0; i < 10; i++) {
      const radio = i % 2 === 0 ? r : r * 0.382;
      const angulo = Math.PI / 2 + (i * Math.PI) / 5;
      const punto: [number, number] = [Math.cos(angulo) * radio, Math.sin(angulo) * radio];
      if (i === 0) forma.moveTo(...punto);
      else forma.lineTo(...punto);
    }
    return new ExtrudeGeometry(forma, { depth: 0.004, bevelEnabled: false });
  });

function GorroPapaNoel() {
  const rojo = pintura(ROJO_NAVIDAD, 0.8);
  const blanco = pintura(BLANCO, 0.9);
  return (
    <>
      <Pieza g={cilindro(0.245, 0.09)} e={blanco} p={[0, 0.2, 0]} />
      <Pieza g={base(0.23, 0.42)} e={rojo} p={[0, 0.24, 0]} r={[0, 0, -0.45]} />
      <Pieza g={esfera(0.07)} e={blanco} p={[0.18, 0.62, 0]} />
    </>
  );
}

function GorroElfo() {
  return (
    <>
      <Pieza g={cilindro(0.245, 0.07)} e={pintura(ROJO_NAVIDAD, 0.8)} p={[0, 0.2, 0]} />
      <Pieza g={base(0.2, 0.5)} e={pintura('#2e8b57', 0.8)} p={[0, 0.23, 0]} r={[0, 0, 0.35]} />
      <Pieza g={esfera(0.045)} e={pintura('#e8c14a', 0.3)} p={[-0.17, 0.7, 0]} />
    </>
  );
}

function CuernosReno() {
  const asta = pintura('#7a4a22', 0.7);
  return (
    <>
      {[-1, 1].map((s) => (
        <Pieza
          key={s}
          g={varilla(0.018, 0.03, 0.3)}
          e={asta}
          p={[s * 0.14, 0.2, 0]}
          r={[0, 0, -s * 0.4]}
        >
          <Pieza g={varilla(0.012, 0.02, 0.14)} e={asta} p={[0, 0.12, 0]} r={[0, 0, s * 0.7]} />
          <Pieza g={varilla(0.012, 0.02, 0.12)} e={asta} p={[0, 0.22, 0]} r={[0.6, 0, s * 0.5]} />
        </Pieza>
      ))}
    </>
  );
}

function BarbaPapaNoel() {
  const blanco = pintura('#eef0f2', 0.9);
  return (
    <>
      <Pieza g={cajaRedonda(0.4, 0.19, 0.1, 2, 0.04)} e={blanco} p={[0, -0.14, 0.2]} />
      <Pieza g={cajaRedonda(0.26, 0.05, 0.06, 1, 0.02)} e={blanco} p={[0, -0.05, 0.238]} />
    </>
  );
}

function Bufanda() {
  const roja = pintura(ROJO_NAVIDAD, 0.9);
  const blanca = pintura(BLANCO, 0.9);
  return (
    <>
      <Pieza g={cajaRedonda(0.5, 0.11, 0.36, 2, 0.04)} e={roja} p={[0, 0.6, 0]} />
      {[-0.15, 0.05].map((x) => (
        <Pieza key={x} g={caja(0.05, 0.115, 0.365)} e={blanca} p={[x, 0.6, 0]} />
      ))}
      <Pieza
        g={cajaRedonda(0.12, 0.3, 0.04, 2, 0.015)}
        e={roja}
        p={[0.14, 0.42, 0.19]}
        r={[0, 0, 0.05]}
      >
        <Pieza g={caja(0.125, 0.03, 0.045)} e={blanca} p={[0, -0.04, 0]} />
      </Pieza>
    </>
  );
}

function Poncho() {
  return (
    <>
      <Pieza
        g={cajaRedonda(0.62, 0.5, 0.38, 2, 0.05)}
        e={pintura('#b22222', 0.9)}
        p={[0, 0.37, 0]}
      />
      <Pieza g={caja(0.63, 0.04, 0.385)} e={pintura('#f2f2f2', 0.9)} p={[0, 0.4, 0]} />
      <Pieza g={caja(0.63, 0.04, 0.385)} e={pintura('#151719', 0.9)} p={[0, 0.3, 0]} />
    </>
  );
}

function Chamanto() {
  return (
    <>
      <Pieza
        g={cajaRedonda(0.66, 0.34, 0.4, 2, 0.05)}
        e={pintura('#f2f2f2', 0.9)}
        p={[0, 0.46, 0]}
      />
      <Pieza g={caja(0.67, 0.05, 0.405)} e={pintura(ROJO_CHILE, 0.9)} p={[0, 0.52, 0]} />
      <Pieza g={caja(0.67, 0.05, 0.405)} e={pintura(AZUL_CHILE, 0.9)} p={[0, 0.4, 0]} />
    </>
  );
}

function Chupalla() {
  const paja = pintura(PAJA, 0.8);
  return (
    <>
      <Pieza g={cilindro(0.4, 0.02)} e={paja} p={[0, 0.2, 0]} />
      <Pieza g={cilindro(0.2, 0.14)} e={paja} p={[0, 0.27, 0]} />
      <Pieza g={cilindro(0.208, 0.04)} e={pintura('#7a2a1f', 0.8)} p={[0, 0.23, 0]} />
    </>
  );
}

function Faja() {
  const roja = pintura('#b22222', 0.9);
  return (
    <>
      <Pieza g={cajaRedonda(0.6, 0.11, 0.34, 2, 0.03)} e={roja} p={[0, 0.07, 0]} />
      <Pieza g={caja(0.61, 0.025, 0.345)} e={pintura('#151719', 0.9)} p={[0, 0.07, 0]} />
      <Pieza g={cajaRedonda(0.1, 0.13, 0.05, 1, 0.02)} e={roja} p={[0.2, 0.05, 0.18]} />
    </>
  );
}

/** Bandera de Chile en su asta: cantón azul con estrella blanca, franja blanca y franja roja. */
function BanderaChilena() {
  const blanco = pintura('#ffffff', 0.7);
  return (
    <Pieza
      g={varilla(0.012, 0.012, 0.9)}
      e={pintura('#7a4a22', 0.7)}
      p={[0, -0.33, 0.06]}
      r={[1.1, 0, 0]}
    >
      <Pieza g={caja(0.1, 0.1, 0.008)} e={pintura(AZUL_CHILE, 0.7)} p={[0.065, 0.8, 0]} />
      <Pieza g={caja(0.2, 0.1, 0.008)} e={blanco} p={[0.215, 0.8, 0]} />
      <Pieza g={caja(0.3, 0.1, 0.008)} e={pintura(ROJO_CHILE, 0.7)} p={[0.165, 0.7, 0]} />
      <Pieza g={estrella(0.034)} e={blanco} p={[0.065, 0.8, 0.004]} />
      <Pieza g={estrella(0.034)} e={blanco} p={[0.065, 0.8, -0.008]} r={[0, Math.PI, 0]} />
    </Pieza>
  );
}

/**
 * Piezas dibujadas por id: agregar una pieza a un paquete de skins es agregar una entrada
 * aquí. El motor solo busca el id; no conoce ningún paquete.
 */
export const ACCESORIOS: Readonly<Record<string, Accesorio>> = {
  'gorro-papa-noel': { ancla: 'cabeza', sombrero: true, dibujar: GorroPapaNoel },
  'gorro-elfo': { ancla: 'cabeza', sombrero: true, dibujar: GorroElfo },
  'cuernos-reno': { ancla: 'cabeza', sombrero: true, dibujar: CuernosReno },
  'barba-papa-noel': { ancla: 'cabeza', dibujar: BarbaPapaNoel },
  chupalla: { ancla: 'cabeza', sombrero: true, dibujar: Chupalla },
  bufanda: { ancla: 'columna', dibujar: Bufanda },
  poncho: { ancla: 'columna', dibujar: Poncho },
  chamanto: { ancla: 'columna', dibujar: Chamanto },
  faja: { ancla: 'columna', dibujar: Faja },
  'bandera-chilena': { ancla: 'mano', dibujar: BanderaChilena },
};

/** Dibuja, en un ancla, las piezas equipadas que están en `ACCESORIOS`. */
export function AccesoriosRegistrados({ ancla, acc }: { ancla: Ancla; acc: string[] }) {
  return (
    <>
      {acc.map((id) => {
        const accesorio = ACCESORIOS[id];
        return accesorio?.ancla === ancla ? (
          <Fragment key={id}>{accesorio.dibujar()}</Fragment>
        ) : null;
      })}
    </>
  );
}
