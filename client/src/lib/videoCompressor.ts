/**
 * Client-side video compression using Canvas + MediaRecorder.
 * 
 * Uses a FRAME-BY-FRAME SEEKING approach instead of real-time playback.
 * This is critical for mobile Safari which throttles/pauses offscreen video playback.
 * 
 * How it works:
 * 1. Seek to each frame position (at target fps intervals)
 * 2. Wait for the seek to complete
 * 3. Draw the frame to canvas
 * 4. Request a frame capture via captureStream
 * 5. After all frames, stop recording and return the blob
 *
 * Frame timing fix: We use captureStream(0) with manual requestFrame() calls.
 * The MediaRecorder timestamps each frame based on when requestFrame() is called.
 * We use a minimal delay (5ms) between frames — just enough for the recorder to
 * process each frame. The output video duration is determined by the total elapsed
 * real-time between start and stop, so we DON'T add artificial delays per frame.
 */

export interface CompressOptions {
  /** Target video bitrate in bits/sec. Default: 4_000_000 (4 Mbps) */
  videoBitrate?: number;
  /** Target audio bitrate in bits/sec. Default: 128_000 (128 kbps) */
  audioBitrate?: number;
  /** Max width (maintains aspect ratio). Default: 1080 */
  maxWidth?: number;
  /** Max height (maintains aspect ratio). Default: 1920 */
  maxHeight?: number;
  /** Output framerate. Default: 24 */
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
 * Compress a video file using the browser's MediaRecorder API.
 * Uses frame-by-frame seeking for reliability on mobile Safari.
 */
export async function compressVideo(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const {
    videoBitrate = 4_000_000,
    audioBitrate = 128_000,
    maxWidth = 1080,
    maxHeight = 1920,
    fps = 24,
    onProgress,
  } = options;

  const originalSize = file.size;

  // Create a video element to decode the source
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for video to be fully loaded (not just metadata)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout loading video")), 30000);
    video.oncanplaythrough = () => { clearTimeout(timeout); resolve(); };
    video.onloadedmetadata = () => {
      // Fallback: if canplaythrough doesn't fire, proceed after metadata
      setTimeout(() => { clearTimeout(timeout); resolve(); }, 2000);
    };
    video.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load video")); };
    video.load();
  });

  const duration = video.duration;
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;

  // Calculate output dimensions (maintain aspect ratio, cap at max)
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
  // Ensure even dimensions (required by many codecs)
  outWidth = Math.round(outWidth / 2) * 2;
  outHeight = Math.round(outHeight / 2) * 2;

  // Create canvas for rendering frames
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d")!;

  // Draw first frame as initial content
  video.currentTime = 0;
  await waitForSeek(video);
  ctx.drawImage(video, 0, 0, outWidth, outHeight);

  // Get canvas stream — use manual frame mode (0 fps = only updates on requestFrame)
  const canvasStream = canvas.captureStream(0);
  const videoTrack = canvasStream.getVideoTracks()[0] as any;

  // Determine best supported MIME type
  const mimeType = getPreferredMimeType();

  // Create MediaRecorder with target bitrate
  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Promise that resolves when recorder stops
  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
  });

  // Start recording
  recorder.start(500); // collect data every 500ms

  // Frame-by-frame processing
  // The key insight: MediaRecorder uses WALL CLOCK TIME to determine frame duration.
  // With captureStream(0) + requestFrame(), each frame's duration in the output is
  // the real-time gap between consecutive requestFrame() calls.
  // 
  // To get correct playback speed, we need each frame to last exactly (1/fps) seconds
  // in the output. So we space requestFrame() calls by exactly (1000/fps) ms of real time.
  // The seek+draw happens as fast as possible, then we wait for the remainder of the frame interval.
  const frameInterval = 1 / fps;
  const frameIntervalMs = 1000 / fps; // ~41.67ms for 24fps
  const totalFrames = Math.ceil(duration * fps);
  let processedFrames = 0;

  for (let frameTime = 0; frameTime < duration; frameTime += frameInterval) {
    const frameStartTime = performance.now();

    // Seek to the frame position
    video.currentTime = Math.min(frameTime, duration - 0.01);
    await waitForSeek(video);

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0, outWidth, outHeight);

    // Request a frame capture from the canvas stream
    if (videoTrack && typeof videoTrack.requestFrame === "function") {
      videoTrack.requestFrame();
    }

    // Wait for the remainder of the frame interval to maintain correct playback speed.
    // If seek+draw took longer than one frame interval, don't wait (just continue).
    const elapsed = performance.now() - frameStartTime;
    const remainingMs = frameIntervalMs - elapsed;
    if (remainingMs > 1) {
      await sleep(remainingMs);
    }

    // Report progress
    processedFrames++;
    if (onProgress) {
      onProgress(Math.min(processedFrames / totalFrames, 0.99));
    }
  }

  // Draw and capture the very last frame
  video.currentTime = duration - 0.01;
  await waitForSeek(video);
  ctx.drawImage(video, 0, 0, outWidth, outHeight);
  if (videoTrack && typeof videoTrack.requestFrame === "function") {
    videoTrack.requestFrame();
  }
  await sleep(frameIntervalMs); // One more frame interval for the last frame

  // Stop recording and wait for blob
  recorder.stop();
  const blob = await recordingDone;

  // Report 100%
  onProgress?.(1);

  // Cleanup
  URL.revokeObjectURL(videoUrl);
  video.remove();
  canvas.remove();

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
 * Wait for a video seek operation to complete
 */
function waitForSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (!video.seeking) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    // Safety timeout: if seek doesn't complete in 2s, continue anyway
    setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 2000);
  });
}

/**
 * Simple sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the browser supports video compression via MediaRecorder
 */
export function isCompressionSupported(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  return getPreferredMimeType() !== "";
}

/**
 * Get the best supported MIME type for recording
 */
function getPreferredMimeType(): string {
  const types = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Quick check: should we compress this file?
 * Skip compression if file is already small enough.
 */
export function shouldCompress(file: File, thresholdMB = 5): boolean {
  return file.size > thresholdMB * 1024 * 1024;
}
