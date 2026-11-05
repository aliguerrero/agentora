import { AdditiveBlending, DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Material } from 'three';
import { material } from '../../recursos';
import { texturaRadial } from '../../texturas';
import type { ClaveMaterial } from '../arquitectura';
import { materialCasa } from '../materiales';
import { lienzoCodigo, lienzoDatos, lienzoEspejo, lienzoFuego, lienzoLamina } from './lienzos';
import type { ClaveAmbiente } from './taller';

/**
 * Materiales del mobiliario: los de la casa (`materialCasa`) y los propios, uno por familia
 * (todo lo de color variado va por color de vértice en el mismo material). Compartidos.
 */
const PROPIOS: Record<Exclude<ClaveAmbiente, ClaveMaterial>, () => Material> = {
  tinte: () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
  'tinte-brillo': () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }),
  emisivo: () => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  halo: () =>
    new MeshBasicMaterial({
      map: texturaRadial('ambientes:halo', [
        [0, 'rgba(255,255,255,0.9)'],
        [0.3, 'rgba(255,255,255,0.32)'],
        [0.7, 'rgba(255,255,255,0.07)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  fuego: () =>
    new MeshBasicMaterial({
      map: lienzoFuego(),
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    }),
  codigo: () => new MeshBasicMaterial({ map: lienzoCodigo(), toneMapped: false }),
  datos: () => new MeshBasicMaterial({ map: lienzoDatos(), toneMapped: false }),
  lamina: () => new MeshStandardMaterial({ map: lienzoLamina(), roughness: 0.78 }),
  'espejo-gym': () =>
    new MeshStandardMaterial({
      map: lienzoEspejo(),
      metalness: 0.55,
      roughness: 0.08,
      envMapIntensity: 1.2,
    }),
  piel: () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.48 }),
};

const esPropia = (c: ClaveAmbiente): c is Exclude<ClaveAmbiente, ClaveMaterial> => c in PROPIOS;

export const materialAmbiente = (clave: ClaveAmbiente): Material =>
  esPropia(clave) ? material(`ambientes:${clave}`, PROPIOS[clave]) : materialCasa(clave);

/** Materiales que no proyectan sombra (luz pintada, pantallas, llamas, láminas planas). */
export const SIN_SOMBRA: ReadonlySet<ClaveAmbiente> = new Set<ClaveAmbiente>([
  'halo',
  'fuego',
  'emisivo',
  'codigo',
  'datos',
]);
