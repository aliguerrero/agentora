/** `frameloop` de R3F: sin cuadros cuando la oficina no se ve ('demand' no sirve, hay animación continua). */
export function frameloopPara(visible: boolean): 'always' | 'never' {
  return visible ? 'always' : 'never';
}
