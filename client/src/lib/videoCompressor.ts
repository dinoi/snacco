/**
 * Client-side video compression using Canvas + MediaRecorder.
 *
 * Uses REAL-TIME PLAYBACK to capture both video and audio together.
 * The source video plays muted, each frame is drawn to a canvas at the
 * target resolution, and the canvas stream is recorded by MediaRecorder.
 *
 * Audio is captured via Web Audio API (MediaElementAudioSourceNode) when
 * the browser supports it. On browsers where this blocks playback (iOS Safari),
 * audio setup is skipped and the output is video-only.
 *
 * Compression time ≈ video duration (real-time).
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
 * Real-time playback approach — captures both video and audio.
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
  // Prevent the video from being visible
  video.style.position = "fixed";
  video.style.top = "-9999px";
  video.style.left = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  document.body.appendChild(video);

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for video metadata + enough data to start playback
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (video.readyState >= 1) {
        console.log("[Compressor] Timeout but have metadata, proceeding");
        resolve();
      } else {
        reject(new Error("Timeout loading video"));
      }
    }, 30000);
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; clearTimeout(timeout); resolve(); } };
    video.oncanplay = done;
    video.oncanplaythrough = done;
    video.onloadeddata = () => { if (video.readyState >= 2) done(); };
    video.onloadedmetadata = () => { setTimeout(done, 500); };
    video.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load video")); };
    video.load();
  });

  const duration = video.duration;
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;
  console.log("[Compressor] Video loaded:", { duration, srcWidth, srcHeight, readyState: video.readyState });

  if (!duration || !isFinite(duration) || duration <= 0) {
    throw new Error("Could not determine video duration");
  }

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

  // Get canvas video stream at target fps
  const canvasStream = canvas.captureStream(fps);

  // ── STEP 1: Start video playback FIRST (before audio setup) ──────
  // This ensures playback works on all browsers. Audio setup happens after.
  video.muted = true;
  video.currentTime = 0;

  try {
    await video.play();
  } catch (playErr) {
    console.error("[Compressor] play() failed:", playErr);
    throw new Error("Browser blocked video playback — cannot compress");
  }

  // Verify playback is actually progressing
  await new Promise<void>((resolve, reject) => {
    const checkTimeout = setTimeout(() => {
      if (video.currentTime < 0.05) {
        reject(new Error("Video playback stuck — browser may be blocking it"));
      } else {
        resolve();
      }
    }, 3000);
    const onTime = () => {
      if (video.currentTime > 0.02) {
        clearTimeout(checkTimeout);
        video.removeEventListener("timeupdate", onTime);
        resolve();
      }
    };
    video.addEventListener("timeupdate", onTime);
  });
  console.log("[Compressor] Playback confirmed, currentTime:", video.currentTime);

  // ── STEP 2: Try to set up audio capture (non-blocking) ───────────
  // On iOS Safari, createMediaElementSource can break playback,
  // so we only attempt it on browsers where it's known to work.
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  let hasAudio = false;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) {
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const audioSource = audioCtx.createMediaElementSource(video);
      audioDest = audioCtx.createMediaStreamDestination();
      audioSource.connect(audioDest);
      hasAudio = true;
      console.log("[Compressor] Audio capture active");
    } catch (e) {
      console.warn("[Compressor] Audio capture failed, video-only output:", e);
      if (audioCtx) { try { audioCtx.close(); } catch {} }
      audioCtx = null;
    }
  } else {
    console.log("[Compressor] iOS detected, skipping audio capture");
  }

  // ── STEP 3: Combine streams and start recording ──────────────────
  const combinedStream = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track);
  }
  if (hasAudio && audioDest) {
    for (const track of audioDest.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }
  }

  const mimeType = getPreferredMimeType();
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  // Draw loop: continuously draw video frames to canvas
  let animationRunning = true;
  const drawIntervalMs = 1000 / fps;

  function drawLoop() {
    if (!animationRunning) return;
    ctx.drawImage(video, 0, 0, outWidth, outHeight);
    setTimeout(drawLoop, drawIntervalMs);
  }

  // Start recording + draw loop
  recorder.start(500);
  drawLoop();

  // Progress reporting
  const progressInterval = setInterval(() => {
    if (onProgress && duration > 0) {
      const progress = Math.min(video.currentTime / duration, 0.99);
      onProgress(progress);
    }
  }, 250);

  // Wait for video to finish playing
  await new Promise<void>((resolve) => {
    video.onended = () => resolve();
    video.onpause = () => {
      if (video.currentTime >= duration - 0.1) resolve();
    };
    // Safety timeout
    setTimeout(() => resolve(), (duration + 3) * 1000);
  });

  // Stop everything
  animationRunning = false;
  clearInterval(progressInterval);

  // Draw one last frame
  ctx.drawImage(video, 0, 0, outWidth, outHeight);
  await sleep(100);

  // Stop recording and wait for blob
  recorder.stop();
  const blob = await recordingDone;

  // Report 100%
  onProgress?.(1);

  // Cleanup
  if (audioCtx) { try { audioCtx.close(); } catch {} }
  URL.revokeObjectURL(videoUrl);
  video.pause();
  video.remove();
  canvas.remove();

  const compressedSize = blob.size;
  console.log("[Compressor] Done:", { originalSize, compressedSize, ratio: (originalSize / compressedSize).toFixed(1) });

  return {
    blob,
    originalSize,
    compressedSize,
    compressionRatio: originalSize / compressedSize,
    duration,
  };
}

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
