import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { plano } from '../../mansion/plano';
import type { Ambiente } from '../../mansion/plano';
import type { Departamento } from '../../tipos';

const ANCHO = 2.8;
const ALTO = 0.5;
const PX_ANCHO = 1024;
const PX_ALTO = Math.round((PX_ANCHO * ALTO) / ANCHO);

function pintar(nombre: string, color: string): CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = PX_ANCHO;
  lienzo.height = PX_ALTO;
  const g = lienzo.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#101317';
  g.fillRect(0, 0, PX_ANCHO, PX_ALTO);
  g.fillStyle = color;
  g.fillRect(0, 0, 34, PX_ALTO);
  g.fillStyle = '#f5f1e8';
  g.textBaseline = 'middle';
  // Los nombres largos se achican para caber.
  let tam = 92;
  do {
    g.font = `700 ${tam}px system-ui, "Segoe UI", sans-serif`;
    tam -= 4;
  } while (g.measureText(nombre).width > PX_ANCHO - 110 && tam > 36);
  g.fillText(nombre, 72, PX_ALTO / 2 + 4, PX_ANCHO - 110);
  const textura = new CanvasTexture(lienzo);
  textura.colorSpace = SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

function Cartel({ ambiente, nombre, color }: { ambiente: Ambiente; nombre: string; color: string }) {
  const textura = useMemo(() => pintar(nombre, color), [nombre, color]);
  useEffect(() => () => textura.dispose(), [textura]);
  // A un costado, hacia afuera de la casa: al centro tapa el videowall y a la gente de la sala.
  const x = ambiente.x0 + ambiente.x1 > 0 ? ambiente.x1 - ANCHO / 2 - 0.5 : ambiente.x0 + ANCHO / 2 + 0.5;
  const y = ambiente.y + ambiente.alto - ALTO / 2 - 0.22;
  const z = ambiente.z1 - 0.12;
  // nivelCorte: se oculta con su piso cuando se entra a una sala de más abajo.
  return (
    <group position={[x, y, z]} userData={{ nivelCorte: ambiente.nivel }}>
      <mesh raycast={() => null} userData={{ nivelCorte: ambiente.nivel }}>
        <planeGeometry args={[ANCHO, ALTO]} />
        <meshBasicMaterial map={textura} toneMapped={false} color="#dcdcdc" />
      </mesh>
      {[-1, 1].map((lado) => (
        <mesh key={lado} position={[(lado * ANCHO) / 2.4, ALTO / 2 + 0.11, -0.01]} raycast={() => null} userData={{ nivelCorte: ambiente.nivel }}>
          <boxGeometry args={[0.025, 0.22, 0.025]} />
          <meshBasicMaterial color="#20242a" />
        </mesh>
      ))}
    </group>
  );
}

/** Cartel colgado al frente de cada sala con el nombre y el color de su departamento. */
export function CartelesSalas({ departamentos }: { departamentos: readonly Departamento[] }) {
  return (
    <>
      {departamentos.map((d) => {
        // Una sala puede tener varios ambientes (living y gimnasio): el cartel, en el más ancho.
        const ambiente = plano.ambientes.filter((a) => a.departamento === d.id && a.alto > 0).sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0) || b.x0 - a.x0)[0];
        return ambiente ? <Cartel key={d.id} ambiente={ambiente} nombre={d.nombre} color={d.color} /> : null;
      })}
    </>
  );
}
