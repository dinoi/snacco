#!/usr/bin/env node

/**
 * Bump version script - increments version number and updates build script
 * Usage: node scripts/bump-version.mjs
 * 
 * This script:
 * 1. Reads current version from generate-build-color.mjs
 * 2. Increments the minor version (v1.25 -> v1.26)
 * 3. Updates the default version in the build script
 * 4. Outputs the new version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildScriptPath = path.join(__dirname, 'generate-build-color.mjs');

// Read current version
const buildScript = fs.readFileSync(buildScriptPath, 'utf-8');
const versionMatch = buildScript.match(/let version = '(v\d+\.\d+)'/);
const currentVersion = versionMatch ? versionMatch[1] : 'v1.25';

// Parse and increment version
const [major, minor] = currentVersion.slice(1).split('.').map(Number);
const newVersion = `v${major}.${minor + 1}`;

// Update build script
const updatedScript = buildScript
  .replace(/let version = 'v\d+\.\d+'/g, `let version = '${newVersion}'`)
  .replace(/using default v\d+\.\d+/g, `using default ${newVersion}`);

fs.writeFileSync(buildScriptPath, updatedScript);

console.log(`✓ Version bumped: ${currentVersion} → ${newVersion}`);
console.log(`  Updated: ${buildScriptPath}`);
