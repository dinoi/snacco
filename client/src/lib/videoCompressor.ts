/**
 * Client-side video compression using WebCodecs + Mediabunny.
 *
 * Uses the Mediabunny library (which wraps WebCodecs API) to decode and
 * re-encode video at a lower bitrate. This runs FASTER than real-time
 * because it processes frames as fast as the hardware encoder allows —
 * no dependency on video element playback timing.
 *
 * Falls back to MediaRecorder approach if WebCodecs is not available.
 *
 * Key advantages over MediaRecorder approach:
 * - No iOS Safari throttling (doesn't use video element playback)
 * - Faster than real-time (hardware-accelerated encoding)
 * - Reliable progress reporting (frame count based)
 * - Preserves audio track
 * - Outputs proper MP4 with moov atom at start (fast-start)
 */

import {
  Input,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  Conversion,
  BlobSource,
  ALL_FORMATS,
  canEncode,
} from 'mediabunny';

export interface CompressOptions {
  /** Target video bitrate in bits/sec. Default: 2_500_000 (2.5 Mbps) */
  videoBitrate?: number;
  /** Target audio bitrate in bits/sec. Default: 128_000 (128 kbps) */
  audioBitrate?: number;
  /** Max width (maintains aspect ratio). Default: 1080 */
  maxWidth?: number;
  /** Max height (maintains aspect ratio). Default: 1920 */
  maxHeight?: number;
  /** Output framerate. Default: 30 */
  fps?: number;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
}

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  duration: number;
}

/**
 * Check if WebCodecs-based compression is supported.
 * Requires the WebCodecs API (VideoEncoder/VideoDecoder) which
 * Mediabunny uses internally.
 */
export function isCompressionSupported(): boolean {
  // WebCodecs API check
  if (typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined') {
    return true;
  }
  // Fallback: MediaRecorder
  if (typeof MediaRecorder !== 'undefined') {
    return getPreferredMimeType() !== '';
  }
  return false;
}

/**
 * Check if WebCodecs is available (for choosing primary vs fallback path)
 */
function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

/**
 * Quick check: should we compress this file?
 * Skip compression if file is already small enough.
 */
export function shouldCompress(file: File, thresholdMB = 5): boolean {
  return file.size > thresholdMB * 1024 * 1024;
}

/**
 * Compress a video file. Uses WebCodecs + Mediabunny (primary) or
 * MediaRecorder (fallback).
 */
export async function compressVideo(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  if (hasWebCodecs()) {
    try {
      return await compressWithMediabunny(file, options);
    } catch (err) {
      console.warn('[Compressor] WebCodecs compression failed, trying fallback:', err);
      // Fall through to MediaRecorder fallback
    }
  }

  // Fallback: MediaRecorder approach
  return compressWithMediaRecorder(file, options);
}

// ═══════════════════════════════════════════════════════════════════════
// PRIMARY: WebCodecs + Mediabunny
// ═══════════════════════════════════════════════════════════════════════

async function compressWithMediabunny(
  file: File,
  options: CompressOptions
): Promise<CompressResult> {
  const {
    videoBitrate = 2_500_000,
    audioBitrate = 128_000,
    maxWidth = 1080,
    maxHeight = 1920,
    fps = 30,
    onProgress,
  } = options;

  const originalSize = file.size;
  onProgress?.(0.01);

  console.log('[Compressor] Starting WebCodecs compression via Mediabunny');

  // Check if H.264 encoding is supported (most compatible for mobile)
  const canEncodeAvc = await canEncode('avc');
  if (!canEncodeAvc) {
    throw new Error('H.264 encoding not supported by this browser');
  }

  onProgress?.(0.03);

  // Create input from the file blob
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  // Create output: MP4 with fast-start (moov at beginning)
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });

  onProgress?.(0.05);

  // Calculate target dimensions
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  // We'll let Mediabunny handle aspect ratio if we just set one dimension
  // But we need to cap both dimensions
  targetWidth = maxWidth;
  targetHeight = maxHeight;

  // Initialize conversion with compression settings
  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      bitrate: videoBitrate,
      width: targetWidth,
      height: targetHeight,
      fit: 'contain',
      frameRate: fps,
      hardwareAcceleration: 'prefer-hardware',
      keyFrameInterval: 2, // Key frame every 2 seconds for good seeking
    },
    audio: {
      codec: 'aac',
      bitrate: audioBitrate,
      sampleRate: 44100,
      numberOfChannels: 2,
    },
    showWarnings: false,
  });

  onProgress?.(0.08);

  if (!conversion.isValid) {
    console.warn('[Compressor] Conversion invalid, discarded tracks:', conversion.discardedTracks);
    // Still try to execute — might just be missing audio which is OK
  }

  // Set up progress tracking
  conversion.onProgress = (progress: number) => {
    // Map Mediabunny's 0-1 progress to our 0.08 - 0.98 range
    const mapped = 0.08 + progress * 0.90;
    onProgress?.(Math.min(mapped, 0.98));
  };

  console.log('[Compressor] Executing conversion...');

  // Execute the conversion
  await conversion.execute();

  onProgress?.(0.99);

  // Get the result
  const buffer = target.buffer;
  if (!buffer) {
    throw new Error('Compression produced no output');
  }

  const blob = new Blob([buffer], { type: 'video/mp4' });
  const compressedSize = blob.size;

  // Get duration from input metadata
  let duration = 0;
  try {
    const durationMeta = await input.getDurationFromMetadata();
    duration = durationMeta ?? 0;
  } catch {
    // Duration not critical for the result
  }

  onProgress?.(1);

  console.log('[Compressor] WebCodecs compression complete:', {
    originalSize,
    compressedSize,
    ratio: (originalSize / compressedSize).toFixed(1),
    duration,
  });

  return {
    blob,
    originalSize,
    compressedSize,
    compressionRatio: originalSize / compressedSize,
    duration,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// FALLBACK: MediaRecorder (for browsers without WebCodecs)
// ═══════════════════════════════════════════════════════════════════════

async function compressWithMediaRecorder(
  file: File,
  options: CompressOptions
): Promise<CompressResult> {
  const {
    videoBitrate = 2_500_000,
    audioBitrate = 128_000,
    maxWidth = 1080,
    maxHeight = 1920,
    fps = 24,
    onProgress,
  } = options;

  const originalSize = file.size;
  onProgress?.(0.01);

  console.log('[Compressor] Using MediaRecorder fallback');

  // Create a video element to decode the source
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Keep video visible (but tiny) — iOS Safari throttles hidden elements
  video.style.position = 'fixed';
  video.style.bottom = '0';
  video.style.left = '0';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0.01';
  video.style.zIndex = '-1';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for video metadata
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (video.readyState >= 1) resolve();
      else reject(new Error('Timeout loading video'));
    }, 30000);
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(); } };
    video.oncanplay = done;
    video.oncanplaythrough = done;
    video.onloadeddata = () => { if (video.readyState >= 2) done(); };
    video.onloadedmetadata = () => { onProgress?.(0.02); setTimeout(done, 500); };
    video.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load video')); };
    video.load();
  });

  onProgress?.(0.03);
  const duration = video.duration;
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;

  if (!duration || !isFinite(duration) || duration <= 0) {
    throw new Error('Could not determine video duration');
  }

  // Calculate output dimensions
  let outWidth = srcWidth;
  let outHeight = srcHeight;
  if (outWidth > maxWidth) {
    outHeight = Math.round(outHeight * (maxWidth / outWidth));
    outWidth = maxWidth;
  }
  if (outHeight > maxHeight) {
    outWidth = Math.round(outWidth * (maxHeight / outHeight));
    outHeight = maxHeight;
  }
  outWidth = Math.round(outWidth / 2) * 2;
  outHeight = Math.round(outHeight / 2) * 2;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d')!;

  const canvasStream = canvas.captureStream(fps);

  // Start playback
  video.muted = true;
  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    throw new Error('Browser blocked video playback — cannot compress');
  }

  // Verify playback
  await new Promise<void>((resolve, reject) => {
    const checkTimeout = setTimeout(() => {
      if (video.currentTime < 0.05) reject(new Error('Video playback stuck'));
      else resolve();
    }, 3000);
    const onTime = () => {
      if (video.currentTime > 0.02) {
        clearTimeout(checkTimeout);
        video.removeEventListener('timeupdate', onTime);
        resolve();
      }
    };
    video.addEventListener('timeupdate', onTime);
  });

  onProgress?.(0.04);
  video.muted = false;
  video.volume = 0;

  // Capture audio
  let audioTracks: MediaStreamTrack[] = [];
  try {
    const videoStream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
    if (videoStream) {
      audioTracks = videoStream.getAudioTracks();
    }
  } catch (e) {
    console.warn('[Compressor] Audio capture failed:', e);
  }

  // Combine streams
  const combinedStream = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) combinedStream.addTrack(track);
  for (const track of audioTracks) combinedStream.addTrack(track);

  const mimeType = getPreferredMimeType();
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  // Frame draw loop
  let animationRunning = true;
  const supportsRVFC = 'requestVideoFrameCallback' in video;

  function drawFrame() {
    if (!animationRunning) return;
    ctx.drawImage(video, 0, 0, outWidth, outHeight);
    if (supportsRVFC) {
      (video as any).requestVideoFrameCallback(drawFrame);
    } else {
      requestAnimationFrame(drawFrame);
    }
  }

  recorder.start(1000);
  if (supportsRVFC) {
    (video as any).requestVideoFrameCallback(drawFrame);
  } else {
    requestAnimationFrame(drawFrame);
  }

  onProgress?.(0.05);

  // Progress reporting
  const progressInterval = setInterval(() => {
    if (onProgress && duration > 0) {
      const mapped = 0.05 + (video.currentTime / duration) * 0.90;
      onProgress(Math.min(mapped, 0.95));
    }
  }, 500);

  // Wait for video to finish
  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    video.onended = finish;
    video.onpause = () => { if (video.currentTime >= duration - 0.3) finish(); };
    const pollInterval = setInterval(() => {
      if (video.currentTime >= duration - 0.1 || video.ended) {
        clearInterval(pollInterval);
        finish();
      }
    }, 500);
    setTimeout(() => { clearInterval(pollInterval); finish(); }, (duration + 10) * 1000);
  });

  // Cleanup
  animationRunning = false;
  clearInterval(progressInterval);
  ctx.drawImage(video, 0, 0, outWidth, outHeight);
  await new Promise(r => setTimeout(r, 200));
  recorder.stop();
  const blob = await recordingDone;

  onProgress?.(1);
  URL.revokeObjectURL(videoUrl);
  video.pause();
  video.remove();

  const compressedSize = blob.size;
  return {
    blob,
    originalSize,
    compressedSize,
    compressionRatio: originalSize / compressedSize,
    duration,
  };
}

/**
 * Get the best supported MIME type for MediaRecorder fallback
 */
function getPreferredMimeType(): string {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}
