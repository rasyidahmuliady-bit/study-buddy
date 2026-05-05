import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { 
  Clock, 
  Target, 
  RotateCcw, 
  ChevronRight, 
  ArrowLeft,
  BrainCircuit
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * StudySetup Page
 * Allows students to choose their study technique before starting.
 * This is a requirement for the "Study Mode Selection" feature.
 */
export default function StudySetup() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const materialId = queryParams.get("id");

  const [material, setMaterial] = useState<any>(null);
  const [selectedMode, setSelectedMode] = useState<string>("focus");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!materialId) {
      navigate("/materials");
      return;
    }
    fetchMaterial();
  }, [materialId]);

  const fetchMaterial = async () => {
    try {
      const docSnap = await getDoc(doc(db, "materials", materialId!));
      if (docSnap.exists()) {
        setMaterial(docSnap.data());
      } else {
        navigate("/materials");
      }
    } catch (error) {
      console.error("Error fetching material:", error);
    } finally {
      setLoading(false);
    }
  };

  const studyModes = [
    {
      id: "pomodoro",
      name: "Pomodoro Mode",
      icon: Clock,
      description: "20-minute study session with a countdown. Ideal for high focus.",
      color: "text-red-500",
      bg: "bg-red-50",
      border: "border-red-200"
    },
    {
      id: "focus",
      name: "Focus Mode",
      icon: Target,
      description: "No timer. Study at your own pace and start the quiz manually.",
      color: "text-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-200"
    },
    {
      id: "spaced",
      name: "Spaced Repetition",
      icon: RotateCcw,
      description: "Focuses on reviewing content you find difficult. Allows re-quizzing.",
      color: "text-purple-500",
      bg: "bg-purple-50",
      border: "border-purple-200"
    }
  ];

  const handleStart = () => {
    // Navigate to the AI Study page with the selected mode as a parameter
    navigate(`/ai-study?id=${materialId}&mode=${selectedMode}`);
  };

  if (loading) return <div className="flex items-center justify-center p-20">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Button variant="ghost" size="sm" onClick={() => navigate("/materials")} className="gap-2">
        <ArrowLeft size={16} />
        Back to Materials
      </Button>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Choose Your Study Mode</h1>
        <p className="text-muted-foreground">Select a technique to study "{material?.fileName}"</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {studyModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setSelectedMode(mode.id)}
            className={cn(
              "text-left p-6 rounded-2xl border-2 transition-all group relative",
              selectedMode === mode.id 
                ? cn(mode.border, "ring-2 ring-primary bg-card scale-[1.02] shadow-md") 
                : "border-border hover:border-muted-foreground bg-muted/30 opacity-70 hover:opacity-100"
            )}
          >
            {selectedMode === mode.id && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-primary text-white">Selected</Badge>
              </div>
            )}
            <div className={cn("inline-flex p-3 rounded-xl mb-4", mode.bg)}>
              <mode.icon className={mode.color} size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">{mode.name}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{mode.description}</p>
          </button>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <BrainCircuit className="text-primary" size={24} />
            </div>
            <div>
              <p className="font-bold">Ready to Start?</p>
              <p className="text-sm text-muted-foreground">You are about to start a session in <b>{studyModes.find(m => m.id === selectedMode)?.name}</b>.</p>
            </div>
          </div>
          <Button size="lg" className="rounded-full px-8 gap-2 group" onClick={handleStart}>
            Start Studying
            <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Button>
        </CardContent>
      </Card>
      
      <div className="text-center p-4">
        <p className="text-xs text-muted-foreground">
          Note: Your progress and scores will be tracked differently based on the mode selected.
        </p>
      </div>
    </div>
  );
}
