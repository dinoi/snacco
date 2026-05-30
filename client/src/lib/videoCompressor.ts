/**
 * Client-side video compression using Canvas + MediaRecorder.
 *
 * Uses REAL-TIME PLAYBACK to capture both video and audio together.
 * The source video plays (muted on-screen, audio routed via Web Audio API),
 * each frame is drawn to a canvas at the target resolution, and the canvas
 * stream + audio destination stream are combined into a single MediaStream
 * that MediaRecorder encodes at the target bitrate.
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
  video.muted = true; // Mute the element itself (we route audio via Web Audio API)
  video.playsInline = true;
  video.preload = "auto";
  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for video to be fully loaded
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout loading video")), 30000);
    video.oncanplaythrough = () => { clearTimeout(timeout); resolve(); };
    video.onloadedmetadata = () => {
      // Fallback: if canplaythrough doesn't fire, proceed after metadata loads
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

  // Get canvas video stream at target fps
  const canvasStream = canvas.captureStream(fps);

  // Set up audio capture via Web Audio API
  // This routes the video's audio through an AudioContext to a MediaStreamDestination
  // so MediaRecorder can capture it without the video element making audible sound.
  let audioCtx: AudioContext | null = null;
  let audioSource: MediaElementAudioSourceNode | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  let hasAudio = false;

  try {
    audioCtx = new AudioContext();
    // Resume AudioContext if suspended (required by autoplay policies on some browsers)
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    audioSource = audioCtx.createMediaElementSource(video);
    audioDest = audioCtx.createMediaStreamDestination();
    audioSource.connect(audioDest);
    // Don't connect to audioCtx.destination — we don't want audible output during compression
    hasAudio = true;
    console.log("[Compressor] Audio capture set up successfully");
  } catch (e) {
    console.warn("[Compressor] Audio capture failed — output will have no sound:", e);
    // Continue with video-only; the mute toggle on playback still works for uncompressed videos
  }

  // Combine canvas video stream + audio stream into one MediaStream
  const combinedStream = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track);
  }
  if (hasAudio && audioDest) {
    for (const track of audioDest.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }
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

  // Promise that resolves when recorder stops
  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
  });

  // Draw loop: continuously draw video frames to canvas at ~fps rate
  let animationRunning = true;
  const drawIntervalMs = 1000 / fps;

  function drawLoop() {
    if (!animationRunning) return;
    ctx.drawImage(video, 0, 0, outWidth, outHeight);
    setTimeout(drawLoop, drawIntervalMs);
  }

  // Start recording
  recorder.start(500); // collect data every 500ms

  // Draw first frame
  ctx.drawImage(video, 0, 0, outWidth, outHeight);

  // Start the draw loop
  drawLoop();

  // Unmute the video element so audio flows through the Web Audio API source node
  // (MediaElementSource requires the element to not be muted for audio to flow)
  video.muted = false;
  video.volume = 0; // Keep silent on speakers — audio goes through AudioContext only

  // Start playback
  video.currentTime = 0;
  await video.play();

  // Progress reporting
  const progressInterval = setInterval(() => {
    if (onProgress && duration > 0) {
      onProgress(Math.min(video.currentTime / duration, 0.99));
    }
  }, 250);

  // Wait for video to finish playing
  await new Promise<void>((resolve) => {
    video.onended = () => resolve();
    video.onpause = () => {
      // Sometimes 'ended' doesn't fire; check if we're near the end
      if (video.currentTime >= duration - 0.1) {
        resolve();
      }
    };
    // Safety timeout: if video doesn't end naturally, stop after duration + 2s
    setTimeout(() => resolve(), (duration + 2) * 1000);
  });

  // Stop everything
  animationRunning = false;
  clearInterval(progressInterval);

  // Draw one last frame
  ctx.drawImage(video, 0, 0, outWidth, outHeight);

  // Small delay to ensure last frame is captured
  await sleep(100);

  // Stop recording and wait for blob
  recorder.stop();
  const blob = await recordingDone;

  // Report 100%
  onProgress?.(1);

  // Cleanup
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
  }
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
