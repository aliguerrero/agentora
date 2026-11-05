import { useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshBasicMaterial } from 'three';
import type { PaletaLuz } from '../luz';
import { planoCorte } from '../planoCorte';
import { construirAmbientes } from './construir';
import { materialAmbiente, SIN_SOMBRA } from './materiales';

interface Props {
  paleta: PaletaLuz;
  /** Sombras reales (calidad alta en escritorio). */
  sombras: boolean;
  /** 0..1: velocidad del fuego y del código (menor con `prefers-reduced-motion`). */
  movimiento: number;
}

/** Brillo de la luz pintada del mobiliario: tenue de día, plena de noche. */
const brilloHalo = (charcos: number) => 0.25 + 0.75 * Math.min(1, charcos);

/**
 * Mobiliario, revestimientos y detalles de los ambientes de la mansión: todo se arma una vez y
 * se dibuja con una malla por (material, lado, nivel). Los revestimientos de muros exteriores
 * llevan `userData.ladoCorte` y `userData.nivelCorte` para que la cámara los oculte con su muro.
 * Lo único que se anima es por uniformes de textura y color: el código que avanza en las
 * pantallas y las llamas de la chimenea (sin crear objetos por cuadro).
 */
export function Ambientes({ paleta, sombras, movimiento }: Props) {
  const fusion = useMemo(() => construirAmbientes().fusion, []);
  useLayoutEffect(() => () => fusion.forEach((f) => f.geometria.dispose()), [fusion]);
  // El corte de altura de la casa (`planoCorte`) también recorta el mobiliario: al entrar a un
  // ambiente, los muebles de los pisos de arriba desaparecen con su arquitectura.
  useLayoutEffect(() => {
    for (const { clave } of fusion) {
      const m = materialAmbiente(clave);
      if (m.clippingPlanes?.includes(planoCorte)) continue;
      m.clippingPlanes = [planoCorte];
      m.clipShadows = true;
      m.needsUpdate = true;
    }
  }, [fusion]);

  useLayoutEffect(() => {
    const halo = materialAmbiente('halo') as MeshBasicMaterial;
    halo.color.setScalar(brilloHalo(paleta.interior.charcos));
  }, [paleta]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * movimiento;
    const codigo = (materialAmbiente('codigo') as MeshBasicMaterial).map;
    if (codigo) codigo.offset.y = -t * 0.012;
    const fuego = materialAmbiente('fuego') as MeshBasicMaterial;
    if (fuego.map) fuego.map.offset.x = t * 0.06;
    const parpadeo =
      0.82 + 0.12 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1) + 0.06 * Math.sin(t * 23);
    fuego.color.setScalar(parpadeo);
  });

  return (
    <group>
      {fusion.map((f) => (
        <mesh
          key={`${f.clave}|${f.etiqueta?.lado ?? ''}|${f.etiqueta?.nivel ?? ''}`}
          geometry={f.geometria}
          material={materialAmbiente(f.clave)}
          userData={f.etiqueta ? { ladoCorte: f.etiqueta.lado, nivelCorte: f.etiqueta.nivel } : {}}
          castShadow={sombras && !SIN_SOMBRA.has(f.clave)}
          receiveShadow={sombras && !SIN_SOMBRA.has(f.clave)}
          renderOrder={f.clave === 'halo' || f.clave === 'fuego' ? 2 : 0}
          matrixAutoUpdate={false}
        />
      ))}
    </group>
  );
}
