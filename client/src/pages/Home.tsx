import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to generate page
  useEffect(() => {
    if (isAuthenticated && !loading) {
      setLocation("/generate");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <Sparkles className="w-8 h-8 mx-auto text-primary" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // Will redirect to /generate
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <Sparkles className="w-16 h-16 mx-auto text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-4">AI Image Generator</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Create stunning images with advanced AI technology. Sign in to get started.
        </p>
        <Button
          size="lg"
          onClick={() => (window.location.href = getLoginUrl())}
          className="w-full"
        >
          Sign In with Manus
        </Button>
      </div>
    </div>
  );
}
