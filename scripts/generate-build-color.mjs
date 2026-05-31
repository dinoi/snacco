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
const colors = ['#FF6B6B', '#FFDA6B', '#6BFFB8', '#6BB8FF']; // Light Red, Light Yellow, Light Mint, Light Blue
const randomColor = colors[Math.floor(Math.random() * colors.length)];
const buildTimestamp = new Date().toISOString();

// Extract version from git tag or commit message
let version = 'v1.59'; // Mobile video playback fix
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
    '#FF6B6B': 'coral',
    '#FFDA6B': 'gold',
    '#6BFFB8': 'mint',
    '#6BB8FF': 'sky'
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
