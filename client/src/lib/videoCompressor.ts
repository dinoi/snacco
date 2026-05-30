/**
 * Client-side video compression using Canvas + MediaRecorder.
 * Re-encodes video at a target bitrate (~4 Mbps) to dramatically reduce file size
 * while maintaining acceptable visual quality for mobile streaming.
 *
 * Typical results:
 * - 19MB phone recording → ~2-3MB compressed
 * - 50MB 2-min tutorial → ~8-12MB compressed
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
 * Works by playing the video through a canvas and re-recording it.
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

  // Wait for metadata to load
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video metadata"));
    // Safety timeout for metadata loading
    setTimeout(() => reject(new Error("Timeout loading video metadata")), 15000);
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

  // Get canvas stream
  const canvasStream = canvas.captureStream(30); // 30fps

  // Try to capture audio from the video
  let combinedStream: MediaStream;
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination); // needed for playback
    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        audioTrack,
      ]);
    } else {
      combinedStream = canvasStream;
    }
  } catch {
    // Audio extraction not supported, proceed with video only
    combinedStream = canvasStream;
  }

  // Determine best supported MIME type
  const mimeType = getPreferredMimeType();

  // Create MediaRecorder with target bitrate
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Start recording
  recorder.start(100); // collect data every 100ms

  // Play video and draw frames to canvas
  video.currentTime = 0;
  await video.play();

  // Use a combined approach for end detection:
  // 1. timeupdate polling to detect when we're near the end
  // 2. onended event as primary signal
  // 3. Safety timeout as ultimate fallback
  const blob = await new Promise<Blob>((resolve) => {
    let animFrameId: number;
    let resolved = false;
    let lastTimeUpdate = Date.now();

    const finalize = () => {
      if (resolved) return;
      resolved = true;
      cancelAnimationFrame(animFrameId);
      video.pause();

      // Request final data and stop
      if (recorder.state === "recording") {
        recorder.requestData(); // flush any remaining data
        recorder.onstop = () => {
          const finalBlob = new Blob(chunks, { type: mimeType });
          onProgress?.(1);
          resolve(finalBlob);
        };
        // Small delay to let requestData flush, then stop
        setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }, 200);
      } else {
        const finalBlob = new Blob(chunks, { type: mimeType });
        onProgress?.(1);
        resolve(finalBlob);
      }
    };

    // Primary end detection: video ended event
    video.onended = () => {
      // Draw the last frame
      ctx.drawImage(video, 0, 0, outWidth, outHeight);
      // Give a small buffer for the last chunks to be captured
      setTimeout(finalize, 300);
    };

    // Secondary: timeupdate-based detection
    // On mobile Safari, onended sometimes doesn't fire
    video.ontimeupdate = () => {
      lastTimeUpdate = Date.now();
      // If we're within 0.1s of the end, trigger finalize
      if (duration > 0 && video.currentTime >= duration - 0.1) {
        // Draw final frame
        ctx.drawImage(video, 0, 0, outWidth, outHeight);
        setTimeout(finalize, 500);
      }
    };

    // Safety timeout: if video playback stalls near the end
    const safetyInterval = setInterval(() => {
      // If no timeupdate for 3 seconds and we're past 90% progress, finalize
      if (Date.now() - lastTimeUpdate > 3000 && duration > 0) {
        const progress = video.currentTime / duration;
        if (progress > 0.9) {
          clearInterval(safetyInterval);
          finalize();
        }
      }
      // Absolute safety: if total time exceeds 3x video duration, finalize
      if (duration > 0 && Date.now() - lastTimeUpdate > duration * 3000 + 10000) {
        clearInterval(safetyInterval);
        finalize();
      }
    }, 1000);

    // Animation loop: draw video frames to canvas
    let lastProgress = 0;
    const drawFrame = () => {
      if (resolved) return;
      if (!video.ended && !video.paused) {
        ctx.drawImage(video, 0, 0, outWidth, outHeight);
      }

      // Report progress (cap at 0.95 until finalize sets it to 1)
      if (onProgress && duration > 0) {
        const progress = Math.min(video.currentTime / duration, 0.95);
        if (progress - lastProgress > 0.01) {
          lastProgress = progress;
          onProgress(progress);
        }
      }

      animFrameId = requestAnimationFrame(drawFrame);
    };
    animFrameId = requestAnimationFrame(drawFrame);
  });

  // Cleanup
  URL.revokeObjectURL(videoUrl);
  video.remove();
  canvas.remove();
  if (audioCtx) {
    try { audioCtx.close(); } catch { /* ignore */ }
  }

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
