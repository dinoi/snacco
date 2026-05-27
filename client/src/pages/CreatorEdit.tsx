import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
  X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useParams } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { VersionBadge } from "@/components/VersionBadge";

const DEMO_MAX_SECONDS = 30;
const TUTORIAL_MAX_SECONDS = 300;

const CATEGORIES = [
  "Dance", "Fitness", "Yoga", "Martial Arts", "Music",
  "Art & Drawing", "Cooking", "Language", "DIY & Crafts", "Other",
];

type ChapterDraft = { id: string; time: number; label: string };
type UploadedVideo = { url: string; key: string; localUrl: string; duration: number; fileName: string };
type EditStep = "meta" | "demo" | "tutorial" | "chapters" | "preview" | "done";

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

export default function CreatorEdit() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const tutorialId = parseInt(id || "0");
  const utils = trpc.useUtils();

  // Load existing tutorial
  const { data: tutorial, isLoading: tutorialLoading } = trpc.tutorials.get.useQuery(
    { id: tutorialId },
    { enabled: !!tutorialId && isAuthenticated }
  );

  const [step, setStep] = useState<EditStep>("meta");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [tokenPrice, setTokenPrice] = useState(1);
  const [demoVideo, setDemoVideo] = useState<UploadedVideo | null>(null);
  const [tutorialVideo, setTutorialVideo] = useState<UploadedVideo | null>(null);
  const [chapters, setChapters] = useState<ChapterDraft[]>([]);
  const [newChapterLabel, setNewChapterLabel] = useState("");
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

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

  // Initialize form with existing tutorial data
  useEffect(() => {
    if (tutorial) {
      setTitle(tutorial.title);
      setCategory(tutorial.category);
      setDescription(tutorial.description || "");
      setTokenPrice(tutorial.tokenPrice);
      setDemoVideo({
        url: tutorial.demoVideoUrl,
        key: tutorial.demoVideoKey,
        localUrl: tutorial.demoVideoUrl,
        duration: 0,
        fileName: "demo.mp4",
      });
      setTutorialVideo({
        url: tutorial.tutorialVideoUrl,
        key: tutorial.tutorialVideoKey,
        localUrl: tutorial.tutorialVideoUrl,
        duration: 0,
        fileName: "tutorial.mp4",
      });
      // Load chapters
      if (tutorial.chapters) {
        setChapters(
          tutorial.chapters.map((ch) => ({
            id: crypto.randomUUID(),
            time: ch.timestampSeconds,
            label: ch.label,
          }))
        );
      }
    }
  }, [tutorial]);

  const updateMutation = trpc.tutorials.update.useMutation({
    onSuccess: () => {
      utils.tutorials.get.invalidate({ id: tutorialId });
      utils.tutorials.myTutorials.invalidate();
      utils.tutorials.feed.invalidate();
      setStep("done");
      toast.success("Tutorial updated successfully!");
    },
    onError: (err) => toast.error(err.message ?? "Failed to update tutorial."),
  });

  const deleteMutation = trpc.tutorials.delete.useMutation({
    onSuccess: () => {
      utils.tutorials.myTutorials.invalidate();
      utils.tutorials.feed.invalidate();
      toast.success("Tutorial deleted successfully!");
      navigate("/profile");
    },
    onError: (err) => toast.error(err.message ?? "Failed to delete tutorial."),
  });

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this tutorial? This action cannot be undone.")) {
      deleteMutation.mutate({ id: tutorialId });
    }
  };

  if (!isAuthenticated || !user?.isCreator) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-muted-foreground text-sm">Enable creator mode in your profile first.</p>
        <Button onClick={() => navigate("/profile")} variant="outline">Go to Profile</Button>
      </div>
    );
  }

  if (tutorialLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tutorial) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-muted-foreground text-sm">Tutorial not found.</p>
        <Button onClick={() => navigate("/profile")} variant="outline">Go Back</Button>
      </div>
    );
  }

  // ── Direct multipart upload ─────────────────────────────────────────
  const uploadVideoDirect = async (
    file: File,
    type: "demo" | "tutorial",
    onProgress: (pct: number) => void
  ): Promise<{ key: string; url: string }> => {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("type", type);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch (e) {
            reject(new Error("Invalid response from server"));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));

      xhr.open("POST", "/api/upload-video");
      xhr.send(formData);
    });
  };

  // ── Handle video selection ─────────────────────────────────────────
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: "demo" | "tutorial") => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    let dur = 0;
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
        toast.success("Demo video replaced!");
      } else {
        setTutorialVideo(uploaded);
        toast.success("Tutorial video replaced!");
      }
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed. Please try again.");
      toast.error(err?.message ?? "Upload failed");
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
  const startEditChapter = (id: string, currentLabel: string) => {
    setEditingChapterId(id);
    setEditingLabel(currentLabel);
  };
  const saveEditChapter = (id: string) => {
    setChapters(chapters.map(c => c.id === id ? { ...c, label: editingLabel } : c));
    setEditingChapterId(null);
  };

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

  // ── Update ────────────────────────────────────────────────────────
  const handleUpdate = () => {
    if (!demoVideo || !tutorialVideo) return;
    updateMutation.mutate({
      id: tutorialId,
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
  const STEPS: EditStep[] = ["meta", "demo", "tutorial", "chapters", "preview"];
  const stepIdx = STEPS.indexOf(step);
  const stepLabels: Record<EditStep, string> = {
    meta: "Details", demo: "Demo Clip", tutorial: "Full Tutorial",
    chapters: "Chapters", preview: "Preview", done: "Done",
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/profile")} className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
              <ChevronUp size={16} className="text-muted-foreground rotate-[-90deg]" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground">Edit Tutorial</h1>
              <p className="text-xs text-muted-foreground">
                {stepLabels[step]} · Step {Math.min(stepIdx + 1, STEPS.length)} of {STEPS.length}
              </p>
            </div>
          </div>
          <VersionBadge />
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
            {/* Delete button at top */}
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30">
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="w-full py-2.5 rounded-lg text-sm font-bold border border-destructive/60 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete Tutorial
                  </>
                )}
              </button>
            </div>

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
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Genre *</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm">
                  <SelectValue placeholder="Select a genre" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</label>
              <textarea
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
                placeholder="Describe your tutorial..."
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Token Price *</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                value={tokenPrice}
                onChange={e => setTokenPrice(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => navigate("/profile")}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep("demo")}
                disabled={!title || !category}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Demo Video ───────────────────────────────────── */}
        {step === "demo" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Demo Clip (max 30s)</p>
              {demoVideo && (
                <div className="relative w-full aspect-[9/16] bg-black rounded-2xl overflow-hidden mb-4">
                  <video
                    src={demoVideo.localUrl}
                    className="w-full h-full object-cover"
                    controls
                  />
                  <button
                    onClick={() => setDemoVideo(null)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X size={16} className="text-white" />
                  </button>
                </div>
              )}
              <input
                ref={demoInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoSelect(e, "demo")}
                className="hidden"
              />
              <Button
                onClick={() => demoInputRef.current?.click()}
                disabled={uploading}
                variant="outline"
                className="w-full"
              >
                {uploading && uploadingType === "demo" ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Uploading {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload size={16} className="mr-2" />
                    {demoVideo ? "Replace Demo" : "Upload Demo"}
                  </>
                )}
              </Button>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setStep("meta")}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep("tutorial")}
                disabled={!demoVideo}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Tutorial Video ───────────────────────────────── */}
        {step === "tutorial" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Full Tutorial (max 5 min)</p>
              {tutorialVideo && (
                <div className="relative w-full aspect-[9/16] bg-black rounded-2xl overflow-hidden mb-4">
                  <video
                    src={tutorialVideo.localUrl}
                    className="w-full h-full object-cover"
                    controls
                  />
                  <button
                    onClick={() => setTutorialVideo(null)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X size={16} className="text-white" />
                  </button>
                </div>
              )}
              <input
                ref={tutorialInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoSelect(e, "tutorial")}
                className="hidden"
              />
              <Button
                onClick={() => tutorialInputRef.current?.click()}
                disabled={uploading}
                variant="outline"
                className="w-full"
              >
                {uploading && uploadingType === "tutorial" ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Uploading {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload size={16} className="mr-2" />
                    {tutorialVideo ? "Replace Tutorial" : "Upload Tutorial"}
                  </>
                )}
              </Button>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setStep("demo")}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep("chapters")}
                disabled={!tutorialVideo}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Chapters ─────────────────────────────────────── */}
        {step === "chapters" && tutorialVideo && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl p-4 border border-border">
              <video
                ref={tutorialVideoRef}
                src={tutorialVideo.localUrl}
                className="w-full rounded-xl mb-4"
                controls
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Chapter name..."
                    value={newChapterLabel}
                    onChange={(e) => setNewChapterLabel(e.target.value)}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <Button
                    onClick={addChapterAtCurrentTime}
                    size="sm"
                    className="gap-1"
                  >
                    <Plus size={14} /> Add
                  </Button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {chapters.map((ch, idx) => (
                    <div key={ch.id} className="flex items-center gap-2 bg-background p-2 rounded-lg border border-border/50">
                      <div className="flex-1 min-w-0">
                        {editingChapterId === ch.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onBlur={() => saveEditChapter(ch.id)}
                            onKeyDown={(e) => e.key === "Enter" && saveEditChapter(ch.id)}
                            className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                          />
                        ) : (
                          <div
                            onClick={() => startEditChapter(ch.id, ch.label)}
                            className="cursor-pointer text-xs font-medium text-foreground truncate"
                          >
                            {ch.label}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">{formatTime(ch.time)}</div>
                      </div>
                      <button
                        onClick={() => jumpToChapter(ch.time)}
                        className="p-1 hover:bg-card rounded"
                      >
                        <Play size={12} className="text-primary" />
                      </button>
                      <button
                        onClick={() => moveChapter(ch.id, -1)}
                        disabled={idx === 0}
                        className="p-1 hover:bg-card rounded disabled:opacity-50"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => moveChapter(ch.id, 1)}
                        disabled={idx === chapters.length - 1}
                        className="p-1 hover:bg-card rounded disabled:opacity-50"
                      >
                        <ChevronUp size={12} className="rotate-180" />
                      </button>
                      <button
                        onClick={() => deleteChapter(ch.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setStep("tutorial")}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep("preview")}
                className="flex-1"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Preview ──────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="bg-card rounded-2xl p-4 border border-border space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Title</p>
                <p className="text-sm font-semibold text-foreground">{title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Genre</p>
                <p className="text-sm font-semibold text-foreground">{category}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm text-foreground">{description || "No description"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Token Price</p>
                <p className="text-sm font-semibold text-primary">{tokenPrice} tokens</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Chapters ({chapters.length})</p>
                <div className="space-y-1">
                  {chapters.map(ch => (
                    <div key={ch.id} className="text-xs text-foreground flex justify-between">
                      <span>{ch.label}</span>
                      <span className="text-muted-foreground">{formatTime(ch.time)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setStep("chapters")}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 6: Done ─────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <CheckCircle size={32} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Tutorial Updated!</h2>
              <p className="text-sm text-muted-foreground">Your changes have been saved.</p>
            </div>
            <Button
              onClick={() => navigate("/profile")}
              className="w-full"
            >
              Back to Profile
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
