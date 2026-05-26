import { useEffect } from 'react';

interface BuildInfo {
  color: string;
  colorName: string;
  timestamp: string;
}

export function useBuildColor() {
  useEffect(() => {
    async function loadBuildColor() {
      try {
        const response = await fetch('/__manus__/build-color.json');
        if (!response.ok) {
          console.warn('[Build Color] Failed to load build color');
          return;
        }

        const buildInfo: BuildInfo = await response.json();
        
        // Apply color to logo/root element
        const root = document.documentElement;
        root.style.setProperty('--build-color', buildInfo.color);
        
        // Store in localStorage for comparison on next load
        const lastColor = localStorage.getItem('lastBuildColor');
        if (lastColor && lastColor !== buildInfo.color) {
          console.log(`[Build Color] New build detected! Color changed from ${lastColor} to ${buildInfo.color}`);
        }
        localStorage.setItem('lastBuildColor', buildInfo.color);
        localStorage.setItem('lastBuildTimestamp', buildInfo.timestamp);
        
        console.log(`[Build Color] Applied: ${buildInfo.colorName} (${buildInfo.color})`);
      } catch (error) {
        console.warn('[Build Color] Error loading build color:', error);
      }
    }

    loadBuildColor();
  }, []);
}
