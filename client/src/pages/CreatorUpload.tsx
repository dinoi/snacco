import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  GripVertical,
  Flag,
  CheckCircle,
  Loader2,
  Play,
  Pause,
  Eye,
  ChevronUp,
  ChevronDown,
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

type ChapterDraft = {
  id: string;
  label: string;
  timestampSeconds: number;
};

type UploadedVideo = {
  url: string;
  key: string;
  localUrl: string; // blob URL for preview
};

type Step = "meta" | "demo" | "tutorial" | "chapters" | "preview" | "done";

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
  const [uploading, setUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [previewChapterIdx, setPreviewChapterIdx] = useState<number | null>(null);

  const tutorialVideoRef = useRef<HTMLVideoElement>(null);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const tutorialInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.tutorials.uploadVideo.useMutation();
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

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const handleVideoUpload = async (file: File, type: "demo" | "tutorial") => {
    if (!file.type.startsWith("video/")) {
      toast.error("Please select an MP4 video file.");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error("File must be under 200MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileBase64: base64,
        mimeType: file.type,
        type,
      });
      const localUrl = URL.createObjectURL(file);
      const uploaded: UploadedVideo = { url: result.url, key: result.key, localUrl };
      if (type === "demo") setDemoVideo(uploaded);
      else setTutorialVideo(uploaded);
      toast.success(`${type === "demo" ? "Demo" : "Tutorial"} video uploaded!`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const captureTimestamp = () => {
    const v = tutorialVideoRef.current;
    if (!v) return;
    const ts = Math.floor(v.currentTime);
    const label = newChapterLabel.trim() || `Step ${chapters.length + 1}`;
    const newChapter: ChapterDraft = {
      id: `${Date.now()}`,
      label,
      timestampSeconds: ts,
    };
    setChapters(prev => [...prev, newChapter].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
      .map((c, i) => ({ ...c })));
    setNewChapterLabel("");
    toast.success(`Step captured at ${formatTime(ts)}`);
  };

  const deleteChapter = (id: string) => {
    setChapters(prev => prev.filter(c => c.id !== id));
  };

  const updateChapterLabel = (id: string, label: string) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, label } : c));
  };

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

  const jumpToChapter = (ts: number) => {
    const v = tutorialVideoRef.current;
    if (v) { v.currentTime = ts; setPreviewChapterIdx(null); }
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

  // ── Done state ──────────────────────────────────────────────────────
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
  const stepLabels = ["Details", "Demo", "Tutorial", "Chapters", "Preview"];

  return (
    <div className="min-h-dvh bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1]) : navigate("/profile")}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black text-foreground">Upload Tutorial</h1>
            <p className="text-xs text-muted-foreground">{stepLabels[stepIdx]} ({stepIdx + 1}/{steps.length})</p>
          </div>
        </div>
        {/* Progress bar */}
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

        {/* ── Step 1: Meta ─────────────────────────────────────────────── */}
        {step === "meta" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Title *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. The Moonwalk Step-by-Step"
                className="bg-card border-border"
              />
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
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What will learners be able to do after this tutorial?"
                className="bg-card border-border resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Token Price</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(p => (
                  <button
                    key={p}
                    onClick={() => setTokenPrice(p)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all",
                      tokenPrice === p
                        ? "bg-primary text-primary-foreground border-primary glow-pink"
                        : "bg-card text-muted-foreground border-border hover:border-primary/50"
                    )}
                  >
                    {p}
                  </button>
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

        {/* ── Step 2: Demo video ────────────────────────────────────────── */}
        {step === "demo" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload a short preview clip (15–60 seconds) that shows the skill. This is what learners see in the feed.</p>
            <input ref={demoInputRef} type="file" accept="video/mp4,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f, "demo"); }} />
            {!demoVideo ? (
              <button
                onClick={() => demoInputRef.current?.click()}
                disabled={uploading}
                className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 bg-card hover:border-primary/50 transition-colors"
              >
                {uploading ? <Loader2 size={32} className="text-primary animate-spin" /> : <Upload size={32} className="text-muted-foreground" />}
                <span className="text-sm text-muted-foreground font-medium">{uploading ? "Uploading..." : "Tap to select demo clip"}</span>
                <span className="text-xs text-muted-foreground">MP4 · Max 200MB</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black">
                  <video src={demoVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute top-3 right-3">
                    <button onClick={() => { setDemoVideo(null); }} className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                      <Trash2 size={14} className="text-destructive" />
                    </button>
                  </div>
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

        {/* ── Step 3: Tutorial video ────────────────────────────────────── */}
        {step === "tutorial" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Upload the full tutorial video. This is what learners practice with after unlocking.</p>
            <input ref={tutorialInputRef} type="file" accept="video/mp4,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f, "tutorial"); }} />
            {!tutorialVideo ? (
              <button
                onClick={() => tutorialInputRef.current?.click()}
                disabled={uploading}
                className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 bg-card hover:border-primary/50 transition-colors"
              >
                {uploading ? <Loader2 size={32} className="text-primary animate-spin" /> : <Upload size={32} className="text-muted-foreground" />}
                <span className="text-sm text-muted-foreground font-medium">{uploading ? "Uploading..." : "Tap to select tutorial video"}</span>
                <span className="text-xs text-muted-foreground">MP4 · Max 200MB</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black">
                  <video src={tutorialVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute top-3 right-3">
                    <button onClick={() => setTutorialVideo(null)} className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                      <Trash2 size={14} className="text-destructive" />
                    </button>
                  </div>
                </div>
                <Button
                  className="w-full font-bold glow-pink"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                  onClick={() => setStep("chapters")}
                >
                  Next: Add Chapter Markers
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Chapter marking ───────────────────────────────────── */}
        {step === "chapters" && tutorialVideo && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Watch your tutorial and tap <strong className="text-foreground">Mark Step</strong> at each key moment. Learners will use these to jump between steps.</p>

            {/* Video player */}
            <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black">
              <video
                ref={tutorialVideoRef}
                src={tutorialVideo.localUrl}
                className="w-full h-full object-cover"
                playsInline
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {/* Chapter markers on progress bar */}
              <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-black/80 to-transparent pt-8">
                <div className="relative h-1.5 bg-white/20 rounded-full mb-3">
                  <div
                    className="absolute top-0 left-0 h-full rounded-full"
                    style={{
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                      background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))",
                    }}
                  />
                  {chapters.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => jumpToChapter(ch.timestampSeconds)}
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white -translate-x-1/2"
                      style={{ left: `${duration > 0 ? (ch.timestampSeconds / duration) * 100 : 0}%` }}
                      title={ch.label}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-xs font-mono">{formatTime(currentTime)}</span>
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center glow-pink"
                  >
                    {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white fill-white ml-0.5" />}
                  </button>
                  <span className="text-white/60 text-xs font-mono">{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Mark step input */}
            <div className="flex gap-2">
              <Input
                value={newChapterLabel}
                onChange={e => setNewChapterLabel(e.target.value)}
                placeholder={`Step ${chapters.length + 1} label...`}
                className="bg-card border-border flex-1"
                onKeyDown={e => { if (e.key === "Enter") captureTimestamp(); }}
              />
              <Button
                onClick={captureTimestamp}
                className="shrink-0 bg-secondary hover:bg-secondary/90 glow-red"
              >
                <Flag size={16} className="mr-1.5" />
                Mark at {formatTime(Math.floor(currentTime))}
              </Button>
            </div>

            {/* Chapter list */}
            {chapters.length > 0 && (
              <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {chapters.map((ch, i) => (
                  <div key={ch.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button onClick={() => moveChapter(ch.id, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                        <ChevronUp size={12} />
                      </button>
                      <button onClick={() => moveChapter(ch.id, 1)} disabled={i === chapters.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
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
              className="w-full font-bold glow-pink"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              onClick={() => setStep("preview")}
            >
              {chapters.length === 0 ? "Skip chapters & Preview" : `Preview with ${chapters.length} step${chapters.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}

        {/* ── Step 5: Preview & Publish ─────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {demoVideo && (
                <div className="relative w-full aspect-[9/16] bg-black">
                  <video src={demoVideo.localUrl} className="w-full h-full object-cover" muted loop playsInline autoPlay />
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <h3 className="font-bold text-white text-lg">{title}</h3>
                    <p className="text-white/60 text-sm">{category}</p>
                  </div>
                </div>
              )}
              <div className="p-4 space-y-3">
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Token price</span>
                  <span className="font-black text-primary text-lg">{tokenPrice} token{tokenPrice !== 1 ? "s" : ""}</span>
                </div>
                {chapters.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{chapters.length} Steps</p>
                    {chapters.map((ch, i) => (
                      <div key={ch.id} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground font-mono text-xs w-10 shrink-0">{formatTime(ch.timestampSeconds)}</span>
                        <span className="text-foreground">{ch.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full font-bold glow-pink"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
              disabled={publishMutation.isPending}
              onClick={handlePublish}
            >
              {publishMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : <CheckCircle size={18} className="mr-2" />}
              Publish Tutorial
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
