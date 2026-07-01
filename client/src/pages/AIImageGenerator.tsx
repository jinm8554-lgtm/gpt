import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import MainLayout from "@/components/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sparkles,
  Download,
  Heart,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  X,
  Search,
  Filter,
} from "lucide-react";

interface GenerationTask {
  id: string;
  status: "optimizing" | "generating" | "success" | "failed";
  originalPrompt: string;
  optimizedPrompt: string;
  params: {
    size: string;
    quality: string;
    format: string;
    n: number;
  };
  images: Array<{ url?: string; b64_json?: string }>;
  startedAt: number;
  completedAt?: number;
  elapsedMs?: number;
  isFavorite: boolean;
  errorMessage?: string;
}

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square" },
  { value: "3:2", label: "Landscape" },
  { value: "2:3", label: "Portrait" },
  { value: "16:9", label: "Widescreen" },
  { value: "9:16", label: "Mobile" },
];

const SIZES: Record<string, string[]> = {
  "1:1": ["1024x1024", "2048x2048"],
  "3:2": ["1536x1024", "2160x1440"],
  "2:3": ["1024x1536", "1440x2160"],
  "16:9": ["1280x720", "2560x1440"],
  "9:16": ["720x1280", "1440x2560"],
};

export default function AIImageGenerator() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  // Form state
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [format, setFormat] = useState("png");
  const [moderation, setModeration] = useState("auto");
  const [count, setCount] = useState(1);
  const [optimizePrompt, setOptimizePrompt] = useState(true);
  
  // UI state
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "failed" | "favorite">("all");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<Record<string, number>>({});
  
  const optimizeMutation = trpc.aiImage.optimize.useMutation();
  const generateMutation = trpc.aiImage.generate.useMutation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auth check
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Timer for elapsed time
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => {
        const updated = { ...prev };
        let hasActive = false;
        
        tasks.forEach((task) => {
          if (task.status === "optimizing" || task.status === "generating") {
            updated[task.id] = (Date.now() - task.startedAt) / 1000;
            hasActive = true;
          }
        });
        
        return hasActive ? updated : prev;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tasks]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    const taskId = `task-${Date.now()}-${Math.random()}`;
    const newTask: GenerationTask = {
      id: taskId,
      status: optimizePrompt ? "optimizing" : "generating",
      originalPrompt: prompt,
      optimizedPrompt: "",
      params: { size, quality, format, n: count },
      images: [],
      startedAt: Date.now(),
      isFavorite: false,
    };

    setTasks((prev) => [newTask, ...prev]);
    setElapsedTime((prev) => ({ ...prev, [taskId]: 0 }));

    try {
      let finalPrompt = prompt;

      if (optimizePrompt) {
        try {
          const optimizeResult = await optimizeMutation.mutateAsync({
            prompt,
          });

          const optimizedEvent = (optimizeResult as any[]).find(
            (e: any) => e.type === "prompt_optimized"
          );
          if (
            optimizedEvent &&
            typeof optimizedEvent === "object" &&
            "optimized_prompt" in optimizedEvent
          ) {
            finalPrompt = (optimizedEvent as any).optimized_prompt;
          }

          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: "generating",
                    optimizedPrompt: finalPrompt,
                  }
                : t
            )
          );
        } catch (error) {
          console.error("Optimization failed:", error);
          const errorMsg = error instanceof Error ? error.message : "Failed to optimize prompt";
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: "failed",
                    errorMessage: errorMsg,
                    completedAt: Date.now(),
                    elapsedMs: Date.now() - newTask.startedAt,
                  }
                : t
            )
          );
          toast.error(errorMsg);
          return;
        }
      }

      const generateResult = await generateMutation.mutateAsync({
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        size,
        quality,
        n: count,
        optimize_prompt: false,
        output_format: format,
        output_compression: null,
        moderation,
      });

      const completedEvent = (generateResult as any[]).find(
        (e: any) => e.type === "image_completed"
      );
      const images =
        completedEvent && "images" in completedEvent
          ? (completedEvent as any).images
          : [];

      const elapsedMs = Date.now() - newTask.startedAt;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "success",
                images,
                completedAt: Date.now(),
                elapsedMs,
              }
            : t
        )
      );
      setElapsedTime((prev) => ({ ...prev, [taskId]: elapsedMs / 1000 }));

      toast.success("Image generated successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Generation failed";
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "failed",
                errorMessage,
                completedAt: Date.now(),
                elapsedMs: Date.now() - newTask.startedAt,
              }
            : t
        )
      );
      toast.error(errorMessage);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setElapsedTime((prev) => {
      const updated = { ...prev };
      delete updated[taskId];
      return updated;
    });
  };

  const handleToggleFavorite = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, isFavorite: !t.isFavorite } : t
      )
    );
  };

  const handleDownloadImage = async (imageUrl: string | undefined, index: number) => {
    if (!imageUrl) {
      toast.error("Image URL not available");
      return;
    }

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `generated-image-${Date.now()}-${index}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Image downloaded");
    } catch (error) {
      toast.error("Failed to download image");
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.originalPrompt.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      task.optimizedPrompt.toLowerCase().includes(searchKeyword.toLowerCase());

    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "success" && task.status === "success") ||
      (filterStatus === "failed" && task.status === "failed") ||
      (filterStatus === "favorite" && task.isFavorite);

    return matchesSearch && matchesFilter;
  });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Sparkles className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-semibold">AI Image Generator</h1>
            </div>
            <p className="text-muted-foreground">
              Create stunning images with advanced AI technology
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Control Panel */}
            <div className="lg:col-span-1">
              <Card className="p-6 shadow-lg sticky top-8">
                <div className="space-y-6">
                  {/* Prompt Input */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Prompt
                    </Label>
                    <Textarea
                      placeholder="Describe the image you want to generate..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="min-h-24 resize-none"
                    />
                  </div>

                  {/* Aspect Ratio */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Aspect Ratio
                    </Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      {ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio.value} value={ratio.value}>
                          {ratio.label} ({ratio.value})
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Size */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Size
                    </Label>
                    <Select value={size} onValueChange={setSize}>
                      {(SIZES[aspectRatio] || []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Quality */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Quality
                    </Label>
                    <Select value={quality} onValueChange={setQuality}>
                      <option value="auto">Auto</option>
                      <option value="standard">Standard</option>
                      <option value="hd">HD</option>
                    </Select>
                  </div>

                  {/* Format */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Format
                    </Label>
                    <Select value={format} onValueChange={setFormat}>
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                      <option value="webp">WebP</option>
                    </Select>
                  </div>

                  {/* Moderation */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Content Moderation
                    </Label>
                    <Select value={moderation} onValueChange={setModeration}>
                      <option value="auto">Auto</option>
                      <option value="strict">Strict</option>
                      <option value="relaxed">Relaxed</option>
                    </Select>
                  </div>

                  {/* Count */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Number of Images
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={4}
                      value={count}
                      onChange={(e) =>
                        setCount(
                          Math.min(4, Math.max(1, parseInt(e.target.value) || 1))
                        )
                      }
                    />
                  </div>

                  {/* Optimize Prompt */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      Optimize Prompt
                    </Label>
                    <Switch
                      checked={optimizePrompt}
                      onCheckedChange={setOptimizePrompt}
                    />
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={handleGenerate}
                    disabled={
                      !prompt.trim() ||
                      optimizeMutation.isPending ||
                      generateMutation.isPending
                    }
                    className="w-full h-10 text-base font-semibold"
                  >
                    {optimizeMutation.isPending ||
                    generateMutation.isPending ? (
                      <>
                        <Spinner className="w-4 h-4 mr-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Results Section */}
            <div className="lg:col-span-2">
              {/* Search and Filter */}
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by prompt..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus as any}>
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="favorite">Favorites</option>
                </Select>
              </div>

              {/* Results Grid */}
              {filteredTasks.length === 0 ? (
                <Card className="p-12 text-center shadow-lg">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    {tasks.length === 0
                      ? "No images generated yet. Start by entering a prompt above."
                      : "No results match your search or filter."}
                  </p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filteredTasks.map((task) => (
                    <Card
                      key={task.id}
                      className="p-4 shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <div className="flex gap-4">
                        {/* Thumbnail */}
                        <div
                          className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() =>
                            task.images[0]?.url &&
                            setSelectedImage(task.images[0].url)
                          }
                        >
                          {task.images.length > 0 && task.images[0]?.url ? (
                            <img
                              src={task.images[0].url}
                              alt="Generated"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {task.status === "optimizing" && (
                                <>
                                  <Spinner className="w-4 h-4" />
                                  <span className="text-sm text-muted-foreground">
                                    Optimizing...
                                  </span>
                                </>
                              )}
                              {task.status === "generating" && (
                                <>
                                  <Spinner className="w-4 h-4" />
                                  <span className="text-sm text-muted-foreground">
                                    Generating...
                                  </span>
                                </>
                              )}
                              {task.status === "success" && (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <span className="text-sm text-green-600">
                                    Completed
                                  </span>
                                </>
                              )}
                              {task.status === "failed" && (
                                <>
                                  <AlertCircle className="w-4 h-4 text-red-600" />
                                  <span className="text-sm text-red-600">
                                    Failed
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {(elapsedTime[task.id] || task.elapsedMs || 0) / 1000}s
                            </div>
                          </div>

                          <p className="text-sm text-foreground line-clamp-2 mb-2">
                            {task.optimizedPrompt || task.originalPrompt}
                          </p>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{task.params.size}</span>
                            <span>•</span>
                            <span>{task.params.format.toUpperCase()}</span>
                            <span>•</span>
                            <span>{task.images.length} images</span>
                          </div>

                          {task.errorMessage && (
                            <p className="text-xs text-red-600 mt-2">
                              {task.errorMessage}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                          {task.status === "success" && task.images[0]?.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleDownloadImage(
                                  task.images[0]?.url,
                                  0
                                )
                              }
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleFavorite(task.id)}
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                task.isFavorite
                                  ? "fill-red-500 text-red-500"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedImage}
              alt="Full size"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
