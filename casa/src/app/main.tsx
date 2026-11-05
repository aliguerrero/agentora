import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DevBox } from './DevBox';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root');
createRoot(raiz).render(
  <StrictMode>
    <DevBox />
  </StrictMode>,
);
