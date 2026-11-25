// What Halfstop sells: four sheet sizes, two papers, four frame choices. Sizes, prices and the wall geometry.
// A size is the sheet, written short side by long side. The photograph keeps its stated ratio inside a white
// border. What hangs on the wall is written width by height. Every dimension is rounded to a quarter inch.

export const SIZES = [
  { id: '8x10', a: 8, b: 10, price: 60, frame: 90, border: 0.5 },
  { id: '12x16', a: 12, b: 16, price: 110, frame: 130, border: 1 },
  { id: '18x24', a: 18, b: 24, price: 190, frame: 180, border: 1.5 },
  { id: '24x32', a: 24, b: 32, price: 320, frame: 240, border: 2 },
];
export const PAPERS = [
  { id: 'rag', name: 'Cotton rag', add: 0, note: 'Matte, 310 gsm. Deep blacks and no glare.' },
  { id: 'baryta', name: 'Baryta', add: 15, note: 'Semi-gloss, 315 gsm. Close to a darkroom print.' },
];
export const FRAMES = [
  { id: 'none', name: 'None' },
  { id: 'black', name: 'Black' },
  { id: 'oak', name: 'Oak' },
  { id: 'white', name: 'White' },
];
export const FRAME_WIDTH = 0.75;        // inches of wood on each side
export const HANG_CENTER = 58;          // inches from the floor to the middle of the print
export const MAX_PER_LINE = 5;          // of one print in one size, paper and frame
export const ROLLED = '24x32';          // the one sheet that ships in a tube
export const DEFAULT = { size: '18x24', paper: 'rag', frame: 'none' };

const by = (list, id) => list.find(x => x.id === id) || list[0];
export const sizeOf = sel => by(SIZES, sel.size);
export const paperOf = sel => by(PAPERS, sel.paper);
export const frameOf = sel => by(FRAMES, sel.frame);

const quarter = n => Math.round(n * 4) / 4;
export const money = n => '$' + Math.round(n).toLocaleString('en-US');
export const inches = n => String(quarter(n));                      // 6.75, 13.25, 25.5, 20
export const sizeName = size => `${size.a} × ${size.b} in`;

export function price(sel) {
  const size = sizeOf(sel);
  return size.price + paperOf(sel).add + (sel.frame === 'none' ? 0 : size.frame);
}

export function summary(sel) {
  const frame = frameOf(sel);
  return `${sizeName(sizeOf(sel))}, ${paperOf(sel).name.toLowerCase()}, ${sel.frame === 'none' ? 'no frame' : frame.name.toLowerCase() + ' frame'}`;
}

// Everything the wall needs, in inches. `ratio` is the photograph's stated ratio, long side over short (4/3 or 5/4).
// short and long describe the sheet and the image on it; W and H are what hangs on the wall.
export function geometry(print, sel) {
  const size = sizeOf(sel), landscape = print.landscape, ratio = print.ratio;
  const boxShort = size.a - 2 * size.border, boxLong = size.b - 2 * size.border;
  let imageShort = boxShort, imageLong = boxShort * ratio;
  if (imageLong > boxLong) { imageLong = boxLong; imageShort = boxLong / ratio; }
  imageShort = quarter(imageShort); imageLong = quarter(imageLong);
  const f = sel.frame === 'none' ? 0 : FRAME_WIDTH;
  const sheetW = landscape ? size.b : size.a, sheetH = landscape ? size.a : size.b;
  const outerW = sheetW + 2 * f, outerH = sheetH + 2 * f;
  return { imageShort, imageLong, imageW: landscape ? imageLong : imageShort, imageH: landscape ? imageShort : imageLong,
    sheetW, sheetH, f, outerW, outerH, bottom: HANG_CENTER - outerH / 2 };
}
