/**
 * PWA用の正方形アイコンPNGを生成する。
 *
 *   node scripts/make-icons.mjs
 *
 * 外部の画像ライブラリを増やさずに済ませるため、zlib だけで最小限のPNGを書き出す。
 * 図柄は帯（黒帯に赤バー）を模した幾何形状で、写真を使わないため軽量。
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "public");

const BG = [15, 23, 42]; // --color-ink
const BELT = [17, 17, 20]; // 帯の黒
const BAR = [220, 38, 38]; // 赤バー
const EDGE = [56, 189, 248]; // --color-accent

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  // 各行の先頭にフィルタバイト0を付けた raw RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 帯を模した図柄 */
function beltPixel(x, y, size) {
  const u = x / size;
  const v = y / size;

  // 帯の本体（中央の横帯）
  if (v > 0.38 && v < 0.62) {
    // 赤バー（右寄り）
    if (u > 0.62 && u < 0.86) return BAR;
    return BELT;
  }
  // 帯の縁を示す細いアクセント線
  if ((v > 0.355 && v <= 0.38) || (v >= 0.62 && v < 0.645)) return EDGE;
  return BG;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = encodePng(size, beltPixel);
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`生成: public/icon-${size}.png (${(png.length / 1024).toFixed(1)}KB)`);
}
