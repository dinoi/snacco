#!/usr/bin/env node

/**
 * Wait for Deployment Script
 * 
 * Polls the build-info.json endpoint until the expected version is deployed.
 * This is more reliable than HTML parsing.
 * 
 * Usage: node scripts/wait-for-deployment.mjs [expected-version]
 * Example: node scripts/wait-for-deployment.mjs "v1.24"
 */

import https from 'https';

const RAILWAY_URL = 'https://snacco.manus.space';
const BUILD_INFO_URL = `${RAILWAY_URL}/__manus__/build-info.json`;
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLLS = 120; // 6 minutes max

function fetchBuildInfo(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const buildInfo = JSON.parse(data);
            resolve(buildInfo);
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function waitForDeployment() {
  const expectedVersion = process.argv[2] || 'v1.24';
  let pollCount = 0;
  let lastVersion = null;

  console.log(`🚀 Waiting for deployment of version: ${expectedVersion}`);
  console.log(`📍 Checking: ${BUILD_INFO_URL}`);
  console.log(`⏱️  Polling every ${POLL_INTERVAL / 1000}s (max ${MAX_POLLS} attempts)\n`);

  while (pollCount < MAX_POLLS) {
    try {
      const buildInfo = await fetchBuildInfo(BUILD_INFO_URL);
      const timestamp = new Date().toLocaleTimeString();
      const currentVersion = buildInfo.version;

      if (currentVersion !== lastVersion) {
        console.log(`[${timestamp}] Current version: ${currentVersion} (${buildInfo.colorName})`);
        lastVersion = currentVersion;
      }

      if (currentVersion === expectedVersion) {
        console.log(`\n✅ SUCCESS! Version ${expectedVersion} is now LIVE!`);
        console.log(`🎉 Build deployed after ${(pollCount * POLL_INTERVAL) / 1000}s`);
        console.log(`📦 Build color: ${buildInfo.colorName} (${buildInfo.color})`);
        console.log(`⏰ Timestamp: ${buildInfo.timestamp}`);
        process.exit(0);
      }

      pollCount++;
      if (pollCount < MAX_POLLS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Error: ${error.message}`);
      pollCount++;
      if (pollCount < MAX_POLLS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    }
  }

  console.log(`\n⚠️  Timeout! Version ${expectedVersion} did not deploy within 6 minutes.`);
  console.log('Possible causes:');
  console.log('  1. Build is still running on Railway');
  console.log('  2. Build failed (check Railway dashboard)');
  console.log('  3. Network connectivity issue');
  process.exit(1);
}

waitForDeployment();
