#!/usr/bin/env node
/**
 * Builds the iOS launch screen images from the app icon.
 *
 * Capacitor ships the Capacitor logo as the default splash, which is the first
 * thing a reviewer sees. This script replaces it with the app icon centred on
 * the app background, in a light and a dark variant, at the three scales the
 * asset catalogue expects.
 *
 * Usage: node scripts/ios-splash.mjs <icon.png> <splash.imageset directory>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentBounds, crop, decodePng, encodeRgbPng } from "./png-flatten.mjs";

const LIGHT_BACKGROUND = [245, 246, 248];
const DARK_BACKGROUND = [11, 13, 19];
const ICON_RATIO = 0.28;

const resample = ({ width, height, pixels }, targetWidth, targetHeight) => {
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sourceX - x0;
      const target = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const p00 = pixels[(y0 * width + x0) * 4 + channel];
        const p10 = pixels[(y0 * width + x1) * 4 + channel];
        const p01 = pixels[(y1 * width + x0) * 4 + channel];
        const p11 = pixels[(y1 * width + x1) * 4 + channel];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[target + channel] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: out };
};

const render = (icon, size, background) => {
  const canvas = Buffer.alloc(size * size * 3);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    canvas[pixel * 3] = background[0];
    canvas[pixel * 3 + 1] = background[1];
    canvas[pixel * 3 + 2] = background[2];
  }

  const iconSize = Math.round(size * ICON_RATIO);
  const scaled = resample(icon, iconSize, iconSize);
  const offset = Math.round((size - iconSize) / 2);

  for (let y = 0; y < iconSize; y += 1) {
    for (let x = 0; x < iconSize; x += 1) {
      const source = (y * iconSize + x) * 4;
      const alpha = scaled.pixels[source + 3] / 255;
      if (alpha === 0) continue;
      const target = ((y + offset) * size + (x + offset)) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        canvas[target + channel] = Math.round(
          scaled.pixels[source + channel] * alpha + canvas[target + channel] * (1 - alpha)
        );
      }
    }
  }

  return encodeRgbPng(size, size, canvas);
};

const main = () => {
  const [iconPath, directory] = process.argv.slice(2);
  if (!iconPath || !directory) {
    console.error("Usage: node scripts/ios-splash.mjs <icon.png> <splash.imageset directory>");
    process.exit(1);
  }

  const source = decodePng(readFileSync(iconPath));
  const icon = crop(source, contentBounds(source));

  const scales = [
    { suffix: "", size: 2732 },
    { suffix: "-1", size: 1821 },
    { suffix: "-2", size: 911 },
  ];

  for (const { suffix, size } of scales) {
    writeFileSync(join(directory, `splash-2732x2732${suffix}.png`), render(icon, size, LIGHT_BACKGROUND));
    writeFileSync(join(directory, `splash-dark-2732x2732${suffix}.png`), render(icon, size, DARK_BACKGROUND));
  }

  writeFileSync(
    join(directory, "Contents.json"),
    `${JSON.stringify(
      {
        images: [
          { idiom: "universal", filename: "splash-2732x2732-2.png", scale: "1x" },
          { idiom: "universal", filename: "splash-2732x2732-1.png", scale: "2x" },
          { idiom: "universal", filename: "splash-2732x2732.png", scale: "3x" },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            idiom: "universal",
            filename: "splash-dark-2732x2732-2.png",
            scale: "1x",
          },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            idiom: "universal",
            filename: "splash-dark-2732x2732-1.png",
            scale: "2x",
          },
          {
            appearances: [{ appearance: "luminosity", value: "dark" }],
            idiom: "universal",
            filename: "splash-dark-2732x2732.png",
            scale: "3x",
          },
        ],
        info: { author: "xcode", version: 1 },
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote light and dark launch images to ${directory}`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
