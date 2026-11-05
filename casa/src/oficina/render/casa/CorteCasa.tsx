import { useLayoutEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Object3D, Vector3 } from 'three';
import type { Ambiente, Nivel } from '../../mansion/plano';
import type { Rig } from '../animador';
import type { LadoCorte } from './arquitectura';
import {
  actualizarLadosOcultos,
  alturaDeCorte,
  nivelOculto,
  SIN_CORTE,
  sinLadosOcultos,
  sobreElCorte,
} from './corte';
import type { LadosOcultos } from './corte';
import { planoCorte } from './planoCorte';

/** Cada cuántos segundos se vuelve a buscar mallas etiquetadas (las que montan más tarde). */
const REESCANEO = 1.5;

interface Etiquetada {
  objeto: Object3D;
  lado?: LadoCorte;
  nivel?: Nivel;
}

interface Props {
  /** Ambiente al que se entró: oculta lo que queda sobre su cielo. */
  ambiente: Ambiente | null;
  rigs: MutableRefObject<Map<string, Rig>>;
}

/**
 * Aplica el corte de casa de muñecas. Las mallas se etiquetan con `userData.ladoCorte`
 * ('norte' | 'sur' | 'este' | 'oeste') y/o `userData.nivelCorte` (id de nivel del plano):
 * - un costado se oculta cuando la cámara está de ese lado (`corte.ts`, con histéresis);
 * - dentro de un ambiente se oculta todo lo que queda sobre su cielo: las mallas con
 *   `nivelCorte`, las personas de los pisos de arriba y, con un plano de recorte
 *   (`planoCorte`), los materiales de la casa.
 * Recorre la escena una vez al montar y cada `REESCANEO` s por si algo monta más tarde; por
 * cuadro solo mira dónde está la cámara y toca las mallas cuando algo cambia.
 */
export function CorteCasa({ ambiente, rigs }: Props) {
  const scene = useThree((s) => s.scene);
  const camara = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controles = useThree((s) => s.controls);
  const corte = alturaDeCorte(ambiente);
  const etiquetadas = useRef<Etiquetada[]>([]);
  const ocultos = useMemo<LadosOcultos>(sinLadosOcultos, []);
  const estado = useRef({ corte: Number.NaN, desde: 0, sucio: true });

  const escanear = () => {
    const lista: Etiquetada[] = [];
    scene.traverse((o) => {
      const { ladoCorte, nivelCorte } = o.userData as { ladoCorte?: LadoCorte; nivelCorte?: Nivel };
      if (ladoCorte || nivelCorte) lista.push({ objeto: o, lado: ladoCorte, nivel: nivelCorte });
    });
    etiquetadas.current = lista;
    estado.current.sucio = true;
  };

  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    escanear();
    return () => {
      for (const { objeto } of etiquetadas.current) objeto.visible = true;
      planoCorte.constant = SIN_CORTE;
    };
  }, [gl, scene]);

  useFrame((_, delta) => {
    const e = estado.current;
    e.desde += delta;
    if (e.desde > REESCANEO) {
      e.desde = 0;
      escanear();
    }
    // La dirección se mide desde el punto de mira: panear no cambia de qué lado se está.
    const mira = (controles as { target?: Vector3 } | null)?.target;
    const cambioLados = actualizarLadosOcultos(
      ocultos,
      camara.position.x - (mira?.x ?? 0),
      camara.position.z - (mira?.z ?? 0),
    );
    if (cambioLados || e.corte !== corte || e.sucio) {
      e.corte = corte;
      e.sucio = false;
      planoCorte.constant = corte;
      for (const { objeto, lado, nivel } of etiquetadas.current) {
        objeto.visible = !(lado && ocultos[lado]) && !(nivel && nivelOculto(nivel, corte));
      }
    }
    // Las personas se mueven entre pisos: se revisan todas, son pocas.
    for (const { raiz } of rigs.current.values()) {
      const visible = !sobreElCorte(raiz.position.y, corte);
      if (raiz.visible !== visible) raiz.visible = visible;
    }
  });

  return null;
}
