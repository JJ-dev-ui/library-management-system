// Finds the REAL type of an uploaded image from its first bytes ("magic bytes"), plus its size in pixels.
// Why: the file name and the mimetype are sent by the browser and can be faked (e.g. a script renamed
// to cover.jpg). The first bytes of a real image are fixed by its format:
//   JPEG: FF D8 FF            PNG: 89 50 4E 47 0D 0A 1A 0A            WEBP: "RIFF" .... "WEBP"
// Returns { type, width, height } or null when the bytes are not a JPEG/PNG/WEBP image.

function jpegSize(buf) {
  // Walk the JPEG "segments" until the Start-Of-Frame marker, which holds height and width
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 (except C4 = DHT, C8 = reserved, CC = DAC) contain the image size
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}

function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    const size = jpegSize(buf);
    return size ? { type: 'image/jpeg', ...size } : null;
  }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; // from the IHDR chunk
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const size = webpSize(buf);
    return size ? { type: 'image/webp', ...size } : null;
  }
  return null;
}

module.exports = { imageInfo };
