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
  const [pomodoroDuration, setPomodoroDuration] = useState<number>(20);
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
      description: "Timed study sessions with breaks and quizzes after each completed chunk.",
      details: "Choose your session length. After each timer ends, take a 5-minute break or jump into a quiz.",
      color: "text-red-500",
      bg: "bg-red-50",
      border: "border-red-200"
    },
    {
      id: "focus",
      name: "Focus Mode",
      icon: Target,
      description: "Self-paced learning without timer pressure.",
      details: "No countdown. Move through content at your own speed and start the quiz when you feel ready.",
      color: "text-blue-500",
      bg: "bg-blue-50",
      border: "border-blue-200"
    },
    {
      id: "spaced",
      name: "Spaced Repetition",
      icon: RotateCcw,
      description: "Review weak topics using repeated AI-generated quizzes.",
      details: "AI focuses on concepts you struggled with in past quizzes. Best for long-term retention.",
      color: "text-purple-500",
      bg: "bg-purple-50",
      border: "border-purple-200"
    }
  ];

  const handleStart = () => {
    // Navigate to the AI Study page with the selected mode and pomodoro duration as parameters
    navigate(`/ai-study?id=${materialId}&mode=${selectedMode}${selectedMode === 'pomodoro' ? `&duration=${pomodoroDuration}` : ''}`);
  };

  if (loading) return <div className="flex items-center justify-center p-20">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <Button variant="ghost" size="sm" onClick={() => navigate("/ai-study")} className="gap-2 hover:bg-primary/5 transition-colors">
        <ArrowLeft size={16} />
        Back to AI Study Hub
      </Button>

      <div className="text-center space-y-3">
        <h1 className="text-4xl font-black tracking-tight text-primary">Optimize Your Learning</h1>
        <p className="text-muted-foreground text-lg">Choose a study mode that matches your learning style today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {studyModes.map((mode) => (
          <div
            key={mode.id}
            onClick={() => setSelectedMode(mode.id)}
            className={cn(
              "text-left p-8 rounded-[2rem] border-2 transition-all group relative cursor-pointer flex flex-col h-full",
              selectedMode === mode.id 
                ? cn(mode.border, "ring-4 ring-primary/10 bg-card scale-[1.02] shadow-xl") 
                : "border-border hover:border-muted-foreground/30 bg-muted/20 opacity-80 hover:opacity-100"
            )}
          >
            {selectedMode === mode.id && (
              <div className="absolute top-4 right-4">
                <Badge className="bg-primary text-white border-none px-3 py-1 scale-110">Active</Badge>
              </div>
            )}
            <div className={cn("inline-flex p-4 rounded-2xl mb-6 w-fit", mode.bg)}>
              <mode.icon className={mode.color} size={28} />
            </div>
            <h3 className="text-xl font-black mb-3 group-hover:text-primary transition-colors">{mode.name}</h3>
            <p className="text-sm font-semibold mb-4 leading-relaxed">{mode.description}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-auto flex-grow-0 pt-4 border-t border-border/50 italic opacity-70">
              {mode.details}
            </p>
          </div>
        ))}
      </div>

      {selectedMode === "pomodoro" && (
        <Card className="rounded-[2rem] border-red-100 bg-red-50/30 animate-in slide-in-from-bottom-4 duration-300">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-red-600 flex items-center justify-center gap-2">
              <Clock size={16} />
              Customize Timer
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center gap-3 p-6 pt-2">
            {[15, 20, 25, 30].map((mins) => (
              <Button
                key={mins}
                type="button"
                variant={pomodoroDuration === mins ? "default" : "outline"}
                className={cn(
                  "rounded-full px-6 h-12 font-bold transition-all",
                  pomodoroDuration === mins ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200" : "border-red-200 text-red-600 hover:bg-red-50"
                )}
                onClick={() => setPomodoroDuration(mins)}
              >
                {mins} min
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[2.5rem] border-primary/20 bg-primary/5 shadow-2xl shadow-primary/5 overflow-hidden">
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
