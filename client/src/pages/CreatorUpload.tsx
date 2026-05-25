import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatTime } from "@/lib/utils";
import {
  CheckCircle,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const DEMO_MAX_SECONDS = 30;
const TUTORIAL_MAX_SECONDS = 300;

const CATEGORIES = [
  "Dance", "Fitness", "Yoga", "Martial Arts", "Music",
  "Art & Drawing", "Cooking", "Language", "DIY & Crafts", "Other",
];

type ChapterDraft = { id: string; time: number; label: string };
type UploadedVideo = { url: string; key: string; localUrl: string; duration: number; fileName: string };
type Step = "meta" | "demo" | "tutorial" | "chapters" | "preview" | "done";

// ── Get video duration from a File ───────────────────────────────────
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read video")); };
    video.src = url;
  });
}

// ── Generate a thumbnail data-URL from a video File ──────────────────
function generateThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const cleanup = () => URL.revokeObjectURL(url);

    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 568;
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve(dataUrl);
      } catch { cleanup(); resolve(null); }
    };

    video.addEventListener("seeked", capture, { once: true });
    video.addEventListener("error", () => { cleanup(); resolve(null); }, { once: true });
    video.addEventListener("loadeddata", () => { video.currentTime = 0.5; }, { once: true });
    video.addEventListener("canplay", () => { video.currentTime = 0.5; }, { once: true });
    video.src = url;
    video.load();
  });
}

// ── Nano-id style unique ID generator ────────────────────────────────
function nanoid(): string {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}

// ── Read a Blob as base64 string ──────────────────────────────────────
// Uses ArrayBuffer → Uint8Array → btoa for maximum compatibility on
// mobile Safari (FileReader.readAsDataURL is unreliable on large blobs).

export default function CreatorUpload() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [step, setStep] = useState<Step>("meta");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [tokenPrice, setTokenPrice] = useState(1);
  const [demoVideo, setDemoVideo] = useState<UploadedVideo | null>(null);
  const [tutorialVideo, setTutorialVideo] = useState<UploadedVideo | null>(null);
  const [chapters, setChapters] = useState<ChapterDraft[]>([]);
  const [newChapterLabel, setNewChapterLabel] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingType, setUploadingType] = useState<"demo" | "tutorial" | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Player state (chapter marking step)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const tutorialVideoRef = useRef<HTMLVideoElement>(null);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const tutorialInputRef = useRef<HTMLInputElement>(null);


  const publishMutation = trpc.tutorials.publish.useMutation({
    onSuccess: () => {
      utils.tutorials.feed.invalidate();
      utils.tutorials.myTutorials.invalidate();
      setStep("done");
    },
    onError: (err) => toast.error(err.message ?? "Failed to publish."),
  });

  if (!isAuthenticated || !user?.isCreator) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-muted-foreground text-sm">Enable creator mode in your profile first.</p>
        <Button onClick={() => navigate("/profile")} variant="outline">Go to Profile</Button>
      </div>
    );
  }

  // ── Direct multipart upload ──────────────────────────────────────────
  // Uses XMLHttpRequest to POST the file directly to /api/upload-video.
  // Server handles multipart parsing and S3 upload via storagePut.
  const uploadVideoDirect = async (
    file: File,
    type: "demo" | "tutorial",
    onProgress: (pct: number) => void
  ): Promise<{ key: string; url: string }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("type", type);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve({ key: result.key, url: result.url });
          } catch (err) {
            reject(new Error("Invalid server response"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Upload failed"));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload cancelled"));
      });

      xhr.open("POST", "/api/upload-video");
      xhr.send(formData);
    });
  };

  // ── Video file handler ─────────────────────────────────────────────
  const handleVideoSelect = async (file: File, type: "demo" | "tutorial") => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file (MP4 recommended).");
      return;
    }

    let dur: number;
    try {
      dur = await getVideoDuration(file);
    } catch {
      toast.error("Could not read video duration. Please try a different file.");
      return;
    }

    const maxDur = type === "demo" ? DEMO_MAX_SECONDS : TUTORIAL_MAX_SECONDS;
    if (dur > maxDur) {
      const limit = type === "demo" ? "30 seconds" : "5 minutes";
      toast.error(`${type === "demo" ? "Demo clips" : "Tutorial videos"} must be ${limit} or shorter. Your video is ${formatTime(dur)}.`);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setThumbnailDataUrl(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadingType(type);
    setUploadError(null);

    // Generate canvas thumbnail in parallel (iOS-safe)
    generateThumbnail(file).then((dataUrl) => setThumbnailDataUrl(dataUrl));

    try {
      const result = await uploadVideoDirect(file, type, setUploadProgress);
      const uploaded: UploadedVideo = {
        url: result.url,
        key: result.key,
        localUrl,
        duration: dur,
        fileName: file.name,
      };
      if (type === "demo") {
        setDemoVideo(uploaded);
        setTimeout(() => setStep("tutorial"), 400);
      } else {
        setTutorialVideo(uploaded);
        setTimeout(() => setStep("chapters"), 400);
      }
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadingType(null);
    }
  };

  // ── Chapter helpers ────────────────────────────────────────────────
  const addChapterAtCurrentTime = () => {
    const label = newChapterLabel.trim() || `Step ${chapters.length + 1}`;
    setChapters(prev => [...prev, { id: crypto.randomUUID(), time: currentTime, label }].sort((a, b) => a.time - b.time));
    setNewChapterLabel("");
  };

  const deleteChapter = (id: string) => setChapters(prev => prev.filter(c => c.id !== id));

  const moveChapter = (id: string, dir: -1 | 1) => {
    setChapters(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const jumpToChapter = (time: number) => {
    if (tutorialVideoRef.current) {
      tutorialVideoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // ── Publish ────────────────────────────────────────────────────────
  const handlePublish = () => {
    if (!demoVideo || !tutorialVideo) return;
    publishMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      tokenPrice,
      demoVideoUrl: demoVideo.url,
      demoVideoKey: demoVideo.key,
      tutorialVideoUrl: tutorialVideo.url,
      tutorialVideoKey: tutorialVideo.key,
      chapters: chapters.map((c, idx) => ({ label: c.label, timestampSeconds: Math.round(c.time), sortOrder: idx })),
    });
  };

  // ── Step progress bar ──────────────────────────────────────────────
  const STEPS: Step[] = ["meta", "demo", "tutorial", "chapters", "preview"];
  const stepIdx = STEPS.indexOf(step);
  const stepLabels: Record<Step, string> = {
    meta: "Details", demo: "Demo Clip", tutorial: "Full Tutorial",
    chapters: "Chapters", preview: "Preview", done: "Done",
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/profile")} className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
            <ChevronUp size={16} className="text-muted-foreground rotate-[-90deg]" />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground">Upload Tutorial</h1>
            <p className="text-xs text-muted-foreground">
              {stepLabels[step]} · Step {Math.min(stepIdx + 1, STEPS.length)} of {STEPS.length}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
              background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))",
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-5 space-y-4 pb-24">

        {/* ── Step 1: Meta ─────────────────────────────────────────── */}
        {step === "meta" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Title *</label>
              <input
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder="e.g. How to do the Running Man"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Category *</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${category === cat ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground bg-card"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</label>
              <textarea
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                placeholder="What will learners get from this tutorial?"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Token Price</label>
              <div className="flex gap-2">
                {[1, 2, 3, 5, 10].map(p => (
                  <button
                    key={p}
                    onClick={() => setTokenPrice(p)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tokenPrice === p ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground bg-card"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Tokens required to unlock this tutorial</p>
            </div>
            <Button
              className="w-full font-bold"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              disabled={!title.trim() || !category}
              onClick={() => setStep("demo")}
            >
              Next: Upload Demo Clip
            </Button>
          </div>
        )}

        {/* ── Step 2: Demo video ────────────────────────────────────── */}
        {step === "demo" && (
          <div className="space-y-4">
            <input ref={demoInputRef} type="file" accept="video/mp4,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoSelect(f, "demo"); e.target.value = ""; }} />

            {!demoVideo && !uploading && (
              <button
                onClick={() => { setUploadError(null); demoInputRef.current?.click(); }}
                className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col bg-card hover:border-primary/50 transition-colors px-6 pt-10 pb-8"
                style={{ minHeight: '60vh' }}
              >
                <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                  <Upload size={32} className="text-muted-foreground" />
                  <span className="text-sm text-foreground font-semibold">Tap to select demo clip</span>
                  <span className="text-xs text-muted-foreground">MP4 · Max 30 seconds</span>
                </div>
                <p className="text-sm font-semibold text-center leading-snug" style={{ color: 'oklch(0.65 0.30 340)' }}>
                  A demo is a quick 30-second preview of the skill you are teaching. It is what shows up on the discovery feed and what people see when you share a link.
                </p>
              </button>
            )}

            {uploading && uploadingType === "demo" && (
              <div className="relative w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center gap-4 px-6 py-10" style={{ minHeight: '60vh' }}>
                {thumbnailDataUrl && (
                  <img src={thumbnailDataUrl} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="" />
                )}
                <div className="relative z-10 flex flex-col items-center gap-4 w-full">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="text-white font-bold text-lg">Uploading Demo Clip…</p>
                  <p className="text-white/60 text-sm">{uploadProgress}% complete</p>
                  <div className="w-full max-w-xs h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }} />
                  </div>
                </div>
              </div>
            )}

            {uploadError && !uploading && !demoVideo && (
              <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 px-5 py-4 space-y-3">
                <p className="text-destructive font-bold text-sm">Upload failed</p>
                <p className="text-destructive/80 text-sm leading-snug">{uploadError}</p>
                <button
                  onClick={() => { setUploadError(null); demoInputRef.current?.click(); }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border border-destructive/60 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {demoVideo && !uploading && (
              <div className="space-y-3">
                <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black">
                  <video src={demoVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute top-3 left-3 bg-black/60 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-green-400" />
                    <span className="text-white text-xs font-semibold">Demo Clip · {formatTime(demoVideo.duration)}</span>
                  </div>
                  <button onClick={() => setDemoVideo(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <Trash2 size={14} className="text-destructive" />
                  </button>
                </div>
                <Button
                  className="w-full font-bold"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                  onClick={() => setStep("tutorial")}
                >
                  Next: Upload Full Tutorial
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Tutorial video ────────────────────────────────── */}
        {step === "tutorial" && (
          <div className="space-y-4">
            {demoVideo && (
              <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2">
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-black shrink-0">
                  <video src={demoVideo.localUrl} className="w-full h-full object-cover" muted playsInline />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Demo clip uploaded</p>
                  <p className="text-sm font-semibold text-foreground truncate">{demoVideo.fileName}</p>
                  <p className="text-xs text-primary">{formatTime(demoVideo.duration)}</p>
                </div>
                <CheckCircle size={16} className="text-green-400 ml-auto shrink-0" />
              </div>
            )}

            <input ref={tutorialInputRef} type="file" accept="video/mp4,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoSelect(f, "tutorial"); e.target.value = ""; }} />

            {!tutorialVideo && !uploading && (
              <button
                onClick={() => { setUploadError(null); tutorialInputRef.current?.click(); }}
                className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col bg-card hover:border-primary/50 transition-colors px-6 pt-10 pb-8"
                style={{ minHeight: '60vh' }}
              >
                <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                  <Upload size={32} className="text-muted-foreground" />
                  <span className="text-sm text-foreground font-semibold">Tap to select full tutorial</span>
                  <span className="text-xs text-muted-foreground">MP4 · Max 5 minutes</span>
                </div>
                <p className="text-sm font-semibold text-center leading-snug" style={{ color: 'oklch(0.65 0.30 340)' }}>
                  A tutorial is the full video. The max length is 5 minutes. You will have the ability to add chapter breaks to it later.
                </p>
              </button>
            )}

            {uploading && uploadingType === "tutorial" && (
              <div className="relative w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center gap-4 px-6 py-10" style={{ minHeight: '60vh' }}>
                {thumbnailDataUrl && (
                  <img src={thumbnailDataUrl} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="" />
                )}
                <div className="relative z-10 flex flex-col items-center gap-4 w-full">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="text-white font-bold text-lg">Uploading Full Tutorial…</p>
                  <p className="text-white/60 text-sm">{uploadProgress}% complete</p>
                  <div className="w-full max-w-xs h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }} />
                  </div>
                </div>
              </div>
            )}

            {uploadError && !uploading && !tutorialVideo && (
              <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 px-5 py-4 space-y-3">
                <p className="text-destructive font-bold text-sm">Upload failed</p>
                <p className="text-destructive/80 text-sm leading-snug">{uploadError}</p>
                <button
                  onClick={() => { setUploadError(null); tutorialInputRef.current?.click(); }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border border-destructive/60 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {tutorialVideo && !uploading && (
              <div className="space-y-3">
                <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black">
                  <video src={tutorialVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute top-3 left-3 bg-black/60 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-green-400" />
                    <span className="text-white text-xs font-semibold">Tutorial · {formatTime(tutorialVideo.duration)}</span>
                  </div>
                  <button onClick={() => setTutorialVideo(null)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <Trash2 size={14} className="text-destructive" />
                  </button>
                </div>
                <Button
                  className="w-full font-bold"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                  onClick={() => setStep("chapters")}
                >
                  Next: Add Chapter Markers
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Chapter marking ───────────────────────────────── */}
        {step === "chapters" && tutorialVideo && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Play the tutorial and tap <strong className="text-foreground">Add Step Here</strong> at each key moment. Chapter markers let learners jump directly to any step.
            </p>

            {/* Video player */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "9/16", maxHeight: "40vh" }}>
              <video
                ref={tutorialVideoRef}
                src={tutorialVideo.localUrl}
                className="w-full h-full object-contain"
                playsInline
                onTimeUpdate={() => setCurrentTime(tutorialVideoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(tutorialVideoRef.current?.duration ?? 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {/* Chapter markers on scrubber */}
              <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 space-y-2">
                <div className="relative h-1 bg-white/20 rounded-full">
                  {duration > 0 && chapters.map(c => (
                    <div
                      key={c.id}
                      className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary border border-white"
                      style={{ left: `${(c.time / duration) * 100}%` }}
                    />
                  ))}
                  <div className="h-full rounded-full bg-primary" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-xs">{formatTime(currentTime)}</span>
                  <button
                    onClick={() => {
                      if (tutorialVideoRef.current) {
                        if (isPlaying) tutorialVideoRef.current.pause();
                        else tutorialVideoRef.current.play();
                      }
                    }}
                    className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
                  >
                    {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
                  </button>
                  <span className="text-white/60 text-xs">{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Add chapter */}
            <div className="flex gap-2">
              <input
                className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder={`Step ${chapters.length + 1} label…`}
                value={newChapterLabel}
                onChange={e => setNewChapterLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addChapterAtCurrentTime(); }}
              />
              <button
                onClick={addChapterAtCurrentTime}
                className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))", color: "white" }}
              >
                <Plus size={14} /> Add Step Here
              </button>
            </div>

            {/* Chapter list */}
            {chapters.length > 0 && (
              <div className="space-y-2">
                {chapters.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5">
                    <button onClick={() => jumpToChapter(c.time)}
                      className="text-xs font-mono text-primary bg-primary/10 rounded-lg px-2 py-1 shrink-0">
                      {formatTime(c.time)}
                    </button>
                    <span className="text-sm text-foreground flex-1 truncate">{c.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveChapter(c.id, -1)} disabled={idx === 0}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground disabled:opacity-30">
                        <ChevronUp size={12} />
                      </button>
                      <button onClick={() => moveChapter(c.id, 1)} disabled={idx === chapters.length - 1}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground disabled:opacity-30">
                        <ChevronUp size={12} className="rotate-180" />
                      </button>
                      <button onClick={() => deleteChapter(c.id)}
                        className="w-6 h-6 rounded flex items-center justify-center text-destructive">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full font-bold"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              onClick={() => setStep("preview")}
            >
              {chapters.length === 0 ? "Skip Chapters & Preview" : `Preview (${chapters.length} chapter${chapters.length > 1 ? "s" : ""})`}
            </Button>
          </div>
        )}

        {/* ── Step 5: Preview & Publish ─────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {demoVideo && (
                <video src={demoVideo.localUrl} className="w-full aspect-video object-cover" muted loop playsInline autoPlay />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary font-semibold uppercase tracking-wide">{category}</span>
                  <span className="text-xs text-muted-foreground">{tokenPrice} token{tokenPrice > 1 ? "s" : ""}</span>
                </div>
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                {chapters.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{chapters.length} Chapters</p>
                    {chapters.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono text-primary">{formatTime(c.time)}</span>
                        <span>{c.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full font-bold"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              disabled={publishMutation.isPending}
              onClick={handlePublish}
            >
              {publishMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Publishing…</>
              ) : "Publish Tutorial"}
            </Button>
            <button onClick={() => setStep("chapters")} className="w-full text-sm text-muted-foreground py-2">
              ← Back to Chapters
            </button>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}>
              <CheckCircle size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Tutorial Published!</h2>
              <p className="text-sm text-muted-foreground mt-1">Your tutorial is now live on the discovery feed.</p>
            </div>
            <div className="flex gap-3 w-full">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>View Feed</Button>
              <Button
                className="flex-1 font-bold"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                onClick={() => {
                  setStep("meta"); setTitle(""); setCategory(""); setDescription("");
                  setTokenPrice(1); setDemoVideo(null); setTutorialVideo(null); setChapters([]);
                }}
              >
                Upload Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
