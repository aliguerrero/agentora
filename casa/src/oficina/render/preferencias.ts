import { useEffect, useState } from 'react';

const CONSULTA = '(prefers-reduced-motion: reduce)';

/** ¿Hay un puntero fino (ratón) como entrada principal? Distingue escritorio de teléfono/tableta. */
export function esEscritorio(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

/** ¿Puede este navegador crear un contexto WebGL? */
export function hayWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const lienzo = document.createElement('canvas');
    const gl = lienzo.getContext('webgl2') ?? lienzo.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    // Algunos navegadores lanzan en vez de devolver null cuando WebGL está bloqueado.
    return false;
  }
}

/** `prefers-reduced-motion: reduce`, reactivo a cambios de la preferencia del sistema. */
export function useReduceMotion(): boolean {
  const [reducir, setReducir] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches,
  );
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA);
    const alCambiar = () => setReducir(consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);
  return reducir;
}
