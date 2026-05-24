import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  Upload,
  Trash2,
  Flag,
  CheckCircle,
  Loader2,
  Play,
  Pause,
  Eye,
  ChevronUp,
  ChevronDown,
  Film,
  Clapperboard,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";

const CATEGORIES = ["Dance", "Sports", "Music", "Illustration", "Magic", "Fitness", "Other"];

// Duration limits
const DEMO_MAX_SECONDS = 30;
const TUTORIAL_MAX_SECONDS = 300; // 5 minutes

type ChapterDraft = {
  id: string;
  label: string;
  timestampSeconds: number;
};

type UploadedVideo = {
  url: string;
  key: string;
  localUrl: string; // blob URL for preview
  duration: number; // seconds
  fileName: string;
};

type Step = "meta" | "demo" | "tutorial" | "chapters" | "preview" | "done";

// ── XHR upload with progress ──────────────────────────────────────────
function uploadVideoXHR(
  file: File,
  type: "demo" | "tutorial",
  onProgress: (pct: number) => void
): Promise<{ key: string; url: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("video", file);
    form.append("type", type);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload-video");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.error ?? msg; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.send(form);
  });
}

// ── Get video duration from a File ───────────────────────────────────
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read video")); };
    video.src = url;
  });
}

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
  const [pendingLocalUrl, setPendingLocalUrl] = useState<string | null>(null); // thumbnail shown during upload

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

  // ── Video file handler ─────────────────────────────────────────────
  const handleVideoSelect = async (file: File, type: "demo" | "tutorial") => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file (MP4 recommended).");
      return;
    }

    // Check duration first
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

    // Show thumbnail immediately while uploading
    const localUrl = URL.createObjectURL(file);
    setPendingLocalUrl(localUrl);
    setUploading(true);
    setUploadProgress(0);
    setUploadingType(type);

    try {
      const result = await uploadVideoXHR(file, type, setUploadProgress);
      const uploaded: UploadedVideo = {
        url: result.url,
        key: result.key,
        localUrl,
        duration: dur,
        fileName: file.name,
      };
      if (type === "demo") setDemoVideo(uploaded);
      else setTutorialVideo(uploaded);
      toast.success(`${type === "demo" ? "Demo clip" : "Tutorial video"} uploaded!`);
    } catch (err: any) {
      URL.revokeObjectURL(localUrl);
      setPendingLocalUrl(null);
      toast.error(err?.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingType(null);
    }
  };

  // ── Chapter tools ──────────────────────────────────────────────────
  const captureTimestamp = () => {
    const v = tutorialVideoRef.current;
    if (!v) return;
    const ts = Math.floor(v.currentTime);
    const label = newChapterLabel.trim() || `Step ${chapters.length + 1}`;
    setChapters(prev =>
      [...prev, { id: `${Date.now()}`, label, timestampSeconds: ts }]
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    );
    setNewChapterLabel("");
    toast.success(`Step captured at ${formatTime(ts)}`);
  };

  const deleteChapter = (id: string) => setChapters(prev => prev.filter(c => c.id !== id));

  const updateChapterLabel = (id: string, label: string) =>
    setChapters(prev => prev.map(c => c.id === id ? { ...c, label } : c));

  const moveChapter = (id: string, direction: -1 | 1) => {
    setChapters(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const togglePlay = () => {
    const v = tutorialVideoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const handlePublish = () => {
    if (!demoVideo || !tutorialVideo) { toast.error("Both videos are required."); return; }
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!category) { toast.error("Category is required."); return; }
    publishMutation.mutate({
      title: title.trim(),
      category,
      description: description.trim() || undefined,
      tokenPrice,
      demoVideoUrl: demoVideo.url,
      demoVideoKey: demoVideo.key,
      tutorialVideoUrl: tutorialVideo.url,
      tutorialVideoKey: tutorialVideo.key,
      chapters: chapters.map((c, i) => ({
        label: c.label,
        timestampSeconds: c.timestampSeconds,
        sortOrder: i,
      })),
    });
  };

  // ── Done state ─────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-5">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center glow-pink">
          <CheckCircle size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-black gradient-text">Published!</h2>
        <p className="text-muted-foreground text-sm">Your tutorial is live in the discovery feed.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/")}>View Feed</Button>
          <Button
            onClick={() => {
              setStep("meta"); setTitle(""); setCategory(""); setDescription("");
              setTokenPrice(1); setDemoVideo(null); setTutorialVideo(null); setChapters([]);
            }}
            className="bg-primary glow-pink"
          >
            Upload Another
          </Button>
        </div>
      </div>
    );
  }

  const steps: Step[] = ["meta", "demo", "tutorial", "chapters", "preview"];
  const stepIdx = steps.indexOf(step);
  const stepLabels = ["Details", "Demo Clip", "Full Tutorial", "Chapters", "Preview"];

  // ── Upload overlay (shown during upload) ──────────────────────────
  const UploadOverlay = ({ type }: { type: "demo" | "tutorial" }) => (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 rounded-2xl z-10">
      <div className="text-center">
        <p className="text-white font-bold text-base">
          Uploading {type === "demo" ? "Demo Clip" : "Full Tutorial"}…
        </p>
        <p className="text-white/60 text-sm mt-1">{uploadProgress}% complete</p>
      </div>
      {/* Progress bar */}
      <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${uploadProgress}%`,
            background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))",
          }}
        />
      </div>
      <Loader2 size={20} className="text-primary animate-spin" />
    </div>
  );

  return (
    <div className="min-h-dvh bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <button
            onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1]) : navigate("/profile")}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black text-foreground">Upload Tutorial</h1>
            <p className="text-xs text-muted-foreground">{stepLabels[stepIdx]} · Step {stepIdx + 1} of {steps.length}</p>
          </div>
        </div>
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((stepIdx + 1) / steps.length) * 100}%`,
              background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))",
            }}
          />
        </div>
      </header>

      <div className="px-4 pt-5">

        {/* ── Step 1: Meta ──────────────────────────────────────────── */}
        {step === "meta" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. The Moonwalk Step-by-Step" className="bg-card border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What will learners be able to do after this tutorial?"
                className="bg-card border-border resize-none" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Token Price</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(p => (
                  <button key={p} onClick={() => setTokenPrice(p)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all",
                      tokenPrice === p
                        ? "bg-primary text-primary-foreground border-primary glow-pink"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>
            <Button
              className="w-full font-bold mt-2 glow-pink"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              disabled={!title.trim() || !category}
              onClick={() => setStep("demo")}
            >
              Next: Upload Demo Clip
            </Button>
          </div>
        )}

        {/* ── Step 2: Demo clip ─────────────────────────────────────── */}
        {step === "demo" && (
          <div className="space-y-4">
            <input ref={demoInputRef} type="file" accept="video/mp4,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoSelect(f, "demo"); e.target.value = ""; }} />

            {!demoVideo && !uploading && (
              <button
                onClick={() => demoInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col bg-card hover:border-primary/50 transition-colors px-6 pt-10 pb-8"
                style={{ minHeight: '60vh' }}
              >
                {/* Top: icon + label */}
                <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                  <Upload size={32} className="text-muted-foreground" />
                  <span className="text-sm text-foreground font-semibold">Tap to select demo clip</span>
                  <span className="text-xs text-muted-foreground">MP4 · Max 200MB</span>
                </div>
                {/* Bottom: description in neon pink */}
                <p className="text-sm font-semibold text-center leading-snug" style={{ color: 'oklch(0.65 0.30 340)' }}>
                  Upload a short preview clip (15–30 seconds) that shows the skill. This is what learners see in the feed.
                </p>
              </button>
            )}

            {/* Uploading state — show thumbnail + progress overlay */}
            {uploading && uploadingType === "demo" && (
              <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black">
                {pendingLocalUrl && (
                  <video src={pendingLocalUrl} className="w-full h-full object-cover opacity-40" muted playsInline />
                )}
                <UploadOverlay type="demo" />
              </div>
            )}

            {/* Uploaded state */}
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
                  className="w-full font-bold glow-pink"
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
            {/* Thumbnail of already-uploaded demo */}
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
                onClick={() => tutorialInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col bg-card hover:border-primary/50 transition-colors px-6 pt-10 pb-8"
                style={{ minHeight: '60vh' }}
              >
                {/* Top: icon + label */}
                <div className="flex flex-col items-center gap-2 flex-1 justify-center">
                  <Upload size={32} className="text-muted-foreground" />
                  <span className="text-sm text-foreground font-semibold">Tap to select full tutorial</span>
                  <span className="text-xs text-muted-foreground">MP4 · Max 200MB</span>
                </div>
                {/* Bottom: description in neon pink */}
                <p className="text-sm font-semibold text-center leading-snug" style={{ color: 'oklch(0.65 0.30 340)' }}>
                  Upload the full step-by-step teaching video. Max 5 minutes. You will add chapter breaks in the next step.
                </p>
              </button>
            )}

            {/* Uploading state */}
            {uploading && uploadingType === "tutorial" && (
              <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black">
                {pendingLocalUrl && (
                  <video src={pendingLocalUrl} className="w-full h-full object-cover opacity-40" muted playsInline />
                )}
                <UploadOverlay type="tutorial" />
              </div>
            )}

            {/* Uploaded state */}
            {tutorialVideo && !uploading && (
              <div className="space-y-3">
                <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black">
                  <video src={tutorialVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute top-3 left-3 bg-black/60 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                    <CheckCircle size={12} className="text-green-400" />
                    <span className="text-white text-xs font-semibold">Full Tutorial · {formatTime(tutorialVideo.duration)}</span>
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
                  Next: Add Chapter Steps
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Chapter marking ───────────────────────────────── */}
        {step === "chapters" && tutorialVideo && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Play your tutorial and tap <span className="text-primary font-semibold">Capture Step</span> at each key moment. These become the navigation buttons in the practice player.
            </p>

            {/* Video player */}
            <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black">
              <video
                ref={tutorialVideoRef}
                src={tutorialVideo.localUrl}
                className="w-full h-full object-cover"
                playsInline
                onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onLoadedMetadata={e => setDuration((e.target as HTMLVideoElement).duration)}
                onEnded={() => setIsPlaying(false)}
              />
              {/* Play/pause overlay */}
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center"
              >
                {!isPlaying && (
                  <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                    <Play size={28} className="text-white ml-1" />
                  </div>
                )}
              </button>
              {/* Time */}
              <div className="absolute bottom-3 left-3 bg-black/60 rounded-full px-2.5 py-1">
                <span className="text-white text-xs font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              {/* Pause button when playing */}
              {isPlaying && (
                <button onClick={togglePlay} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
                  <Pause size={16} className="text-white" />
                </button>
              )}
            </div>

            {/* Capture row */}
            <div className="flex gap-2">
              <Input
                value={newChapterLabel}
                onChange={e => setNewChapterLabel(e.target.value)}
                placeholder={`Step ${chapters.length + 1} label (optional)`}
                className="bg-card border-border flex-1"
                onKeyDown={e => e.key === "Enter" && captureTimestamp()}
              />
              <Button
                onClick={captureTimestamp}
                className="shrink-0 glow-pink"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              >
                <Flag size={14} className="mr-1.5" />
                Capture
              </Button>
            </div>

            {/* Chapter list */}
            {chapters.length > 0 && (
              <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {chapters.map((ch, i) => (
                  <div key={ch.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button onClick={() => moveChapter(ch.id, -1)} disabled={i === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                        <ChevronUp size={12} />
                      </button>
                      <button onClick={() => moveChapter(ch.id, 1)} disabled={i === chapters.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <Input
                      value={ch.label}
                      onChange={e => updateChapterLabel(ch.id, e.target.value)}
                      className="flex-1 bg-transparent border-0 p-0 h-auto text-sm font-medium focus-visible:ring-0"
                    />
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{formatTime(ch.timestampSeconds)}</span>
                    <button onClick={() => deleteChapter(ch.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full font-bold"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              onClick={() => setStep("preview")}
            >
              {chapters.length === 0 ? "Skip Chapters & Preview" : `Preview with ${chapters.length} Step${chapters.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}

        {/* ── Step 5: Preview & Publish ─────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Review your tutorial before publishing to the feed.</p>

            {/* Summary card */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {demoVideo && (
                  <div className="w-16 h-24 rounded-xl overflow-hidden bg-black shrink-0">
                    <video src={demoVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-foreground text-base leading-tight">{title}</p>
                  <p className="text-muted-foreground text-xs mt-1">{category}</p>
                  {description && <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                      {tokenPrice} token{tokenPrice !== 1 ? "s" : ""}
                    </span>
                    {chapters.length > 0 && (
                      <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                        {chapters.length} steps
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Clapperboard size={14} className="text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Demo</p>
                    <p className="text-xs font-semibold text-foreground">{demoVideo ? formatTime(demoVideo.duration) : "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Film size={14} className="text-secondary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tutorial</p>
                    <p className="text-xs font-semibold text-foreground">{tutorialVideo ? formatTime(tutorialVideo.duration) : "—"}</p>
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full font-bold glow-pink"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              disabled={publishMutation.isPending}
              onClick={handlePublish}
            >
              {publishMutation.isPending ? <><Loader2 size={16} className="mr-2 animate-spin" />Publishing…</> : "Publish Tutorial"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
