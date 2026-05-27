#!/usr/bin/env node

/**
 * Generate build metadata (version, color, timestamp)
 * This allows the frontend to detect new builds and display version info
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const colors = ['#FF0000', '#FFFF00', '#00AA00', '#0000FF']; // Red, Yellow, Green, Blue
const randomColor = colors[Math.floor(Math.random() * colors.length)];
const buildTimestamp = new Date().toISOString();

// Extract version from git tag or commit message
let version = 'v1.31';
try {
  const lastCommitMessage = execSync('git log -1 --pretty=%B', { cwd: path.join(__dirname, '..'), encoding: 'utf-8' }).trim();
  const versionMatch = lastCommitMessage.match(/v(\d+\.\d+(?:\.\d+)?)/);
  if (versionMatch) {
    version = `v${versionMatch[1]}`;
  }
} catch (error) {
  console.warn('Could not extract version from git, using default v1.26');
}

const buildInfo = {
  version,
  color: randomColor,
  timestamp: buildTimestamp,
  colorName: {
    '#FF0000': 'red',
    '#FFFF00': 'yellow',
    '#00AA00': 'green',
    '#0000FF': 'blue'
  }[randomColor]
};

const outputDir = path.join(__dirname, '..', 'client', 'public', '__manus__');
const outputPath = path.join(outputDir, 'build-info.json');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
console.log(`✓ Build metadata generated:`);
console.log(`  Version: ${buildInfo.version}`);
console.log(`  Color: ${buildInfo.colorName} (${randomColor})`);
console.log(`  Timestamp: ${buildTimestamp}`);
