import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { Material } from 'three';
import type { Estilo, Familia } from './flota';
import { material } from './recursos';
import {
  geometriaAtlasCaras,
  geometriaAtlasIconos,
  geometriaAtlasTorsos,
  materialAtlasCaras,
  materialAtlasIconos,
  materialAtlasTorsos,
  materialHueso,
  materialVendas,
} from './texturas';

/** Orden de dibujo de lo transparente: anillo y sombra, caras, cristales, globos de estado. */
export const ORDEN = { anillo: 1, cara: 2, cristal: 3, icono: 4 } as const;

const familias = new Map<string, Familia>();
const estilos = new Map<string, Estilo>();

function familia(clave: string, crear: () => Familia): Familia {
  let existente = familias.get(clave);
  if (!existente) {
    existente = crear();
    familias.set(clave, existente);
  }
  return existente;
}

function estilo(clave: string, crear: () => Estilo): Estilo {
  let existente = estilos.get(clave);
  if (!existente) {
    existente = crear();
    estilos.set(clave, existente);
  }
  return existente;
}

/** Material estándar blanco por rugosidad: el color de cada pieza va por instancia o por vértice. */
const familiaStd = (rugosidad: number): Familia =>
  familia(`std:${rugosidad}`, () => ({
    clave: `std:${rugosidad}`,
    material: material(
      `lote:std:${rugosidad}`,
      () => new MeshStandardMaterial({ roughness: rugosidad }),
    ),
    fusion: material(
      `fusion:std:${rugosidad}`,
      () => new MeshStandardMaterial({ roughness: rugosidad, vertexColors: true }),
    ),
  }));

const familiaBasica = (): Familia =>
  familia('basico', () => ({
    clave: 'basico',
    material: material('lote:basico', () => new MeshBasicMaterial({ toneMapped: false })),
    fusion: material(
      'fusion:basico',
      () => new MeshBasicMaterial({ toneMapped: false, vertexColors: true }),
    ),
  }));

/** Pieza lisa de un color (hex) y una rugosidad: se agrupa con todas las de su rugosidad. */
export const pintura = (color: string, rugosidad = 0.55): Estilo =>
  estilo(`${color}:${rugosidad}`, () => ({
    familia: familiaStd(rugosidad),
    color: new Color(color),
  }));

/** Pieza sin sombreado (`MeshBasicMaterial`) de un color. */
export const basico = (color: string): Estilo =>
  estilo(`basico:${color}`, () => ({ familia: familiaBasica(), color: new Color(color) }));

/**
 * Pieza con un material suyo (vidrio, líquido emisivo, anillo…): se agrupa solo con las que
 * comparten ese mismo material.
 */
export const propio = (m: Material, ordenRender?: number): Estilo =>
  estilo(`propio:${m.uuid}`, () => ({
    familia: { clave: `propio:${m.uuid}`, material: m, ordenRender },
    color: null,
  }));

export const vendas = (): Estilo => propio(materialVendas());
export const hueso = (): Estilo => propio(materialHueso());

const sinColor = (clave: string, crear: () => Familia): Estilo =>
  estilo(clave, () => ({ familia: familia(clave, crear), color: null }));

/** Cara de la persona: lee una celda del atlas de caras. */
export const estiloCara = (): Estilo =>
  sinColor('cara', () => ({
    clave: 'cara',
    material: materialAtlasCaras(),
    atlas: geometriaAtlasCaras(),
    ordenRender: ORDEN.cara,
  }));

/** Frente del torso: lee una celda del atlas de torsos. */
export const estiloTorsoFrente = (): Estilo =>
  sinColor('torso-frente', () => ({
    clave: 'torso-frente',
    material: materialAtlasTorsos(),
    atlas: geometriaAtlasTorsos(),
  }));

/** Globo de estado: lee una celda del atlas de iconos. */
export const estiloIcono = (): Estilo =>
  sinColor('icono', () => ({
    clave: 'icono',
    material: materialAtlasIconos(),
    atlas: geometriaAtlasIconos(),
    ordenRender: ORDEN.icono,
  }));
