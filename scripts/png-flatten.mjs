#!/usr/bin/env node
/**
 * Flattens a PNG onto an opaque background.
 *
 * The App Store rejects icons that carry an alpha channel, and the app icon is
 * a rounded square drawn on a transparent canvas: uploaded as-is it would show
 * black corners and fail validation. This script composites every pixel over
 * the icon's own background colour and writes an RGB PNG.
 *
 * Usage: node scripts/png-flatten.mjs <input.png> <output.png> [--background '#5fe9f5']
 *
 * Supports 8-bit, non-interlaced PNGs with colour type 2 (RGB) or 6 (RGBA),
 * which is what the icon pipeline produces.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
};

const readChunks = (buffer) => {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG file");
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
};

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
};

const unfilter = (raw, width, height, bytesPerPixel) => {
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const source = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? pixels[row * stride + index - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[(row - 1) * stride + index] : 0;
      const upLeft = row > 0 && index >= bytesPerPixel ? pixels[(row - 1) * stride + index - bytesPerPixel] : 0;
      let value = source[index];
      switch (filter) {
        case 0: break;
        case 1: value += left; break;
        case 2: value += up; break;
        case 3: value += Math.floor((left + up) / 2); break;
        case 4: value += paeth(left, up, upLeft); break;
        default: throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels[row * stride + index] = value & 0xff;
    }
  }
  return pixels;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export const decodePng = (buffer) => {
  const chunks = readChunks(buffer);
  const header = chunks.find((entry) => entry.type === "IHDR");
  if (!header) throw new Error("PNG without IHDR");
  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);
  const bitDepth = header.data[8];
  const colorType = header.data[9];
  const interlace = header.data[12];
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported colour type ${colorType}`);
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");

  const compressed = Buffer.concat(chunks.filter((entry) => entry.type === "IDAT").map((entry) => entry.data));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const pixels = unfilter(inflateSync(compressed), width, height, bytesPerPixel);
  return { width, height, colorType, pixels };
};

export const dominantColor = ({ width, height, colorType, pixels }) => {
  const counts = new Map();
  const step = Math.max(1, Math.floor((width * height) / 4096));
  for (let pixel = 0; pixel < width * height; pixel += step) {
    const offset = pixel * (colorType === 6 ? 4 : 3);
    if (colorType === 6 && pixels[offset + 3] < 250) continue;
    const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [winner = "255,255,255"] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return winner.split(",").map(Number);
};

/** Bounding box of the pixels that are not fully transparent. */
export const contentBounds = ({ width, height, colorType, pixels }) => {
  if (colorType !== 6) return { left: 0, top: 0, width, height };
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { left: 0, top: 0, width, height };
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

export const crop = ({ width, colorType, pixels }, bounds) => {
  const channels = colorType === 6 ? 4 : 3;
  const out = Buffer.alloc(bounds.width * bounds.height * channels);
  for (let row = 0; row < bounds.height; row += 1) {
    const sourceStart = ((bounds.top + row) * width + bounds.left) * channels;
    pixels.copy(out, row * bounds.width * channels, sourceStart, sourceStart + bounds.width * channels);
  }
  return { width: bounds.width, height: bounds.height, colorType, pixels: out };
};

export const encodeRgbPng = (width, height, rgb) => {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    rgb.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

export const flattenPng = ({ width, height, colorType, pixels }, background) => {
  const channels = colorType === 6 ? 4 : 3;
  const rgb = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 3;
    if (colorType === 6) {
      const alpha = pixels[source + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        rgb[target + channel] = Math.round(pixels[source + channel] * alpha + background[channel] * (1 - alpha));
      }
    } else {
      for (let channel = 0; channel < 3; channel += 1) rgb[target + channel] = pixels[source + channel];
    }
  }
  return encodeRgbPng(width, height, rgb);
};

const parseColor = (value) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value));
  if (!match) throw new Error(`Invalid colour ${value}`);
  const hex = match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
};

const main = () => {
  const [input, output] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!input || !output) {
    console.error("Usage: node scripts/png-flatten.mjs <input.png> <output.png> [--background '#rrggbb']");
    process.exit(1);
  }
  const backgroundFlag = process.argv.indexOf("--background");
  let image = decodePng(readFileSync(input));
  const background = backgroundFlag > -1 ? parseColor(process.argv[backgroundFlag + 1]) : dominantColor(image);
  if (process.argv.includes("--trim")) {
    image = crop(image, contentBounds(image));
  }
  const flattened = flattenPng(image, background);
  writeFileSync(output, flattened);
  console.log(
    `Flattened ${input} -> ${output} (${image.width}x${image.height}, background rgb(${background.join(", ")}))`
  );
};

if (import.meta.url === `file://${process.argv[1]}`) main();
