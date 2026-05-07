import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { generateStudyChunks, generateVideoRecommendations } from "@/lib/gemini";
import { 
  BrainCircuit, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  BookOpen,
  CheckCircle2,
  ArrowLeft,
  Clock,
  Pause,
  Play,
  AlertCircle,
  RotateCcw,
  Target,
  Trophy,
  FileText,
  Search,
  Filter,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { VisualSummary } from "@/components/VisualSummary";

export default function AIStudy() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const materialId = queryParams.get("id");
  const mode = queryParams.get("mode") || "focus";
  const durationParam = queryParams.get("duration");
  const defaultDuration = durationParam ? parseInt(durationParam) * 60 : 20 * 60;

  const [material, setMaterial] = useState<any>(null);
  const [hubMaterials, setHubMaterials] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [chunks, setChunks] = useState<any[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hubLoading, setHubLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [startTime] = useState(Date.now());
  const [sessionDuration, setSessionDuration] = useState(defaultDuration);
  const [timeLeft, setTimeLeft] = useState(defaultDuration); 
  const [timerActive, setTimerActive] = useState(mode === "pomodoro");
  const [isPaused, setIsPaused] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [chunkStartTime, setChunkStartTime] = useState(Date.now());
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [showPomodoroDialog, setShowPomodoroDialog] = useState(false);
  const [showStudyCompleteDialog, setShowStudyCompleteDialog] = useState(false);
  const [maxCompletedIndex, setMaxCompletedIndex] = useState(0);
  const [isBreak, setIsBreak] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(5 * 60); // 5 minute break
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [verifiedRecommendations, setVerifiedRecommendations] = useState<any[]>([]);

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [subjectDropdownSearch, setSubjectDropdownSearch] = useState("");

  // Requirement #3: Session Control - Save progress to Firestore
  const saveSessionProgress = async (index: number, timeRem: number, studyChunks: any[] = chunks) => {
    if (!auth.currentUser || !materialId) return;
    
    try {
      const sessionId = `${auth.currentUser.uid}_${materialId}`;
      await setDoc(doc(db, "sessions", sessionId), {
        userId: auth.currentUser.uid,
        materialId,
        currentChunkIndex: index,
        timeLeft: timeRem,
        sessionDuration,
        mode,
        chunks: studyChunks, // Save the actual content chunks to avoid regeneration
        lastUpdated: new Date().toISOString(),
        completionPercentage: studyChunks.length > 0 ? Math.round(((index + 1) / studyChunks.length) * 100) : 0
      });
    } catch (error) {
      console.error("Error saving session:", error);
    }
  };

  // EFFECT: Handle study session logic and timers
  useEffect(() => {
    let interval: any;
    // Requirement #4: Pomodoro Timer Handling with Pause/Resume
    if (timerActive && !isPaused && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          const newTime = prev - 1;
          // Periodically save timer state (every 30 seconds)
          if (newTime % 30 === 0) saveSessionProgress(currentChunkIndex, newTime);
          return newTime;
        });
      }, 1000);
    } else if (timeLeft === 0 && !isBreak) {
      setTimerActive(false);
      // Requirement: Show completion dialog when timer ends
      if (mode === "pomodoro") {
        setShowPomodoroDialog(true);
      }
    }
    return () => clearInterval(interval);
  }, [timerActive, isPaused, timeLeft, isBreak]);

  // EFFECT: Handle Break Timer
  useEffect(() => {
    let interval: any;
    if (isBreak && breakTimeLeft > 0 && !isPaused) {
      interval = setInterval(() => {
        setBreakTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isBreak && breakTimeLeft === 0) {
      setIsBreak(false);
      setShowPomodoroDialog(true); // Show options again after break
    }
    return () => clearInterval(interval);
  }, [isBreak, breakTimeLeft, isPaused]);

  const handleFinishSession = async (showQuiz: boolean = true) => {
    if (!showQuiz) {
      // Only delete if they are explicitly exiting without taking a quiz
      if (auth.currentUser && materialId) {
        try {
          const sessionId = `${auth.currentUser.uid}_${materialId}`;
          await deleteDoc(doc(db, "sessions", sessionId));
        } catch (e) {
          console.error("Error deleting session:", e);
        }
      }
      navigate("/dashboard");
      return;
    }

    const studyTime = Math.round((Date.now() - startTime) / 1000);
    
    // Requirement: Quiz should only cover content studied so far
    let quizUrl = `/quiz?id=${materialId}&studyTime=${studyTime}&mode=${mode}&duration=${sessionDuration / 60}`;
    
    // If not on the last chunk, tell the quiz to only use content up to current index
    if (currentChunkIndex < chunks.length - 1) {
      quizUrl += `&limitIndex=${currentChunkIndex}`;
    }
    
    navigate(quizUrl);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const simplifyTopic = (topic: string) => {
    return topic
      .replace(/Foundations of|Global Philosophy of|Introduction to|Principles of|The history of|Overview of/gi, '')
      .replace(/and its applications|in the modern world|for university students/gi, '')
      .trim();
  };

  const checkVideoAvailability = (url: string): Promise<boolean> => {
    const videoId = url.match(/(?:v=|\/embed\/|youtu\.be\/)([^&?#/]+)/)?.[1];
    if (!videoId) return Promise.resolve(false);
    
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        // YouTube returns a 120x90 "not found" icon for invalid video IDs
        if (img.naturalWidth === 120 && img.naturalHeight === 90) {
          resolve(false);
        } else {
          resolve(true);
        }
      };
      // Try primary domain, then fallback domain
      img.onerror = () => {
        const fallbackImg = new Image();
        fallbackImg.referrerPolicy = "no-referrer";
        fallbackImg.onload = () => {
          if (fallbackImg.naturalWidth === 120 && fallbackImg.naturalHeight === 90) {
            resolve(false);
          } else {
            resolve(true);
          }
        };
        fallbackImg.onerror = () => resolve(false);
        fallbackImg.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      };
      // mqdefault.jpg is 320x180 for valid videos, and 120x90 for invalid ones
      img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    });
  };

  // Safe YouTube Thumbnail component with fallbacks for production reliability
  const YouTubeThumbnail = ({ videoId, title }: { videoId: string, title: string }) => {
    const [src, setSrc] = useState(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    const [errorCount, setErrorCount] = useState(0);

    const handleError = () => {
      if (errorCount === 0) {
        // Fallback to alternative YouTube domain
        setSrc(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
        setErrorCount(1);
      } else {
        // Second failure - show generic placeholder
        setErrorCount(2);
      }
    };

    if (errorCount >= 2) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2 border border-slate-200">
          <Play size={32} className="opacity-20" fill="currentColor" />
          <div className="text-center px-4">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Thumbnail</p>
            <p className="text-[9px] font-bold uppercase tracking-tight opacity-40">Unavailable</p>
          </div>
        </div>
      );
    }

    return (
      <img 
        src={src} 
        alt={title}
        referrerPolicy="no-referrer"
        onError={handleError}
        className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
      />
    );
  };


  useEffect(() => {
    if (auth.currentUser) {
      if (!materialId) {
        fetchHubData();
      } else {
        fetchMaterial();
      }
    }
  }, [materialId, auth.currentUser]);

  const fetchHubData = async () => {
    if (!auth.currentUser) return;
    setHubLoading(true);
    try {
      // Fetch all materials
      const materialsQuery = query(
        collection(db, "materials"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("uploadDate", "desc")
      );
      const materialsSnap = await getDocs(materialsQuery);
      const materialsData = materialsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHubMaterials(materialsData);

      // Fetch all sessions to show progress
      const sessionsQuery = query(
        collection(db, "sessions"),
        where("userId", "==", auth.currentUser.uid)
      );
      const sessionsSnap = await getDocs(sessionsQuery);
      const sessionsMap: Record<string, any> = {};
      sessionsSnap.forEach(doc => {
        const data = doc.data();
        sessionsMap[data.materialId] = data;
      });
      setSessions(sessionsMap);
    } catch (error) {
      console.error("Hub fetch error:", error);
    } finally {
      setHubLoading(false);
    }
  };

  const fetchMaterial = async () => {
    if (!materialId || !auth.currentUser) return;

    try {
      // First, check if we have a session to resume
      // We do this BEFORE setting any loading state to ensure instant resume
      const sessionId = `${auth.currentUser.uid}_${materialId}`;
      const sessionDoc = await getDoc(doc(db, "sessions", sessionId));
      
      let isResuming = false;
      let startIdx = 0;
      let timeRem = defaultDuration;
      let dur = defaultDuration;
      let existingChunks: any[] = [];

      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        if (sessionData.chunks && sessionData.chunks.length > 0) {
          startIdx = sessionData.currentChunkIndex || 0;
          timeRem = sessionData.timeLeft || defaultDuration;
          dur = sessionData.sessionDuration || defaultDuration;
          existingChunks = sessionData.chunks;
          isResuming = true;
        }
      }

      const docSnap = await getDoc(doc(db, "materials", materialId!));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMaterial(data);

        if (isResuming) {
          // Instant resume: set state and we're done
          setChunks(existingChunks);
          setCurrentChunkIndex(startIdx);
          setSessionDuration(dur);
          setTimeLeft(timeRem);
          setSessionLoaded(true);
          setSessionChecked(true);
          setLoading(false);
        } else {
          // Not resuming: show loading and generate
          setLoading(true);
          setSessionChecked(true); // Allow transition to loading screen
          
          let identifiedWeakTopics: string[] = [];
          if (mode === "spaced") {
            const progressQuery = query(
              collection(db, "progress"),
              where("userId", "==", auth.currentUser.uid),
              where("quizId", "==", materialId),
              orderBy("completionDate", "desc"),
              limit(1)
            );
            const progressSnap = await getDocs(progressQuery);
            if (!progressSnap.empty) {
              identifiedWeakTopics = progressSnap.docs[0].data().weakTopics || [];
              setWeakTopics(identifiedWeakTopics);
            }
          }
          await generateChunks(data.content, identifiedWeakTopics, startIdx, timeRem);
        }
      } else {
        navigate("/materials");
        setLoading(false);
        setSessionChecked(true);
      }
    } catch (error) {
      console.error("Error fetching material:", error);
      handleFirestoreError(error, OperationType.GET, `materials/${materialId}`);
      setLoading(false);
    }
  };

  const generateChunks = async (content: string, weakTopics: string[], startIdx: number, timeRem: number) => {
    setGenerating(true);
    try {
      const result = await generateStudyChunks(content, weakTopics);
      setChunks(result);
      setCurrentChunkIndex(startIdx);
      setTimeLeft(timeRem);
      // Save chunks to session immediately after generation
      await saveSessionProgress(startIdx, timeRem, result);
    } catch (error) {
      console.error("Error generating chunks:", error);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleNextChunk = () => {
    // Requirement #2: Pomodoro Mode - Restrict skipping
    if (mode === "pomodoro") {
      const timeSpentOnChunk = (Date.now() - chunkStartTime) / 1000;
      // If spent less than 30 seconds on a chunk, discourage skipping
      if (timeSpentOnChunk < 30) {
        setShowSkipWarning(true);
        setTimeout(() => setShowSkipWarning(false), 3000);
        return;
      }
    }

    const nextIdx = currentChunkIndex + 1;
    if (nextIdx < chunks.length) {
      setCurrentChunkIndex(nextIdx);
      setMaxCompletedIndex(Math.max(maxCompletedIndex, nextIdx));
      setChunkStartTime(Date.now());
      saveSessionProgress(nextIdx, timeLeft);
    }
  };

  const handlePrevChunk = () => {
    // Requirement: Pomodoro users should be able to go to previous chunks
    const prevIdx = currentChunkIndex - 1;
    if (prevIdx >= 0) {
      setCurrentChunkIndex(prevIdx);
      saveSessionProgress(prevIdx, timeLeft);
    }
  };

  const handleTakeBreak = () => {
    setShowPomodoroDialog(false);
    setIsBreak(true);
    setBreakTimeLeft(5 * 60);
    setTimerActive(false); // Stop study timer during break
  };

  const handleContinueStudying = (restartTimer: boolean = true) => {
    setShowPomodoroDialog(false);
    setIsBreak(false);
    if (restartTimer) {
      setTimeLeft(sessionDuration); 
      setTimerActive(true);
    } else {
      setTimerActive(false);
    }
  };

  const progress = chunks.length > 0 ? ((currentChunkIndex + 1) / chunks.length) * 100 : 0;
  const currentChunk = chunks[currentChunkIndex];

  useEffect(() => {
    const fetchRecs = async () => {
      if (!currentChunk || !material) return;
      
      setRecsLoading(true);
      setVerifiedRecommendations([]);
      try {
        const recs = await generateVideoRecommendations(
          currentChunk.title,
          material.subject,
          currentChunk.content
        );
        
        if (recs && recs.length > 0) {
          // Validate each recommendation
          const validationResults = await Promise.all(
            recs.map(async (video: any) => {
              const isAvailable = await checkVideoAvailability(video.url);
              return isAvailable ? video : null;
            })
          );
          
          const validRecs = validationResults.filter(v => v !== null);
          setVerifiedRecommendations(validRecs);
        } else {
          setVerifiedRecommendations([]);
        }
        
        setRecommendations(recs || []);
      } catch (error) {
        console.error("Error fetching recommendations:", error);
        setRecommendations([]);
        setVerifiedRecommendations([]);
      } finally {
        setRecsLoading(false);
      }
    };

    fetchRecs();
  }, [currentChunkIndex, chunks, material]);

  if (materialId && !loading && chunks.length === 0 && sessionChecked) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="h-12 w-12 text-destructive opacity-50" />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Generation Failed</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            We couldn't break down this material into study chunks. This might be due to a technical error or incompatible content.
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            className="mt-4 rounded-full px-8 border-2"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const formatMarkdown = (text: string) => {
    if (!text) return "";
    return text.trim();
  };

  if (materialId && !sessionChecked) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center animate-in fade-in duration-300">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (materialId && loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500">
        <div className="relative">
          <Loader2 className="h-20 w-20 animate-spin text-primary opacity-20" />
          <BrainCircuit className="absolute inset-0 m-auto h-10 w-10 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-primary">Preparing your study session...</h2>
          <p className="text-muted-foreground text-lg font-medium">AI is breaking down your material into manageable chunks.</p>
        </div>
      </div>
    );
  }

  // Hub View (List of Materials)
  if (!materialId) {
    const rawSubjects = [...new Set(hubMaterials.map(m => m.subject).filter(Boolean))];
    const topSubjects = ["all", ...rawSubjects.slice(0, 3)];
    const otherSubjects = rawSubjects.slice(3);
    
    // Sort other subjects for the dropdown
    const displayOtherSubjects = otherSubjects
      .filter(s => s.toLowerCase().includes(subjectDropdownSearch.toLowerCase()))
      .sort();

    const filteredMaterials = hubMaterials.filter((m) => {
      const session = sessions[m.id];
      const progress = session?.completionPercentage || 0;
      
      // Status check
      let statusMatch = true;
      if (selectedStatus === "not-started") statusMatch = progress === 0;
      else if (selectedStatus === "in-progress") statusMatch = progress > 0 && progress < 100;
      else if (selectedStatus === "completed") statusMatch = progress === 100;

      // Subject check
      const subjectMatch = selectedSubject === "all" || m.subject === selectedSubject;

      // Search check
      const searchMatch = m.fileName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (m.subject && m.subject.toLowerCase().includes(searchQuery.toLowerCase()));

      return statusMatch && subjectMatch && searchMatch;
    });

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Learning Hub</h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <BrainCircuit size={16} />
              Select a material to start your AI-powered study session
            </p>
          </div>
          <Button onClick={() => navigate("/materials")} variant="outline" className="gap-2 border-2 rounded-full px-6">
            <BookOpen size={18} />
            Manage Materials
          </Button>
        </div>

        {/* Filters Section */}
        <div className="space-y-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input 
              placeholder="Search materials or subjects..." 
              className="pl-12 h-12 bg-background border-border/50 rounded-2xl shadow-sm focus-visible:ring-primary/20 text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="space-y-4">
          <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Subject</span>
              <div className="flex flex-wrap items-center gap-2">
                {topSubjects.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSubject(s)}
                    className={cn(
                      "px-5 py-2 rounded-full text-sm font-medium transition-all border shrink-0",
                      selectedSubject === s 
                        ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                        : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    {s === "all" ? "All Subjects" : s}
                  </button>
                ))}

                {rawSubjects.length > 3 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        "px-5 py-2 rounded-full text-sm font-medium transition-all border flex items-center gap-2 shrink-0 cursor-pointer",
                        otherSubjects.includes(selectedSubject)
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                      )}
                    >
                      {otherSubjects.includes(selectedSubject) ? selectedSubject : `+ ${rawSubjects.length - 3} More`}
                      <ChevronRight className={cn("w-4 h-4 transition-transform", "rotate-90")} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64 p-2 !rounded-2xl shadow-xl">
                      <div className="p-2 pt-1 pb-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Find subject..."
                            className="h-8 pl-7 text-xs rounded-lg bg-muted/50 border-none focus-visible:ring-1"
                            value={subjectDropdownSearch}
                            onChange={(e) => setSubjectDropdownSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <div className="max-h-[250px] overflow-y-auto">
                        {displayOtherSubjects.length > 0 ? (
                          displayOtherSubjects.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              className={cn(
                                "flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer",
                                selectedSubject === s && "bg-primary/10 text-primary font-bold"
                              )}
                              onClick={() => setSelectedSubject(s)}
                            >
                              {s}
                              {selectedSubject === s && <CheckCircle2 size={14} />}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="text-[10px] text-center py-4 text-muted-foreground italic">
                            No matching subjects
                          </div>
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Status</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All Progress" },
                  { id: "not-started", label: "Not Started" },
                  { id: "in-progress", label: "In Progress" },
                  { id: "completed", label: "Completed" }
                ].map((status) => (
                  <button
                    key={status.id}
                    onClick={() => setSelectedStatus(status.id)}
                    className={cn(
                      "px-5 py-2 rounded-full text-sm font-medium transition-all border",
                      selectedStatus === status.id 
                        ? "bg-primary text-primary-foreground border-primary shadow-md" 
                        : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                    )}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {hubLoading ? (
          <div className="py-20 flex flex-col items-center gap-4 animate-in fade-in">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">Fetching materials...</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <Card className="border-dashed border-2 py-20 text-center !rounded-[32px] bg-muted/20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
                {searchQuery || selectedSubject !== "all" || selectedStatus !== "all" ? <Search size={40} /> : <BookOpen size={40} />}
              </div>
              <h2 className="text-2xl font-black">
                {searchQuery || selectedSubject !== "all" || selectedStatus !== "all" ? "No matches found" : "Ready to Start?"}
              </h2>
              <p className="text-muted-foreground max-w-sm mx-auto font-medium">
                {searchQuery || selectedSubject !== "all" || selectedStatus !== "all" 
                  ? "Try adjusting your filters or search query to find what you're looking for." 
                  : "Upload a material to begin your first study session and choose a study mode that matches your learning style."}
              </p>
              {hubMaterials.length > 0 && (searchQuery || selectedSubject !== "all" || selectedStatus !== "all") ? (
                <Button 
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSubject("all");
                    setSelectedStatus("all");
                  }} 
                  variant="link" 
                  className="text-primary font-bold"
                >
                  Clear all filters
                </Button>
              ) : hubMaterials.length === 0 ? (
                <Button onClick={() => navigate("/materials")} className="mt-4 rounded-full px-8">
                  Upload Now
                </Button>
              ) : null}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMaterials.map((m) => {
              const session = sessions[m.id];
              const progress = session?.completionPercentage || 0;
              
              return (
                <motion.div
                  key={m.id}
                  whileHover={{ y: -5 }}
                  className="group"
                >
                  <Card className="h-full border-border/50 hover:border-primary/50 hover:shadow-2xl transition-all !rounded-[24px] overflow-hidden flex flex-col">
                    <div className="p-6 flex-1 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                          <FileText size={24} />
                        </div>
                        {progress > 0 && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                            In Progress
                          </Badge>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-bold line-clamp-1 group-hover:text-primary transition-colors">{m.fileName}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Badge variant="secondary" className="font-normal text-[10px] uppercase tracking-wider">
                            {m.subject || "No Subject"}
                          </Badge>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                          <span>Progress</span>
                          <span className="text-primary">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5 bg-muted" />
                      </div>

                      {session?.lastUpdated && (
                        <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                          <Clock size={10} />
                          Last studied: {new Date(session.lastUpdated).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    
                    <div className="p-4 bg-muted/30 border-t border-border/50">
                      <Button 
                        onClick={() => navigate(`/study-setup?id=${m.id}`)}
                        className="w-full gap-2 rounded-xl group-hover:shadow-lg transition-all"
                      >
                        <BrainCircuit size={18} />
                        Start Study
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4">
      {/* Study Completion Dialog */}
      {showStudyCompleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <Card className="max-w-md w-full shadow-2xl border-primary/20 scale-in-center overflow-hidden !rounded-3xl">
            <div className="bg-primary/10 p-8 text-center border-b border-primary/10">
              <div className="w-20 h-20 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg animate-bounce">
                <Trophy size={40} />
              </div>
              <CardTitle className="text-3xl font-bold text-primary">Great Job!</CardTitle>
              <CardDescription className="text-lg mt-2">
                You've successfully completed all {chunks.length} sections of this study material.
              </CardDescription>
            </div>
            <CardContent className="space-y-6 pt-8 pb-8 px-8">
              <div className="grid gap-4">
                <Button 
                  className="w-full gap-3 py-7 rounded-2xl text-lg shadow-lg" 
                  onClick={() => handleFinishSession(true)}
                >
                  <BrainCircuit size={22} />
                  Start the Quiz
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full gap-3 py-7 rounded-2xl text-lg border-2 hover:bg-muted/50" 
                  onClick={() => handleFinishSession(false)}
                >
                  <ArrowLeft size={22} />
                  Exit to Dashboard
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Your progress is saved. You can take the quiz later from the materials page.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pomodoro Completion Dialog */}
      {showPomodoroDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <Card className="max-w-md w-full shadow-2xl border-primary/20 scale-in-center overflow-hidden !rounded-3xl">
            <div className="bg-primary/5 p-8 text-center border-b border-border/50">
              <CardTitle className="text-3xl font-black flex items-center justify-center gap-3">
                <Clock className="text-primary animate-pulse" size={32} />
                Time to recharge!
              </CardTitle>
              <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
                  Great focus! You've reviewed <span className="text-primary font-bold">{currentChunkIndex + 1} / {chunks.length}</span> chunks.
                </p>
                <div className="w-full max-w-[250px] h-2 bg-muted rounded-full overflow-hidden mt-2 p-[2px]">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
                    style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            
            <CardContent className="space-y-4 pt-8 pb-10 px-8">
              <Button 
                className="w-full h-16 rounded-[1.25rem] font-bold shadow-lg shadow-primary/20 gap-3 text-lg" 
                onClick={() => handleFinishSession(true)}
              >
                <BrainCircuit size={24} />
                Validate Learning (Start Quiz)
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="secondary" 
                  className="flex flex-col h-auto py-5 rounded-2xl font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 gap-1 shadow-sm" 
                  onClick={handleTakeBreak}
                >
                  <div className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>Take Break</span>
                  </div>
                  <span className="text-xs font-semibold opacity-70">5 Min Recharge</span>
                </Button>

                {currentChunkIndex + 1 < chunks.length ? (
                  <Button 
                    variant="outline" 
                    className="flex flex-col h-auto py-5 rounded-2xl font-bold border-2 hover:bg-muted/30 gap-1 shadow-sm transition-all" 
                    onClick={() => handleContinueStudying(true)}
                  >
                    <div className="flex items-center gap-2">
                      <Play size={16} />
                      <span>Continue</span>
                    </div>
                    <span className="text-xs font-semibold opacity-70">Resume timer</span>
                  </Button>
                ) : (
                  <Button 
                    variant="ghost" 
                    className="flex flex-col h-auto py-5 rounded-2xl font-bold gap-1 text-muted-foreground" 
                    onClick={() => handleFinishSession(false)}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowLeft size={16} />
                      <span>Finish</span>
                    </div>
                    <span className="text-xs font-semibold opacity-70">Exit to hub</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Break Time Screen Overlay */}
      {isBreak && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-green-600 animate-in fade-in duration-500">
          <div className="max-w-md w-full text-center text-white space-y-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-32 h-32 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto shadow-2xl relative"
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-4 border-white/30 border-t-white rounded-full"
              />
              <Clock size={60} />
            </motion.div>
            
            <div className="space-y-2">
              <h2 className="text-5xl font-black tracking-tight">Break Time</h2>
              <p className="text-xl text-green-100 font-medium">Rest your eyes, stretch a bit!</p>
            </div>

            <div className="text-8xl font-mono font-black tracking-tighter tabular-nums drop-shadow-lg">
              {formatTime(breakTimeLeft)}
            </div>

            <div className="pt-8">
              <Button 
                variant="outline" 
                size="lg" 
                className="bg-white text-green-600 hover:bg-green-50 border-none rounded-full px-10 py-7 text-xl font-bold shadow-xl"
                onClick={() => setIsBreak(false)}
              >
                Skip Break & Resume
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border/50 rounded-[2.5rem] p-6 md:p-8 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/ai-study")} className="w-fit h-7 px-2 -ml-2 mb-2 gap-1.5 text-muted-foreground hover:text-primary transition-all font-bold">
              <ArrowLeft size={14} />
              Exit to Hub
            </Button>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary border-none px-4 py-1 font-black text-[11px] uppercase tracking-wider">
                {mode} Mode Active
              </Badge>
              {sessionLoaded && (
                <Badge className="bg-blue-500 text-white border-none rounded-full px-3 py-0.5 text-[10px] font-bold animate-in fade-in">
                  Resumed Session
                </Badge>
              )}
            </div>
            <h1 className="text-lg md:text-xl lg:text-2xl font-black tracking-tight text-primary mt-1 font-sans">{material?.fileName}</h1>
          </div>

          <div className="flex items-center gap-4 self-end md:self-auto">
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "rounded-full gap-2 h-11 px-5 border-2 transition-all",
                isPaused ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "hover:bg-primary/5"
              )}
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
              <span className="font-bold">{isPaused ? "Resume Session" : "Pause Focus"}</span>
            </Button>

            {mode === "pomodoro" && (
              <div className={cn(
                "flex flex-col items-center justify-center min-w-[80px] h-11 px-4 rounded-full border-2 transition-all duration-500",
                timeLeft < 60 
                  ? "bg-red-50 border-red-300 text-red-600 animate-pulse shadow-lg shadow-red-100" 
                  : "bg-muted/20 border-border/50 text-foreground"
              )}>
                <div className="flex items-center gap-2">
                  <Clock size={16} className={timeLeft < 60 ? "text-red-500" : "text-primary"} />
                  <span className="text-lg font-mono font-black tabular-nums">{formatTime(timeLeft)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Course Coverage</span>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-primary">Chunk {currentChunkIndex + 1}</span>
                <span className="text-sm font-bold text-muted-foreground mt-1">of {chunks.length}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Mastery</span>
              <span className="text-xl font-black">{Math.round(progress)}%</span>
            </div>
          </div>
          <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden p-[2px]">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.3)]" 
            />
          </div>
        </div>
      </div>

          {mode === "spaced" && weakTopics.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-orange-50 border border-orange-100 p-4 rounded-2xl"
            >
              <div className="flex items-center gap-2 mb-2">
                <Target className="text-orange-600" size={18} />
                <span className="text-sm font-bold text-orange-800 uppercase tracking-widest">Review Focus Areas</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {weakTopics.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="bg-orange-200/50 text-orange-800 border-none rounded-full px-3 py-1 text-[10px] font-bold">
                    {topic}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-orange-700/70 mt-3 italic font-medium">
                AI has prioritized chunks containing these topics to help you master them.
              </p>
            </motion.div>
          )}
          
          {showSkipWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Alert variant="destructive" className="py-2 bg-red-50 border-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Focus Mode Active: Try to spend at least 30 seconds reviewing this section.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentChunkIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className={cn("relative p-1", isPaused && "blur-sm pointer-events-none transition-all")}
        >
          <Card className="border-border shadow-2xl min-h-[400px] flex flex-col relative overflow-hidden !rounded-[24px] p-0">
            {isPaused && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm !rounded-[24px]">
                <div className="text-center p-8 bg-card border border-border rounded-2xl shadow-xl">
                  <Clock className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">Session Paused</h3>
                  <p className="text-muted-foreground mb-6">Take a quick breather, then jump back in.</p>
                  <Button onClick={() => setIsPaused(false)} className="rounded-full px-8">
                    Resume Studying
                  </Button>
                </div>
              </div>
            )}
            <CardHeader className="border-b border-border bg-muted/40 px-8 py-6">
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl text-primary flex items-center gap-3">
                  <BookOpen size={26} strokeWidth={2.5} />
                  {chunks[currentChunkIndex]?.title}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter opacity-60 bg-background/50">
                  Adaptive Learning
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col lg:flex-row min-h-[600px]">
              <div className="flex-1 px-8 py-10 md:px-12 md:py-16 overflow-y-auto max-h-[1000px] scroll-smooth">
                <div className="prose prose-lg prose-slate dark:prose-invert max-w-none 
                  prose-headings:text-primary prose-headings:font-bold prose-headings:mt-8 prose-headings:mb-4
                  prose-h3:text-2xl prose-h3:mb-4
                  prose-p:leading-relaxed prose-p:mb-6 prose-p:text-slate-700 dark:prose-p:text-slate-300
                  prose-li:my-3 prose-li:text-slate-700 dark:prose-li:text-slate-300
                  prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:py-6 prose-blockquote:px-8 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:mt-8 prose-blockquote:mb-8
                  [&>*:first-child]:mt-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {formatMarkdown(chunks[currentChunkIndex]?.content)}
                  </ReactMarkdown>

                  {chunks[currentChunkIndex]?.visualData && (
                    <VisualSummary data={chunks[currentChunkIndex].visualData} />
                  )}
                </div>
              </div>

              {/* Dynamic Learning Resources */}
              <div className="w-full lg:w-96 bg-muted/30 border-l border-border/50 p-8 self-stretch">
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="text-primary animate-pulse" size={18} />
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary">Learning Resources</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-[11px] font-bold text-muted-foreground leading-tight px-1 italic">
                      AI-curated videos to help you master "{chunks[currentChunkIndex]?.title}":
                    </p>

                    {recsLoading ? (
                      <div className="py-12 flex flex-col items-center gap-3 animate-in fade-in">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Searching Knowledge...</p>
                      </div>
                    ) : verifiedRecommendations && verifiedRecommendations.length > 0 ? (
                      <div className="space-y-3">
                        {verifiedRecommendations.map((video, idx) => {
                          const videoId = video.url.match(/(?:v=|\/embed\/|youtu\.be\/)([^&?#/]+)/)?.[1] || "";
                          
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="group/card p-0 rounded-2xl bg-background border border-border/60 hover:border-primary/40 hover:shadow-lg transition-all duration-300 overflow-hidden"
                            >
                              <div className="aspect-video w-full relative overflow-hidden bg-muted">
                                <YouTubeThumbnail videoId={videoId} title={video.title} />
                                <div className="absolute inset-0 bg-black/5 group-hover/card:bg-black/0 transition-colors" />
                                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                  YouTube
                                </div>
                              </div>

                              <div className="p-3 space-y-2">
                                <div>
                                  <h4 className="text-sm font-bold leading-tight line-clamp-2 group-hover/card:text-primary transition-colors">
                                    {video.title}
                                  </h4>
                                  <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-tight">
                                    {video.channel}
                                  </p>
                                </div>
                                <a 
                                  href={video.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="mt-1 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary/5 hover:bg-primary text-primary hover:text-white transition-all text-xs font-black uppercase tracking-widest"
                                >
                                  <Play size={14} fill="currentColor" className="group-hover/card:animate-pulse" />
                                  Watch Video
                                </a>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-10 px-4 text-center space-y-4 animate-in fade-in">
                        <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center mx-auto mb-2 opacity-30">
                          <AlertCircle size={18} className="text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-700 leading-tight">
                            We could not find verified videos for this topic yet.
                          </p>
                          <p className="text-xs text-muted-foreground italic px-4">
                            You can manually search for educational resources on YouTube.
                          </p>
                        </div>
                        
                        <div className="pt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="w-full h-auto min-h-10 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wide border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 flex items-center justify-center gap-2 whitespace-normal leading-tight text-center"
                            onClick={() => {
                              const simplifiedTopic = simplifyTopic(currentChunk?.title || "");
                              window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(simplifiedTopic + " educational")}`, "_blank");
                            }}
                          >
                            <Search size={14} className="shrink-0" />
                            <span>
                              Search YouTube: <span className="text-primary/70">{simplifyTopic(currentChunk?.title || "")}</span>
                            </span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {!recsLoading && verifiedRecommendations.length > 0 && (
                      <div className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                        <h4 className="text-xs font-black uppercase mb-2 text-primary flex items-center gap-2">
                          <BrainCircuit size={14} />
                          Pro Mastery Tip
                        </h4>
                        <p className="text-xs leading-relaxed text-slate-600 font-medium italic">
                          "Visual learning reinforces the mental models you build during reading. Watch at least one of these to solidify today's session."
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-6 opacity-30">
                    <BrainCircuit size={32} className="text-primary/20 mx-auto" />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-6 border-t border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={handlePrevChunk}
                  disabled={currentChunkIndex === 0}
                  className="gap-2 h-9"
                >
                  <ChevronLeft size={18} />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-background/50 px-4 py-2 rounded-full border border-border">
                  {currentChunkIndex + 1} / {chunks.length}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Focus Mode: Allow start quiz anytime */}
                {mode === "focus" && (
                  <Button 
                    variant="secondary"
                    className="gap-2 h-9"
                    onClick={() => handleFinishSession()}
                  >
                    <Target size={16} className="hidden sm:inline" />
                    Quiz Now
                  </Button>
                )}

                {currentChunkIndex === chunks.length - 1 ? (
                  <Button 
                    className="gap-2 bg-green-600 hover:bg-green-700 h-9"
                    onClick={() => setShowStudyCompleteDialog(true)}
                  >
                    <CheckCircle2 size={18} />
                    Complete
                  </Button>
                ) : (
                  <Button 
                    onClick={handleNextChunk}
                    className="gap-2 h-9"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight size={18} />
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </AnimatePresence>

      <Card className="border-border/40 shadow-sm bg-muted/5 p-8 md:p-10 mb-6 rounded-[2.5rem]">
        <div className="flex items-center gap-3 mb-6">
          <BrainCircuit className="text-primary" size={24} />
          <h3 className="text-xl font-black tracking-tight">
            How {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode works
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div className="space-y-3 p-6 rounded-[2rem] bg-white shadow-sm border border-border/50 transition-all hover:shadow-md">
            <h4 className="font-black flex items-center gap-2 text-primary">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-black">1</div>
              Smart Chunking
            </h4>
            <p className="text-muted-foreground leading-relaxed font-medium">
              Our AI breaks your material into {chunks.length} manageable sections. Research shows that studying in smaller blocks improves retention by up to 40%.
            </p>
          </div>
          <div className="space-y-3 p-6 rounded-[2rem] bg-white shadow-sm border border-border/50 transition-all hover:shadow-md">
            <h4 className="font-black flex items-center gap-2 text-primary">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-black">2</div>
              {mode === "pomodoro" ? "Focus Timer" : mode === "spaced" ? "Retention Engine" : "Self-Paced Control"}
            </h4>
            <p className="text-muted-foreground leading-relaxed font-medium">
              {mode === "pomodoro" 
                ? "The deep-work timer ensures you stay fully present. Your navigation is focused on the current task to prevent mental fatigue." 
                : mode === "spaced" 
                ? "We automatically highlight concepts you missed previously, reinforcing neurological pathways for difficult information." 
                : "You have total freedom. Move through content as you wish and initiate the validation quiz whenever you're ready."}
            </p>
          </div>
          <div className="space-y-3 p-6 rounded-[2rem] bg-white shadow-sm border border-border/50 transition-all hover:shadow-md">
            <h4 className="font-black flex items-center gap-2 text-primary">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-black">3</div>
              Adaptive Testing
            </h4>
            <p className="text-muted-foreground leading-relaxed font-medium">
              {mode === "spaced" 
                ? "The quiz engine dynamically adjusts question difficulty based on your history, focusing on converting weak points into mastery." 
                : "The quiz only tests you on the chunks you've actually studied during this session. This provides accurate feedback on your immediate learning."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-8 bg-blue-50/50 border-blue-100 rounded-[2.5rem] flex gap-5 transition-all hover:bg-blue-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
            <BookOpen size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="font-black text-blue-900 text-sm mb-1 uppercase tracking-wider">Expert Tip</h4>
            <p className="text-xs text-blue-700/80 font-medium leading-relaxed italic">"Try explaining the current core concept to an imaginary friend before moving to the next chunk."</p>
          </div>
        </Card>
        <Card className="p-8 bg-purple-50/50 border-purple-100 rounded-[2.5rem] flex gap-5 transition-all hover:bg-purple-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0">
            <Sparkles size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="font-black text-purple-900 text-sm mb-1 uppercase tracking-wider">AI Insight</h4>
            <p className="text-xs text-purple-700/80 font-medium leading-relaxed italic">"This material has high complexity. Don't rush; your brain needs 20% more time to process technical definitions."</p>
          </div>
        </Card>
        <Card className="p-8 bg-green-50/50 border-green-100 rounded-[2.5rem] flex gap-5 transition-all hover:bg-green-50 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600 shrink-0">
            <Target size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="font-black text-green-900 text-sm mb-1 uppercase tracking-wider">Session Goal</h4>
            <p className="text-xs text-green-700/80 font-medium leading-relaxed italic">"Complete all {chunks.length} sections and achieve ≥ 80% on the quiz to maintain your mastery streak."</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
