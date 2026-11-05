import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, PMREMGenerator, SRGBColorSpace } from 'three';
import type { DirectionalLight, Material } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PaletaLuz, RGB } from './casa/luz';
import { encenderLed } from './casa/materiales';

/**
 * Distancia del sol y de la luna al origen (luces direccionales). Apuntan a su blanco por
 * defecto, el origen: la cámara de sombras (±26 m) cubre la casa, la torre y el terreno.
 */
const DISTANCIA_ASTRO = 45;
/** Candelas de una luz puntual con intensidad relativa 1. */
const CANDELAS = 38;

const aColor = (c: RGB) => new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace);

interface Props {
  paleta: PaletaLuz;
  sombras: boolean;
}

/**
 * Luz de la casa según la hora de Chile (`paletaLuz`): sol y luna direccionales (solo el sol
 * proyecta sombra real, y solo con `sombras`), relleno del cielo, hasta 4 luces puntuales
 * cálidas por dentro y un entorno PMREM (sala neutra, generado una vez) para los reflejos del
 * mármol, el vidrio y el metal. Fija también la exposición y el brillo de las tiras LED.
 */
export function Luces({ paleta, sombras }: Props) {
  const sol = useRef<DirectionalLight>(null);
  const scene = useThree((estado) => estado.scene);
  const gl = useThree((estado) => estado.gl);

  // Entorno de reflejos: una sola vez por renderer.
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const sala = new RoomEnvironment();
    const entorno = pmrem.fromScene(sala, 0.04);
    scene.environment = entorno.texture;
    return () => {
      if (scene.environment === entorno.texture) scene.environment = null;
      entorno.dispose();
      pmrem.dispose();
      sala.traverse((o) => {
        const malla = o as { geometry?: { dispose(): void }; material?: Material };
        malla.geometry?.dispose();
        malla.material?.dispose();
      });
    };
  }, [gl, scene]);

  const colores = useMemo(
    () => ({
      sol: aColor(paleta.sol.color),
      luna: aColor(paleta.luna.color),
      cielo: aColor(paleta.hemisferio.cielo),
      suelo: aColor(paleta.hemisferio.suelo),
      interior: aColor(paleta.interior.color),
    }),
    [paleta],
  );

  useLayoutEffect(() => {
    scene.environmentIntensity = paleta.entorno;
    gl.toneMappingExposure = paleta.exposicion;
    encenderLed(colores.interior, paleta.interior.led);
  }, [scene, gl, paleta, colores]);

  useLayoutEffect(() => {
    const luzSol = sol.current;
    if (!luzSol) return;
    Object.assign(luzSol.shadow.camera, {
      left: -26,
      right: 26,
      top: 24,
      bottom: -24,
      near: 5,
      far: 95,
    });
    luzSol.shadow.camera.updateProjectionMatrix();
  }, []);

  // Cambiar sombras recompila los materiales (como `applyShadows` del prototipo).
  useLayoutEffect(() => {
    gl.shadowMap.enabled = sombras;
    scene.traverse((objeto) => {
      const material = (objeto as { material?: Material | Material[] }).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
    });
  }, [gl, scene, sombras]);

  const { sol: s, luna: l } = paleta;
  const desde = (d: { x: number; y: number; z: number }): [number, number, number] => [
    d.x * DISTANCIA_ASTRO,
    d.y * DISTANCIA_ASTRO,
    d.z * DISTANCIA_ASTRO,
  ];
  return (
    <>
      <hemisphereLight
        color={colores.cielo}
        groundColor={colores.suelo}
        intensity={paleta.hemisferio.intensidad}
      />
      <directionalLight
        ref={sol}
        color={colores.sol}
        position={desde(s.direccion)}
        intensity={s.intensidad}
        castShadow={sombras}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight
        color={colores.luna}
        position={desde(l.direccion)}
        intensity={l.intensidad}
      />
      {paleta.interior.puntuales.map((p, i) => (
        <pointLight
          key={i}
          color={colores.interior}
          position={[p.x, p.y, p.z]}
          intensity={p.intensidad * CANDELAS}
          distance={p.distancia}
          decay={2}
        />
      ))}
    </>
  );
}
