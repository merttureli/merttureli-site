import * as THREE from 'three';

// One shared paint sheet in assembly coordinates. Letters stay with their tube.
export const BODY_TOP = .370693, BODY_BOTTOM = -.570693;
export const FRONT_ANGLE = Math.atan2(1, 2.8);
export function bodyUV(x, y, z) {
  let u = .5 + (Math.atan2(x, z) - FRONT_ANGLE) / (2 * Math.PI);
  u = ((u % 1) + 1) % 1;
  return [u, (y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM)];
}

function wrapGeometry(source) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [0, 1, 2].map(j => bodyUV(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j)));
    if (Math.max(...triangle.map(p => p[0])) - Math.min(...triangle.map(p => p[0])) > .5) {
      for (const point of triangle) if (point[0] < .5) point[0] += 1;
    }
    triangle.forEach((point, j) => uv.set(point, (i + j) * 2));
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  source.dispose();
  return geometry;
}

export function createLivery() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => null;
  const py = y => (BODY_TOP - y) / (BODY_TOP - BODY_BOTTOM) * canvas.height;
  ctx.fillStyle = '#d63b08'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#890919';
  for (const [top, bottom] of [[BODY_TOP, .352], [-.067, -.085]]) {
    ctx.fillRect(0, py(top), canvas.width, py(bottom) - py(top));
  }
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  function letters(text, firstY, step, height) {
    ctx.font = `700 ${height / (BODY_TOP - BODY_BOTTOM) * canvas.height}px "Space Grotesk", sans-serif`;
    [...text].forEach((letter, i) => ctx.fillText(letter, canvas.width / 2, py(firstY - i * step), 80));
  }
  letters('CHARGER', .318, .056, .040);
  letters('UCRC', -.121, .044, .037);
  letters('2026', -.355, .043, .036);
  // A small lightning mark between the club initials and the year.
  const bolt = [[9, -.281], [-15, -.315], [-3, -.315], [-10, -.341], [16, -.305], [3, -.305]];
  ctx.beginPath();
  bolt.forEach(([x, y], i) => {
    const px = canvas.width / 2 + x * canvas.width / (2 * Math.PI * 34);
    if (i === 0) ctx.moveTo(px, py(y)); else ctx.lineTo(px, py(y));
  });
  ctx.closePath(); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.name = 'CHARGER orange, red bands, vertical CHARGER / UCRC / lightning / 2026';
  return (part, geometry) => {
    if (part.id === 1 || part.id === 2) {
      return {geometry: wrapGeometry(geometry), color: 0xffffff, map: texture, metalness: 0, roughness: .58};
    }
    if (part.id === 0 || (part.id >= 6 && part.id <= 9)) {
      return {geometry, color: 0xeeeeeb, metalness: 0, roughness: .58};
    }
    if (part.id === 19) return {geometry, color: 0x890919, metalness: .08, roughness: .4};
    return null;
  };
}
