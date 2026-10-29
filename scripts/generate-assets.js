/* ==========================================================================
   CNU FREE V2 — APP ICON & SPLASH PNG GENERATOR (scripts/generate-assets.js)
   Section 5:
   - Generates a valid PNG icon (1024x1024) and splash screen (2048x2048)
     using pure Node.js zlib/CRC32 (zero external binary dependencies) with
     an ink (#0B1B16) background and mint (#6CF2A2) overlapping-circles mark.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

// Precompute CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createOverlappingCirclesPng(size, circleRadius, strokeWidth) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cy = size / 2;
  const cxLeft = size * 0.415;
  const cxRight = size * 0.585;
  const innerR = circleRadius - strokeWidth / 2;
  const outerR = circleRadius + strokeWidth / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // Filter type 0 (None)
    const dy = y - cy;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      // Default Ink #0B1B16
      let r = 0x0b;
      let g = 0x1b;
      let b = 0x16;

      const dLeft = Math.hypot(x - cxLeft, dy);
      const dRight = Math.hypot(x - cxRight, dy);

      const onLeftRing = dLeft >= innerR && dLeft <= outerR;
      const onRightRing = dRight >= innerR && dRight <= outerR;

      if (onLeftRing) {
        // Mint #6CF2A2
        r = 0x6c;
        g = 0xf2;
        b = 0xa2;
      } else if (onRightRing) {
        // Soft White over Ink
        r = 0xdc;
        g = 0xe8;
        b = 0xe3;
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(raw, { level: 6 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(RESOURCES_DIR, { recursive: true });
const iconPng = createOverlappingCirclesPng(1024, 210, 72);
fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.png'), iconPng);

const splashPng = createOverlappingCirclesPng(1024, 140, 48);
fs.writeFileSync(path.join(RESOURCES_DIR, 'splash.png'), splashPng);
console.log('Generated resources/icon.png and resources/splash.png');
