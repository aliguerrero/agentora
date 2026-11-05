import { Plane, Vector3 } from 'three';
import { SIN_CORTE } from './corte';

/**
 * Plano horizontal que recorta todo lo que queda sobre `constant` (m) en los materiales de la
 * casa: ocultar los pisos de arriba no cuesta ni una malla más. `CorteCasa` mueve `constant`;
 * `Casa` lo asigna a sus materiales (que comparte el mobiliario).
 */
export const planoCorte = new Plane(new Vector3(0, -1, 0), SIN_CORTE);
