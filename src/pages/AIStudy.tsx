import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { generateStudyChunks } from "@/lib/gemini";
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
  Filter
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

export default function AIStudy() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const materialId = queryParams.get("id");
  const mode = queryParams.get("mode") || "focus";

  const [material, setMaterial] = useState<any>(null);
  const [hubMaterials, setHubMaterials] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [chunks, setChunks] = useState<any[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hubLoading, setHubLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [startTime] = useState(Date.now());
  const [timeLeft, setTimeLeft] = useState(20 * 60); // 20 minutes in seconds
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
        mode,
        chunks: studyChunks, // Save the actual content chunks to avoid regeneration
        lastUpdated: new Date().toISOString(),
        completionPercentage: studyChunks.length > 0 ? Math.round((index / studyChunks.length) * 100) : 0
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
    let quizUrl = `/quiz?id=${materialId}&studyTime=${studyTime}&mode=${mode}`;
    
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
      let timeRem = 20 * 60;
      let existingChunks: any[] = [];

      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        // A study session is considered existing if: user_id matches, material_id matches, and has chunks
        // We consider it "resumable" if chunks exist. Completion percentage is for UI.
        if (sessionData.chunks && sessionData.chunks.length > 0) {
          startIdx = sessionData.currentChunkIndex || 0;
          timeRem = sessionData.timeLeft || (20 * 60);
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
      setTimeLeft(20 * 60); 
      setTimerActive(true);
    } else {
      setTimerActive(false);
    }
  };

  const progress = chunks.length > 0 ? ((currentChunkIndex + 1) / chunks.length) * 100 : 0;
  const currentChunk = chunks[currentChunkIndex];

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
                      render={
                        <button
                          className={cn(
                            "px-5 py-2 rounded-full text-sm font-medium transition-all border flex items-center gap-2 shrink-0",
                            otherSubjects.includes(selectedSubject)
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                          )}
                        >
                          {otherSubjects.includes(selectedSubject) ? selectedSubject : `+ ${rawSubjects.length - 3} More`}
                          <ChevronRight className={cn("w-4 h-4 transition-transform", "rotate-90")} />
                        </button>
                      }
                    />
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
              <h2 className="text-2xl font-bold">
                {searchQuery || selectedSubject !== "all" || selectedStatus !== "all" ? "No matches found" : "No Materials Yet"}
              </h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {searchQuery || selectedSubject !== "all" || selectedStatus !== "all" 
                  ? "Try adjusting your filters or search query to find what you're looking for." 
                  : "Go to the materials page to upload your first study note or PDF."}
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
    <div className="max-w-4xl mx-auto space-y-4">
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
              <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                ⏱ Pomodoro Session Complete!
              </CardTitle>
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xl font-medium text-slate-700 dark:text-slate-300">
                  You studied <span className="text-primary font-bold">{currentChunkIndex + 1} / {chunks.length}</span> chunks.
                </p>
                <div className="w-full max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-primary transition-all duration-700" 
                    style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-6 font-medium uppercase tracking-wider">
                What would you like to do?
              </p>
            </div>
            
            <CardContent className="space-y-4 pt-6 pb-8 px-8">
              <Button 
                className="w-full flex flex-col h-auto py-4 rounded-2xl font-bold shadow-md gap-1" 
                onClick={() => handleFinishSession(true)}
              >
                <div className="flex items-center gap-2">
                  <BrainCircuit size={18} />
                  <span>Take Quiz</span>
                </div>
                <span className="text-xs font-normal opacity-80">quiz based on studied chunks</span>
              </Button>

              <Button 
                variant="secondary" 
                className="w-full flex flex-col h-auto py-4 rounded-2xl font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 gap-1" 
                onClick={handleTakeBreak}
              >
                <div className="flex items-center gap-2">
                  <Clock size={18} />
                  <span>Take 5-min Break</span>
                </div>
                <span className="text-xs font-normal opacity-80 text-green-600/70">start break timer</span>
              </Button>

              {currentChunkIndex + 1 < chunks.length && (
                <Button 
                  variant="outline" 
                  className="w-full flex flex-col h-auto py-4 rounded-2xl font-bold border-2 hover:bg-muted/50 gap-1" 
                  onClick={() => handleContinueStudying(true)}
                >
                  <div className="flex items-center gap-2">
                    <Play size={18} />
                    <span>Continue Studying</span>
                  </div>
                  <span className="text-xs font-normal opacity-70">resume remaining chunks</span>
                </Button>
              )}
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

      <div className="bg-background pb-6 pt-2">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/materials")} className="gap-2 -ml-2">
            <ArrowLeft size={16} />
            Back to Materials
          </Button>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full gap-2 h-8"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              {isPaused ? "Resume" : "Pause"}
            </Button>

            {mode === "pomodoro" && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full border transition-colors",
                timeLeft < 60 ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-muted/50 border-border text-muted-foreground"
              )}>
                <Clock size={14} />
                <span className="text-xs font-mono font-bold">{formatTime(timeLeft)}</span>
              </div>
            )}
            <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold tracking-tight">
              {mode} Mode
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{material?.fileName}</h1>
            <div className="flex items-center justify-between text-sm mb-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">Chunk {currentChunkIndex + 1} of {chunks.length}</span>
                {sessionLoaded && (
                  <Badge variant="outline" className="text-[10px] py-0 border-blue-200 text-blue-600 bg-blue-50">
                    Resumed
                  </Badge>
                )}
              </div>
              <span className="font-bold text-muted-foreground">{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2 w-full bg-muted" />
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
        </div>
      </div>

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
            <CardHeader className="border-b border-border bg-muted/40 px-6 py-5">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl text-primary flex items-center gap-2">
                  <BookOpen size={22} strokeWidth={2.5} />
                  {chunks[currentChunkIndex]?.title}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter opacity-60 bg-background/50">
                  Adaptive Learning
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col md:flex-row">
              <div className="flex-1 px-6 py-6 md:px-12 md:py-10 overflow-y-auto max-h-[600px] scroll-smooth">
                <div className="prose prose-slate dark:prose-invert max-w-none 
                  prose-headings:text-primary prose-headings:font-bold prose-headings:mt-8 prose-headings:mb-4
                  prose-h3:text-xl prose-h3:mb-3
                  prose-p:leading-relaxed prose-p:mb-5 prose-p:text-slate-700 dark:prose-p:text-slate-300
                  prose-li:my-2 prose-li:text-slate-700 dark:prose-li:text-slate-300
                  prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:mt-8 prose-blockquote:mb-6
                  [&>*:first-child]:mt-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {formatMarkdown(chunks[currentChunkIndex]?.content)}
                  </ReactMarkdown>
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
                
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-background/50 px-3 py-1.5 rounded-full border border-border">
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

      <Card className="border-border shadow-sm bg-muted/5 p-6 mb-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <BrainCircuit className="text-primary" size={20} />
          System Logic: {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">1</div>
              Adaptive Chunking
            </h4>
            <p className="text-muted-foreground leading-relaxed">
              Our AI analyzes the material length and breaks it into {chunks.length} manageable chunks (300-500 words each). This ensures full coverage without cognitive overload.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">2</div>
              {mode === "pomodoro" ? "Pomodoro Timing" : mode === "spaced" ? "Weak Spot Targeting" : "Self-Paced Learning"}
            </h4>
            <p className="text-muted-foreground leading-relaxed">
              {mode === "pomodoro" 
                ? "Focus for 20 minutes with minimal distractions. Navigation is restricted to ensure you actually process the content." 
                : mode === "spaced" 
                ? "Prioritizing sections you previously struggled with based on last quiz results." 
                : "Free navigation allows you to study at your own pace and start the quiz whenever you feel ready."}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">3</div>
              Smart Quiz Generation
            </h4>
            <p className="text-muted-foreground leading-relaxed">
              {mode === "spaced" 
                ? "Quizzes are meticulously crafted to re-test topics you previously struggled with, helping you turn weak points into strengths through active recall." 
                : "Quizzes strictly adapt to your progress. Whether you finish a full session or study just few chunks, the AI only tests you on material you have actually reviewed."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-blue-50 border-blue-100 flex gap-3">
          <BookOpen className="text-blue-500 shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-blue-700 text-sm mb-1">Study Tip</h4>
            <p className="text-xs text-blue-600">Try to summarize this chunk in your own words before moving to the next one.</p>
          </div>
        </Card>
        <Card className="p-4 bg-purple-50 border-purple-100 flex gap-3">
          <BrainCircuit className="text-purple-500 shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-purple-700 text-sm mb-1">AI Insight</h4>
            <p className="text-xs text-purple-600">This section contains key definitions that are likely to appear in your quiz.</p>
          </div>
        </Card>
        <Card className="p-4 bg-green-50 border-green-100 flex gap-3">
          <Target className="text-green-500 shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-green-700 text-sm mb-1">Goal</h4>
            <p className="text-xs text-green-600">Complete all {chunks.length} chunks to unlock the practice quiz.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
