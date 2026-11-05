/** Vite entrega el texto de un archivo con el sufijo `?raw` (lo usan las pruebas del motor). */
declare module '*?raw' {
  const texto: string;
  export default texto;
}
