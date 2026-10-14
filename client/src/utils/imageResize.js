// Prepares an image IN THE BROWSER before it is uploaded (book covers and profile photos):
//   1. checks the type (JPG/PNG/WEBP) and size (max 5 MB) of the chosen file
//   2. checks the picture is big enough (smaller would look blurry)
//   3. cuts the middle part to the wanted shape (center crop): 2:3 for covers, square for photos
//   4. resizes it with a <canvas> and saves it as JPEG (quality 0.85, lower if the file is still big)
// Result: small files with a fixed shape, well below the server's upload limits.
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE = 5 * 1024 * 1024;

// Loads the file into an <img> so its pixels can be drawn on a canvas
const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be read as an image.')); };
  img.src = url;
});

const toJpeg = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// width/height = output size; minWidth/minHeight = smallest accepted picture; targetBytes = size goal
export async function prepareImage(file, { width, height, minWidth, minHeight, targetBytes }) {
  if (!TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WEBP image.');
  if (file.size > MAX_FILE) throw new Error('The image is larger than 5 MB.');

  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < minWidth || h < minHeight) {
    throw new Error(`This image is only ${w}×${h} pixels. Use one of at least ${minWidth}×${minHeight} pixels.`);
  }

  // Center crop to the output shape. Too wide -> cut the sides; too tall -> cut the top and bottom.
  const ratio = width / height;
  let sw = w; let sh = h;
  if (w / h > ratio) sw = Math.round(h * ratio); else sh = Math.round(w / ratio);
  const sx = Math.round((w - sw) / 2);
  const sy = Math.round((h - sh) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Transparent PNG areas get the page's surface colour (white) instead of black in the JPEG
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  // Try quality 0.85 first; if the file is still big, lower the quality a little
  let blob = null;
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    blob = await toJpeg(canvas, q);
    if (blob && blob.size <= targetBytes) break;
  }
  if (!blob) throw new Error('The image could not be converted.');
  return { blob, url: URL.createObjectURL(blob), width, height };
}

// Book cover: 2:3, 300×450, at least 200×300, about 150 KB at most (server limit 300 KB)
export const prepareCover = (file) => prepareImage(file, { width: 300, height: 450, minWidth: 200, minHeight: 300, targetBytes: 150 * 1024 });

// Profile photo: square, 256×256, at least 128×128, about 60 KB at most (server limit 150 KB)
export const prepareAvatar = (file) => prepareImage(file, { width: 256, height: 256, minWidth: 128, minHeight: 128, targetBytes: 60 * 1024 });
