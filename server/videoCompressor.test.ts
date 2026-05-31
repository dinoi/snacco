/**
 * Tests for videoCompressor utility functions.
 * 
 * Note: The actual compression (compressVideo) requires browser APIs
 * (WebCodecs, MediaRecorder, HTMLVideoElement) which are not available
 * in the Node.js test environment. We test the utility functions that
 * can be tested without browser APIs.
 */
import { describe, it, expect, vi } from 'vitest';

// We need to mock browser globals before importing
const mockVideoEncoder = vi.fn();
const mockVideoDecoder = vi.fn();
const mockMediaRecorder = vi.fn();

// Mock WebCodecs
vi.stubGlobal('VideoEncoder', mockVideoEncoder);
vi.stubGlobal('VideoDecoder', mockVideoDecoder);

// Mock MediaRecorder
Object.assign(mockMediaRecorder, {
  isTypeSupported: vi.fn((type: string) => type === 'video/webm;codecs=vp8'),
});
vi.stubGlobal('MediaRecorder', mockMediaRecorder);

import { isCompressionSupported, shouldCompress } from '@/lib/videoCompressor';

describe('videoCompressor', () => {
  describe('shouldCompress', () => {
    it('returns true for files larger than threshold', () => {
      const bigFile = new File(['x'.repeat(10 * 1024 * 1024)], 'big.mp4', { type: 'video/mp4' });
      // File constructor in Node may not reflect actual size, so we mock
      Object.defineProperty(bigFile, 'size', { value: 10 * 1024 * 1024 });
      expect(shouldCompress(bigFile, 5)).toBe(true);
    });

    it('returns false for files smaller than threshold', () => {
      const smallFile = new File(['x'], 'small.mp4', { type: 'video/mp4' });
      Object.defineProperty(smallFile, 'size', { value: 3 * 1024 * 1024 });
      expect(shouldCompress(smallFile, 5)).toBe(false);
    });

    it('returns false for files exactly at threshold', () => {
      const exactFile = new File(['x'], 'exact.mp4', { type: 'video/mp4' });
      Object.defineProperty(exactFile, 'size', { value: 5 * 1024 * 1024 });
      expect(shouldCompress(exactFile, 5)).toBe(false);
    });

    it('uses custom threshold', () => {
      const file = new File(['x'], 'medium.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 8 * 1024 * 1024 });
      expect(shouldCompress(file, 10)).toBe(false);
      expect(shouldCompress(file, 7)).toBe(true);
    });
  });

  describe('isCompressionSupported', () => {
    it('returns true when WebCodecs (VideoEncoder + VideoDecoder) are available', () => {
      expect(isCompressionSupported()).toBe(true);
    });

    it('returns true with MediaRecorder fallback when WebCodecs unavailable', () => {
      // Temporarily remove WebCodecs
      const origEncoder = globalThis.VideoEncoder;
      const origDecoder = globalThis.VideoDecoder;
      // @ts-ignore
      delete globalThis.VideoEncoder;
      // @ts-ignore
      delete globalThis.VideoDecoder;

      // MediaRecorder is still available with supported type
      expect(isCompressionSupported()).toBe(true);

      // Restore
      globalThis.VideoEncoder = origEncoder as any;
      globalThis.VideoDecoder = origDecoder as any;
    });

    it('returns false when neither WebCodecs nor MediaRecorder available', () => {
      const origEncoder = globalThis.VideoEncoder;
      const origDecoder = globalThis.VideoDecoder;
      const origRecorder = globalThis.MediaRecorder;
      // @ts-ignore
      delete globalThis.VideoEncoder;
      // @ts-ignore
      delete globalThis.VideoDecoder;
      // @ts-ignore
      delete globalThis.MediaRecorder;

      expect(isCompressionSupported()).toBe(false);

      // Restore
      globalThis.VideoEncoder = origEncoder as any;
      globalThis.VideoDecoder = origDecoder as any;
      globalThis.MediaRecorder = origRecorder as any;
    });
  });
});
