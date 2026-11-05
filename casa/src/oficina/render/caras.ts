import { Color } from 'three';

type Lienzo = CanvasRenderingContext2D;

/** Estilos de cara que sabe dibujar el motor (los 5 base + los de Halloween). */
export const ESTILOS_CARA = [
  'feliz',
  'sonrisa',
  'concentrado',
  'guino',
  'serio',
  'vampiro',
  'calavera',
  'momia',
] as const;

/** Estilos cuyo dibujo no cambia al parpadear. */
const SIN_PARPADEO: readonly string[] = ['calavera', 'momia'];

/** ¿Existe una versión "ojos cerrados" distinta para este estilo? */
export const parpadea = (estilo: string) => !SIN_PARPADEO.includes(estilo);

/** Oscurece o aclara un color hex multiplicándolo por `factor`. */
export function oscurecer(hex: string, factor: number): string {
  const color = new Color(hex);
  color.multiplyScalar(factor);
  return `#${color.getHexString()}`;
}

const OSCURO = '#1b1b1f';

function ojos(x: Lienzo, parpadeo: boolean, color = OSCURO): void {
  if (parpadeo) {
    x.strokeStyle = OSCURO;
    x.lineWidth = 5;
    for (const cx of [42, 86]) {
      x.beginPath();
      x.moveTo(cx - 8, 58);
      x.lineTo(cx + 8, 58);
      x.stroke();
    }
    return;
  }
  for (const cx of [42, 86]) {
    x.fillStyle = color;
    x.beginPath();
    x.ellipse(cx, 56, 7.5, 10.5, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(cx - 2.5, 51.5, 2.6, 0, Math.PI * 2);
    x.fill();
  }
}

function rubor(x: Lienzo): void {
  x.fillStyle = 'rgba(232,110,110,.28)';
  for (const cx of [30, 98]) {
    x.beginPath();
    x.ellipse(cx, 76, 9, 5, 0, 0, Math.PI * 2);
    x.fill();
  }
}

/** Dibuja una cara de 128×128 (portado de `drawFace` del prototipo). */
export function dibujarCara(x: Lienzo, estilo: string, parpadeo: boolean): void {
  x.lineCap = 'round';
  x.strokeStyle = OSCURO;
  x.lineWidth = 5;

  if (estilo === 'calavera') {
    x.fillStyle = OSCURO;
    for (const cx of [40, 88]) {
      x.beginPath();
      x.ellipse(cx, 56, 15, 17, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.beginPath();
    x.moveTo(64, 70);
    x.lineTo(57, 82);
    x.lineTo(71, 82);
    x.closePath();
    x.fill();
    x.fillRect(40, 92, 48, 14);
    x.fillStyle = '#e9e4d6';
    for (let i = 0; i < 5; i++) x.fillRect(43 + i * 9.4, 94, 6, 10);
    return;
  }
  if (estilo === 'momia') {
    x.fillStyle = '#2a2216';
    x.fillRect(22, 44, 84, 26);
    for (const cx of [44, 84]) {
      x.fillStyle = '#fff6d8';
      x.beginPath();
      x.arc(cx, 57, 8, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = OSCURO;
      x.beginPath();
      x.arc(cx + 1, 58, 4, 0, Math.PI * 2);
      x.fill();
    }
    return;
  }
  if (estilo === 'vampiro') {
    ojos(x, parpadeo, '#9b1c1c');
    x.beginPath();
    x.moveTo(30, 40);
    x.lineTo(52, 46);
    x.moveTo(98, 40);
    x.lineTo(76, 46);
    x.stroke();
    x.beginPath();
    x.arc(64, 78, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    x.stroke();
    x.fillStyle = '#fff';
    for (const [fx, fy] of [
      [56, 90],
      [72, 90],
    ] as const) {
      x.beginPath();
      x.moveTo(fx - 4, fy - 2);
      x.lineTo(fx + 4, fy - 2);
      x.lineTo(fx, fy + 8);
      x.closePath();
      x.fill();
    }
    return;
  }
  if (estilo === 'guino') {
    if (!parpadeo) {
      x.fillStyle = OSCURO;
      x.beginPath();
      x.ellipse(42, 56, 7.5, 10.5, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(39.5, 51.5, 2.6, 0, Math.PI * 2);
      x.fill();
    }
    x.beginPath();
    x.arc(86, 60, 9, 1.15 * Math.PI, 1.85 * Math.PI);
    x.stroke();
    if (parpadeo) {
      x.beginPath();
      x.moveTo(34, 58);
      x.lineTo(50, 58);
      x.stroke();
    }
    x.beginPath();
    x.arc(64, 76, 18, 0.12 * Math.PI, 0.88 * Math.PI);
    x.stroke();
    rubor(x);
    return;
  }

  ojos(x, parpadeo);
  if (estilo === 'concentrado') {
    x.beginPath();
    x.moveTo(32, 40);
    x.lineTo(52, 44);
    x.moveTo(96, 40);
    x.lineTo(76, 44);
    x.stroke();
    x.beginPath();
    x.moveTo(54, 86);
    x.quadraticCurveTo(64, 90, 74, 86);
    x.stroke();
  } else if (estilo === 'serio') {
    x.beginPath();
    x.moveTo(33, 42);
    x.lineTo(51, 42);
    x.moveTo(77, 42);
    x.lineTo(95, 42);
    x.stroke();
    x.beginPath();
    x.moveTo(52, 86);
    x.lineTo(76, 86);
    x.stroke();
  } else if (estilo === 'sonrisa') {
    x.fillStyle = OSCURO;
    x.beginPath();
    x.moveTo(44, 76);
    x.quadraticCurveTo(64, 104, 84, 76);
    x.closePath();
    x.fill();
    x.fillStyle = '#e46b6b';
    x.beginPath();
    x.ellipse(64, 89, 9, 4, 0, 0, Math.PI * 2);
    x.fill();
    rubor(x);
  } else {
    x.beginPath();
    x.arc(64, 74, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    x.stroke();
    rubor(x);
  }
}

/** Cara tallada de la calabaza (128×128). */
export function dibujarCaraCalabaza(x: Lienzo): void {
  x.fillStyle = '#ffd166';
  for (const [cx, cy] of [
    [38, 58],
    [90, 58],
  ] as const) {
    x.beginPath();
    x.moveTo(cx, cy - 14);
    x.lineTo(cx + 13, cy + 8);
    x.lineTo(cx - 13, cy + 8);
    x.closePath();
    x.fill();
  }
  x.beginPath();
  x.moveTo(64, 70);
  x.lineTo(70, 80);
  x.lineTo(58, 80);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(26, 88);
  x.lineTo(40, 98);
  x.lineTo(52, 90);
  x.lineTo(64, 100);
  x.lineTo(76, 90);
  x.lineTo(88, 98);
  x.lineTo(102, 88);
  x.lineTo(92, 110);
  x.lineTo(36, 110);
  x.closePath();
  x.fill();
}

export function dibujarVendas(x: Lienzo, w: number, h: number): void {
  x.fillStyle = '#d8cdb1';
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,100,70,.55)';
  x.lineWidth = 2;
  for (let y = 4; y < h; y += 9) {
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(w, y + 5);
    x.stroke();
  }
}

export function dibujarHuesoExtremidad(x: Lienzo, w: number, h: number): void {
  x.fillStyle = '#151719';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#e9e4d6';
  x.fillRect(w / 2 - 4, 6, 8, h - 12);
  x.beginPath();
  x.arc(w / 2, 8, 6, 0, Math.PI * 2);
  x.arc(w / 2, h - 8, 6, 0, Math.PI * 2);
  x.fill();
}

export interface DatosTorso {
  top: string;
  topColor: string;
  print: string;
  face: string;
}

function dibujarCopo(x: Lienzo, cx: number, cy: number, radio: number): void {
  x.beginPath();
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI) / 3;
    x.moveTo(cx - Math.cos(ang) * radio, cy - Math.sin(ang) * radio);
    x.lineTo(cx + Math.cos(ang) * radio, cy + Math.sin(ang) * radio);
  }
  x.stroke();
}

/** Suéter de lana: cuello y dobladillo acanalados, franja de rombos y copos de nieve. */
function dibujarSueterNavideno(x: Lienzo, w: number, h: number, base: string): void {
  const oscuro = oscurecer(base, 0.72);
  x.fillStyle = oscuro;
  x.beginPath();
  x.ellipse(64, 0, 28, 16, 0, 0, Math.PI);
  x.fill();
  x.fillRect(0, h - 14, w, 14);
  x.fillStyle = '#f4f1e8';
  for (let cx = 6; cx < w; cx += 16) {
    x.beginPath();
    x.moveTo(cx, 40);
    x.lineTo(cx + 8, 32);
    x.lineTo(cx + 16, 40);
    x.lineTo(cx + 8, 48);
    x.closePath();
    x.fill();
  }
  x.strokeStyle = '#f4f1e8';
  x.lineWidth = 3;
  x.lineCap = 'round';
  for (const [cx, cy] of [
    [30, 82],
    [64, 100],
    [98, 82],
  ] as const) {
    dibujarCopo(x, cx, cy, 12);
  }
}

/** Estampados de tops con diseño propio (por id de top): reciben el color de arriba. */
const TOPS_CON_DISENO: Record<string, (x: Lienzo, w: number, h: number, base: string) => void> = {
  'sueter-navideno': dibujarSueterNavideno,
};

/** Frente del torso (128×136): cuello, botones, solapas, estampado… según el top. */
export function dibujarTorso(x: Lienzo, w: number, h: number, a: DatosTorso): void {
  const propio = TOPS_CON_DISENO[a.top];
  if (propio) {
    x.fillStyle = a.topColor;
    x.fillRect(0, 0, w, h);
    propio(x, w, h, a.topColor);
    return;
  }
  const base = a.top === 'bata' ? '#eef0f2' : a.top === 'esqueleto' ? '#151719' : a.topColor;
  if (a.top === 'momia') {
    dibujarVendas(x, w, h);
    return;
  }
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  const oscuro = oscurecer(base, 0.72);
  const claro = oscurecer(base, 1.25);
  x.lineCap = 'round';
  if (a.top === 'polera') {
    x.fillStyle = oscuro;
    x.beginPath();
    x.ellipse(64, 0, 24, 14, 0, 0, Math.PI);
    x.fill();
    if (a.print) {
      x.fillStyle = 'rgba(255,255,255,.9)';
      x.font = '700 40px Inter, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(a.print, 64, 70);
    }
  } else if (a.top === 'poleron') {
    x.fillStyle = oscuro;
    x.beginPath();
    x.ellipse(64, 0, 30, 18, 0, 0, Math.PI);
    x.fill();
    x.strokeStyle = '#eef0f2';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(54, 14);
    x.lineTo(52, 40);
    x.moveTo(74, 14);
    x.lineTo(76, 40);
    x.stroke();
    x.fillStyle = oscuro;
    x.beginPath();
    x.moveTo(36, 96);
    x.lineTo(92, 96);
    x.lineTo(100, 124);
    x.lineTo(28, 124);
    x.closePath();
    x.fill();
  } else if (a.top === 'camisa') {
    x.fillStyle = claro;
    x.beginPath();
    x.moveTo(40, 0);
    x.lineTo(64, 22);
    x.lineTo(50, 30);
    x.closePath();
    x.fill();
    x.beginPath();
    x.moveTo(88, 0);
    x.lineTo(64, 22);
    x.lineTo(78, 30);
    x.closePath();
    x.fill();
    x.fillStyle = oscuro;
    for (let y = 36; y < 130; y += 20) {
      x.beginPath();
      x.arc(64, y, 3.2, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = oscuro;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(64, 22);
    x.lineTo(64, h);
    x.stroke();
  } else if (a.top === 'blazer') {
    x.fillStyle = '#eef0f2';
    x.beginPath();
    x.moveTo(44, 0);
    x.lineTo(84, 0);
    x.lineTo(64, 60);
    x.closePath();
    x.fill();
    x.fillStyle = a.face === 'vampiro' ? '#9b1c1c' : '#3a4a6b';
    x.beginPath();
    x.moveTo(60, 8);
    x.lineTo(68, 8);
    x.lineTo(70, 50);
    x.lineTo(64, 58);
    x.lineTo(58, 50);
    x.closePath();
    x.fill();
    x.fillStyle = oscuro;
    x.beginPath();
    x.moveTo(36, 0);
    x.lineTo(56, 0);
    x.lineTo(64, 64);
    x.lineTo(44, 40);
    x.closePath();
    x.fill();
    x.beginPath();
    x.moveTo(92, 0);
    x.lineTo(72, 0);
    x.lineTo(64, 64);
    x.lineTo(84, 40);
    x.closePath();
    x.fill();
    x.fillStyle = claro;
    for (const y of [86, 108]) {
      x.beginPath();
      x.arc(72, y, 3, 0, Math.PI * 2);
      x.fill();
    }
  } else if (a.top === 'bata') {
    x.fillStyle = '#7fc4de';
    x.beginPath();
    x.moveTo(48, 0);
    x.lineTo(80, 0);
    x.lineTo(64, 40);
    x.closePath();
    x.fill();
    x.strokeStyle = '#b9bec5';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(40, 0);
    x.lineTo(64, 56);
    x.lineTo(88, 0);
    x.moveTo(64, 56);
    x.lineTo(64, h);
    x.stroke();
    x.strokeRect(20, 84, 30, 26);
    x.strokeRect(78, 84, 30, 26);
    x.fillStyle = '#2f5fbf';
    x.fillRect(84, 76, 4, 18);
  } else if (a.top === 'deportiva') {
    x.fillStyle = '#eef0f2';
    x.fillRect(18, 0, 10, h);
    x.fillRect(100, 0, 10, h);
    x.font = '700 46px "Bricolage Grotesque", Inter, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('10', 64, 72);
  } else if (a.top === 'esqueleto') {
    x.strokeStyle = '#e9e4d6';
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(64, 8);
    x.lineTo(64, 128);
    x.stroke();
    for (let i = 0; i < 4; i++) {
      const y = 26 + i * 18;
      x.beginPath();
      x.moveTo(64, y);
      x.quadraticCurveTo(40, y - 6, 28, y + 8);
      x.moveTo(64, y);
      x.quadraticCurveTo(88, y - 6, 100, y + 8);
      x.stroke();
    }
  }
}

/** Globo de estado sobre la cabeza (96×96): puntos al trabajar, signo "!" al esperar. */
export function dibujarIcono(x: Lienzo, esperando: boolean): void {
  x.fillStyle = esperando ? '#f0a848' : 'rgba(18,30,30,.92)';
  x.beginPath();
  x.arc(48, 44, 34, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(36, 72);
  x.lineTo(30, 90);
  x.lineTo(52, 76);
  x.fill();
  if (esperando) {
    x.fillStyle = '#1a1206';
    x.fillRect(44, 22, 8, 30);
    x.beginPath();
    x.arc(48, 62, 5, 0, Math.PI * 2);
    x.fill();
  } else {
    x.fillStyle = '#62c9c0';
    for (const cx of [30, 48, 66]) {
      x.beginPath();
      x.arc(cx, 44, 6, 0, Math.PI * 2);
      x.fill();
    }
  }
}
