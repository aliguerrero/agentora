import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { COLUMNAS_CODIGO } from './atlas';

/**
 * Texturas del mobiliario dibujadas una sola vez en un lienzo del navegador: código para las
 * pantallas de Desarrollo, gráficos y pipeline, ondas de audio, la carta estelar, tres cuadros
 * abstractos y las llamas de la chimenea. Las regiones de cada atlas están en `atlas.ts`. Sin
 * DOM (pruebas) devuelven `null` y el material queda con su color.
 */

const LADO = 1024;

function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function lienzo(
  ancho: number,
  alto: number,
  dibujar: (c: CanvasRenderingContext2D) => void,
): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = ancho;
  el.height = alto;
  const c = el.getContext('2d');
  if (!c) return null;
  dibujar(c);
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Código con resaltado de sintaxis: cuatro columnas (archivos), repetible en vertical. */
export function lienzoCodigo(): CanvasTexture | null {
  const t = lienzo(LADO, LADO, (c) => {
    const r = azar(4242);
    c.fillStyle = '#0b1018';
    c.fillRect(0, 0, LADO, LADO);
    const colores = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787', '#c9d1d9', '#ffa657'];
    const col = LADO / COLUMNAS_CODIGO;
    for (let k = 0; k < COLUMNAS_CODIGO; k++) {
      const x0 = k * col;
      c.fillStyle = k % 2 ? '#0d131d' : '#0b1018';
      c.fillRect(x0, 0, col, LADO);
      c.fillStyle = '#121a26';
      c.fillRect(x0, 0, 22, LADO);
      let sangria = 0;
      for (let y = 6; y < LADO - 8; y += 12) {
        c.fillStyle = '#3a4656';
        c.fillRect(x0 + 6, y + 3, 10, 4);
        if (r() < 0.12) {
          sangria = Math.max(0, sangria - 1);
          continue;
        }
        if (r() < 0.3) sangria = Math.min(4, sangria + 1);
        else if (r() < 0.2) sangria = Math.max(0, sangria - 1);
        let x = x0 + 30 + sangria * 14;
        const fichas = 1 + Math.floor(r() * 5);
        for (let i = 0; i < fichas && x < x0 + col - 12; i++) {
          const largo = Math.min(10 + r() * 46, x0 + col - 8 - x);
          c.fillStyle = colores[Math.floor(r() * colores.length)] as string;
          c.globalAlpha = 0.85;
          c.fillRect(x, y + 2, largo, 6);
          x += largo + 6;
        }
        c.globalAlpha = 1;
      }
      // Cursor y línea activa.
      c.fillStyle = 'rgba(121,192,255,0.08)';
      c.fillRect(x0 + 22, 300 + k * 120, col - 22, 12);
    }
  });
  if (t) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  return t;
}

function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#0f1626');
  g.addColorStop(1, '#0a0f1a');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
}

function linea(
  c: CanvasRenderingContext2D,
  puntos: readonly (readonly [number, number])[],
  color: string,
  ancho: number,
) {
  c.beginPath();
  puntos.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = ancho;
  c.lineJoin = 'round';
  c.stroke();
}

/** Atlas de datos: pipeline de ventas, gráfico de líneas, velas, ondas de audio y KPI. */
export function lienzoDatos(): CanvasTexture | null {
  return lienzo(LADO, LADO, (c) => {
    const r = azar(777);
    // Pipeline (0,0)-(1024,512): columnas kanban con tarjetas y una barra de avance.
    panel(c, 0, 0, 1024, 512);
    c.fillStyle = '#e8edf5';
    c.fillRect(32, 28, 260, 18);
    c.fillStyle = '#5c6b80';
    c.fillRect(32, 54, 160, 10);
    const etapas = ['#5aa9ff', '#8b7bff', '#f2b84b', '#4fd18b', '#ff7a6b'];
    etapas.forEach((color, i) => {
      const x = 32 + i * 196;
      c.fillStyle = '#141d2f';
      c.fillRect(x, 84, 180, 400);
      c.fillStyle = color;
      c.fillRect(x, 84, 180, 6);
      c.fillStyle = '#c3cede';
      c.fillRect(x + 12, 104, 90, 10);
      const tarjetas = 2 + Math.floor(r() * 4);
      for (let k = 0; k < tarjetas; k++) {
        const y = 130 + k * 68;
        c.fillStyle = '#1d2840';
        c.fillRect(x + 10, y, 160, 58);
        c.fillStyle = color;
        c.fillRect(x + 10, y, 4, 58);
        c.fillStyle = '#dfe6f1';
        c.fillRect(x + 22, y + 12, 70 + r() * 70, 8);
        c.fillStyle = '#7f8ca3';
        c.fillRect(x + 22, y + 30, 50 + r() * 50, 6);
        c.fillStyle = '#e9c46a';
        c.fillRect(x + 122, y + 40, 38, 8);
      }
    });
    // Gráfico de líneas (0,512)-(512,768).
    panel(c, 0, 512, 512, 256);
    c.strokeStyle = '#1b2638';
    c.lineWidth = 1;
    for (let k = 0; k < 5; k++)
      linea(
        c,
        [
          [24, 552 + k * 44],
          [492, 552 + k * 44],
        ],
        '#1b2638',
        1,
      );
    const serie = (base: number, color: string) => {
      let v = base;
      const pts: [number, number][] = [];
      for (let x = 24; x <= 492; x += 18) {
        v += (r() - 0.42) * 16;
        pts.push([x, Math.min(740, Math.max(548, v))]);
      }
      linea(c, pts, color, 3);
    };
    serie(720, '#5aa9ff');
    serie(690, '#4fd18b');
    c.fillStyle = '#e8edf5';
    c.fillRect(24, 524, 120, 12);
    // Velas (512,512)-(1024,768).
    panel(c, 512, 512, 512, 256);
    let p = 650;
    for (let x = 536; x < 1000; x += 16) {
      const q = p + (r() - 0.48) * 30;
      const alto = Math.min(p, q);
      const bajo = Math.max(p, q);
      c.fillStyle = q < p ? '#4fd18b' : '#ff6b6b';
      c.fillRect(x + 6, alto - 10 - r() * 10, 2, bajo - alto + 24);
      c.fillRect(x + 2, alto, 10, Math.max(3, bajo - alto));
      p = Math.min(740, Math.max(540, q));
    }
    // Ondas de audio (0,768)-(512,1024): pistas de una mesa de mezcla.
    panel(c, 0, 768, 512, 256);
    const pistas = ['#ff7a6b', '#f2b84b', '#5aa9ff', '#4fd18b'];
    pistas.forEach((color, i) => {
      const y = 800 + i * 56;
      c.fillStyle = '#141d2f';
      c.fillRect(16, y - 22, 480, 46);
      c.fillStyle = color;
      for (let x = 20; x < 492; x += 3) {
        const a = Math.abs(Math.sin(x * 0.05 + i) * Math.sin(x * 0.013 + i * 2)) * 18 + r() * 4;
        c.fillRect(x, y - a, 2, a * 2);
      }
    });
    c.fillStyle = '#ffffff';
    c.fillRect(300, 776, 2, 240);
    // KPI (512,768)-(1024,1024): tres cifras grandes y una dona.
    panel(c, 512, 768, 512, 256);
    [0, 1, 2].forEach((i) => {
      const x = 536 + i * 120;
      c.fillStyle = '#7f8ca3';
      c.fillRect(x, 800, 70, 8);
      c.fillStyle = ['#4fd18b', '#5aa9ff', '#f2b84b'][i] as string;
      c.fillRect(x, 820, 96, 30);
    });
    c.beginPath();
    c.arc(930, 900, 60, -Math.PI / 2, Math.PI * 1.1);
    c.strokeStyle = '#5aa9ff';
    c.lineWidth = 20;
    c.stroke();
    c.beginPath();
    c.arc(930, 900, 60, Math.PI * 1.1, Math.PI * 1.5);
    c.strokeStyle = '#2a3550';
    c.stroke();
    for (let k = 0; k < 6; k++) {
      c.fillStyle = '#1d2840';
      c.fillRect(536, 880 + k * 22, 300, 14);
      c.fillStyle = '#c3cede';
      c.fillRect(544, 884 + k * 22, 60 + r() * 120, 6);
    }
  });
}

/** Carta estelar, dos cuadros verticales y uno cuadrado (abstractos, de paleta cálida). */
export function lienzoLamina(): CanvasTexture | null {
  return lienzo(LADO, LADO, (c) => {
    const r = azar(2027);
    // Carta estelar (0,0)-(1024,512): azul noche, cuadrícula de coordenadas y constelaciones.
    const fondo = c.createRadialGradient(512, 256, 40, 512, 256, 620);
    fondo.addColorStop(0, '#1b2a52');
    fondo.addColorStop(1, '#0a1128');
    c.fillStyle = fondo;
    c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = 'rgba(214,180,110,0.35)';
    c.lineWidth = 1.5;
    for (const radio of [90, 170, 250, 330]) {
      c.beginPath();
      c.arc(512, 256, radio, 0, Math.PI * 2);
      c.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      linea(
        c,
        [
          [512, 256],
          [512 + Math.cos(a) * 560, 256 + Math.sin(a) * 560],
        ],
        'rgba(214,180,110,0.22)',
        1,
      );
    }
    for (let k = 0; k < 520; k++) {
      const x = r() * 1024;
      const y = r() * 512;
      const s = r() < 0.08 ? 2.6 : r() * 1.4 + 0.4;
      c.fillStyle = r() < 0.15 ? '#ffe4a8' : '#e8eefc';
      c.globalAlpha = 0.5 + r() * 0.5;
      c.beginPath();
      c.arc(x, y, s, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    for (let k = 0; k < 9; k++) {
      let x = 80 + r() * 860;
      let y = 60 + r() * 390;
      const pts: [number, number][] = [[x, y]];
      for (let j = 0; j < 4 + Math.floor(r() * 3); j++) {
        x += (r() - 0.5) * 120;
        y += (r() - 0.5) * 90;
        pts.push([x, y]);
      }
      linea(c, pts, 'rgba(240,206,130,0.75)', 1.8);
      for (const [px, py] of pts) {
        c.fillStyle = '#fff3cf';
        c.beginPath();
        c.arc(px, py, 3.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.strokeStyle = '#c9a25a';
    c.lineWidth = 6;
    c.strokeRect(8, 8, 1008, 496);
    // Vertical 1 (0,512)-(256,1024): bloques de color de campo.
    const v1: [string, number, number][] = [
      ['#e9dfcc', 0, 1],
      ['#b5562f', 0.08, 0.46],
      ['#1f2a44', 0.5, 0.78],
      ['#c9a25a', 0.82, 0.9],
    ];
    for (const [color, a, b] of v1) {
      c.fillStyle = color;
      c.fillRect(18, 530 + a * 476, 220, (b - a) * 476);
    }
    // Vertical 2 (256,512)-(512,1024): arcos superpuestos.
    c.fillStyle = '#efe7d8';
    c.fillRect(256, 512, 256, 512);
    const arcos: [string, number, number][] = [
      ['#6b6d3c', 384, 900],
      ['#d07a45', 384, 760],
      ['#2e3d5c', 384, 640],
    ];
    for (const [color, x, y] of arcos) {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, y, 92, Math.PI, 0);
      c.fill();
      c.fillRect(x - 92, y, 184, 60);
    }
    // Cuadrado (512,512)-(1024,1024): sol y horizonte en dos tintas.
    c.fillStyle = '#e6d6bd';
    c.fillRect(512, 512, 512, 512);
    c.fillStyle = '#b84c2a';
    c.beginPath();
    c.arc(768, 720, 150, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#25324d';
    c.fillRect(512, 780, 512, 244);
    c.fillStyle = '#c9a25a';
    c.fillRect(560, 800, 416, 8);
    c.strokeStyle = 'rgba(30,30,30,0.15)';
    for (let k = 0; k < 40; k++)
      linea(
        c,
        [
          [512 + r() * 512, 512],
          [512 + r() * 512, 1024],
        ],
        'rgba(60,40,20,0.05)',
        2,
      );
  });
}

/** Llamas: lenguas amarillas y naranjas que se desvanecen hacia arriba; se repite en x. */
export function lienzoFuego(): CanvasTexture | null {
  const t = lienzo(256, 128, (c) => {
    const r = azar(99);
    c.clearRect(0, 0, 256, 128);
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 22; k++) {
      const x = r() * 256;
      const alto = 50 + r() * 70;
      const ancho = 10 + r() * 16;
      const g = c.createLinearGradient(0, 128, 0, 128 - alto);
      g.addColorStop(0, 'rgba(255,200,90,0.9)');
      g.addColorStop(0.35, 'rgba(255,120,30,0.55)');
      g.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = g;
      for (const dx of [-256, 0, 256]) {
        c.beginPath();
        c.moveTo(x + dx - ancho, 128);
        c.quadraticCurveTo(x + dx - ancho * 0.6, 128 - alto * 0.55, x + dx, 128 - alto);
        c.quadraticCurveTo(x + dx + ancho * 0.6, 128 - alto * 0.55, x + dx + ancho, 128);
        c.fill();
      }
    }
  });
  if (t) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  return t;
}

/** Espejo pintado: gris azulado frío con dos franjas diagonales de brillo (se lee como espejo). */
export function lienzoEspejo(): CanvasTexture | null {
  return lienzo(256, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 128);
    g.addColorStop(0, '#b9c6cf');
    g.addColorStop(0.5, '#dfe7ec');
    g.addColorStop(1, '#aebcc6');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [x, ancho] of [
      [70, 22],
      [104, 8],
      [180, 14],
    ] as const) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + ancho, 0);
      c.lineTo(x + ancho - 60, 128);
      c.lineTo(x - 60, 128);
      c.fill();
    }
  });
}
