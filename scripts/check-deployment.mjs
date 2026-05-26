#!/usr/bin/env node

/**
 * Deployment Status Checker
 * 
 * This script:
 * 1. Fetches the current version from the live Railway app
 * 2. Compares it with the expected version
 * 3. Polls until the new version is deployed
 * 
 * Usage: node scripts/check-deployment.mjs [expected-version]
 * Example: node scripts/check-deployment.mjs "v1.24"
 */

import https from 'https';

const RAILWAY_URL = 'https://snacco.manus.space';
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLLS = 120; // 10 minutes max

function fetchVersion(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            // Extract version from HTML - look for the version in the page
            const versionMatch = data.match(/v(\d+\.\d+(?:\.\d+)?)/);
            const version = versionMatch ? versionMatch[0] : 'unknown';
            resolve(version);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function checkDeployment() {
  const expectedVersion = process.argv[2] || 'v1.24';
  let pollCount = 0;

  console.log(`🚀 Monitoring deployment for version: ${expectedVersion}`);
  console.log(`📍 URL: ${RAILWAY_URL}`);
  console.log(`⏱️  Polling every ${POLL_INTERVAL / 1000}s (max ${MAX_POLLS} attempts)\n`);

  while (pollCount < MAX_POLLS) {
    try {
      const currentVersion = await fetchVersion(RAILWAY_URL);
      const timestamp = new Date().toLocaleTimeString();

      console.log(`[${timestamp}] Current version: ${currentVersion}`);

      if (currentVersion === expectedVersion) {
        console.log(`\n✅ SUCCESS! Version ${expectedVersion} is now LIVE!`);
        console.log(`🎉 Deployment completed after ${pollCount * (POLL_INTERVAL / 1000)}s`);
        process.exit(0);
      }

      pollCount++;
      if (pollCount < MAX_POLLS) {
        console.log(`   Waiting... (attempt ${pollCount}/${MAX_POLLS})`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    } catch (error) {
      console.error(`❌ Error fetching version: ${error.message}`);
      pollCount++;
      if (pollCount < MAX_POLLS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    }
  }

  console.log(`\n⚠️  Timeout! Version ${expectedVersion} did not deploy within 10 minutes.`);
  console.log('Check Railway dashboard for build errors.');
  process.exit(1);
}

checkDeployment();
