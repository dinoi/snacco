#!/usr/bin/env node

/**
 * Generate a random build color and save it to a JSON file
 * This allows the frontend to detect new builds by color changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const colors = ['#FF0000', '#FFFF00', '#00AA00', '#0000FF']; // Red, Yellow, Green, Blue
const randomColor = colors[Math.floor(Math.random() * colors.length)];
const buildTimestamp = new Date().toISOString();

const buildInfo = {
  color: randomColor,
  timestamp: buildTimestamp,
  colorName: {
    '#FF0000': 'red',
    '#FFFF00': 'yellow',
    '#00AA00': 'green',
    '#0000FF': 'blue'
  }[randomColor]
};

const outputPath = path.join(__dirname, '..', 'client', 'public', '__manus__', 'build-color.json');

// Ensure directory exists
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
console.log(`✓ Build color generated: ${buildInfo.colorName} (${randomColor}) at ${buildTimestamp}`);
