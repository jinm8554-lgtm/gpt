import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import MainLayout from "@/components/MainLayout";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Sparkles,
  Download,
  Heart,
  Trash2,
  Search,
  Filter,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
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

const SIZES = {
  "1:1": ["1024x1024", "2048x2048"],
  "3:2": ["1536x1024", "2160x1440"],
  "2:3": ["1024x1536", "1440x2160"],
  "16:9": ["1280x720", "2560x1440"],
  "9:16": ["720x1280", "1440x2560"],
};

export default function AIImageGenerator() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [format, setFormat] = useState("png");
  const [compression, setCompression] = useState(0);
  const [moderation, setModeration] = useState("auto");
  const [count, setCount] = useState(1);
  const [optimizePrompt, setOptimizePrompt] = useState(true);
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const optimizeMutation = trpc.aiImage.optimize.useMutation();
  const generateMutation = trpc.aiImage.generate.useMutation();

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
    abortControllerRef.current = new AbortController();

    try {
      let finalPrompt = prompt;

      if (optimizePrompt) {
        try {
          const optimizeResult = await optimizeMutation.mutateAsync({
            prompt,
          });

          // Extract optimized prompt from SSE events
          const optimizedEvent = optimizeResult.find(
            (e: any) => e.type === "prompt_optimized"
          );
          if (optimizedEvent && typeof optimizedEvent === "object" && "optimized_prompt" in optimizedEvent && typeof (optimizedEvent as any).optimized_prompt === "string") {
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
          toast.error("Failed to optimize prompt");
          return;
        }
      }

      // Generate images
      const generateResult = await generateMutation.mutateAsync({
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        size,
        quality,
        n: count,
        optimize_prompt: false,
        output_format: format,
        output_compression: compression || null,
        moderation,
      });

      // Extract images from SSE events
      const completedEvent = generateResult.find(
        (e: any) => e.type === "image_completed"
      );
      const images = (completedEvent && typeof completedEvent === "object" && "images" in completedEvent && Array.isArray((completedEvent as any).images)) ? (completedEvent as any).images : [];

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "success",
                images,
                completedAt: Date.now(),
                elapsedMs: Date.now() - newTask.startedAt,
              }
            : t
        )
      );

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
  };

  const handleToggleFavorite = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, isFavorite: !t.isFavorite } : t
      )
    );
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

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
            <Card className="p-6 shadow-elegant-md sticky top-8">
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
                    {SIZES[aspectRatio as keyof typeof SIZES]?.map((s) => (
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

                {/* Count */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Count
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={count}
                    onChange={(e) => setCount(Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))}
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
                  {optimizeMutation.isPending || generateMutation.isPending ? (
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

          {/* Results Grid */}
          <div className="lg:col-span-2">
            {tasks.length === 0 ? (
              <Card className="p-12 text-center shadow-elegant-md">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  No images generated yet. Start by entering a prompt above.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => (
                  <Card
                    key={task.id}
                    className="p-4 shadow-elegant-md hover:shadow-elegant-lg transition-smooth"
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                          {task.elapsedMs && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {(task.elapsedMs / 1000).toFixed(1)}s
                            </div>
                          )}
                        </div>

                        <p className="text-sm text-foreground line-clamp-2 mb-2">
                          {task.optimizedPrompt || task.originalPrompt}
                        </p>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {task.params.size} • {task.params.format}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
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
    </MainLayout>
  );
}
