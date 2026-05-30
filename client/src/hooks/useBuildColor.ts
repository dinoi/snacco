import { useEffect, useState } from 'react';

interface BuildInfo {
  version: string;
  color: string;
  colorName: string;
  timestamp: string;
}

const defaultBuildInfo: BuildInfo = {
  version: 'v1.55',
  color: '#6BB8FF',
  colorName: 'sky',
  timestamp: new Date().toISOString()
};

export function useBuildColor() {
  const [buildInfo, setBuildInfo] = useState<BuildInfo>(defaultBuildInfo);

  useEffect(() => {
    async function loadBuildInfo() {
      try {
        const response = await fetch('/__manus__/build-info.json');
        if (!response.ok) {
          console.warn('[Build Info] Failed to load build info');
          return;
        }

        const info: BuildInfo = await response.json();
        setBuildInfo(info);
        
        // Apply color to logo/root element
        const root = document.documentElement;
        root.style.setProperty('--build-color', info.color);
        
        // Store in localStorage for comparison on next load
        const lastColor = localStorage.getItem('lastBuildColor');
        if (lastColor && lastColor !== info.color) {
          console.log(`[Build Info] New build detected! ${lastColor} → ${info.color}`);
        }
        localStorage.setItem('lastBuildColor', info.color);
        localStorage.setItem('lastBuildVersion', info.version);
        localStorage.setItem('lastBuildTimestamp', info.timestamp);
        
        console.log(`[Build Info] Loaded: ${info.version} (${info.colorName})`);
      } catch (error) {
        console.warn('[Build Info] Error loading build info:', error);
      }
    }

    loadBuildInfo();
  }, []);

  return buildInfo;
}
