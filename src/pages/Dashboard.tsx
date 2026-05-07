import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc } from "firebase/firestore";
import { 
  BookOpen, 
  BrainCircuit, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  FileText, 
  TrendingUp,
  Plus,
  Sparkles,
  Play,
  ChevronRight,
  RotateCcw,
  BarChart3
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn, toTitleCase } from "@/lib/utils";

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

interface ProgressData {
  id: string;
  score: number;
  weakTopics?: string[];
  completionDate: string;
  date: string;
  userId: string;
  quizId: string;
  studyMode?: string;
}

interface NextStep {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  icon: any;
  colorClass: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(auth.currentUser?.displayName || "Student");
  const [recentMaterials, setRecentMaterials] = useState<any[]>([]);
  const [recentProgress, setRecentProgress] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInsight, setUserInsight] = useState<string>("");
  const [recommendation, setRecommendation] = useState<{ mode: string, reason: string } | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);

  const [dailyGoal, setDailyGoal] = useState({ current: 0, total: 4, percentage: 0 });
  const [studySchedule, setStudySchedule] = useState<any[]>([]);
  const [weakTopicData, setWeakTopicData] = useState<{ topic: string, materialId: string }[]>([]);
  const [nextStep, setNextStep] = useState<NextStep | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      
      try {
        // STEP 1: Fetch user name from database
        let userDoc;
        try {
          userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${auth.currentUser.uid}`);
        }
        
        if (userDoc?.exists()) {
          setUserName(userDoc.data().name);
        } else if (auth.currentUser.displayName) {
          setUserName(auth.currentUser.displayName);
        }

        // STEP 2: Fetch recently uploaded materials
        const materialsQuery = query(
          collection(db, "materials"),
          where("userId", "==", auth.currentUser.uid),
          orderBy("uploadDate", "desc"),
          limit(10)
        );
        
        let materialsSnap;
        try {
          materialsSnap = await getDocs(materialsQuery);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, "materials");
        }
        
        const materials = materialsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[] || [];
        setRecentMaterials(materials);

        // STEP 2.1: Check for active sessions
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("userId", "==", auth.currentUser.uid),
          limit(10)
        );
        
        let sessionsSnap;
        try {
          sessionsSnap = await getDocs(sessionsQuery);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, "sessions");
        }

        let latestSession: any = null;
        if (sessionsSnap && !sessionsSnap.empty) {
          const sessionsData = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          sessionsData.sort((a: any, b: any) => 
            new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime()
          );
          
          latestSession = sessionsData[0];
          const sessionMaterial = materials.find((m: any) => m.id === latestSession.materialId);
          setActiveSession({ ...latestSession, materialName: sessionMaterial?.fileName || "Study Material" });
        }

        // STEP 3: Fetch past progress
        const progressQuery = query(
          collection(db, "progress"),
          where("userId", "==", auth.currentUser.uid),
          orderBy("completionDate", "desc"), 
          limit(30)
        );
        
        let progressSnap;
        try {
          progressSnap = await getDocs(progressQuery);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, "progress");
        }
        
        const rawProgress = progressSnap?.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          date: format(new Date(doc.data().completionDate), "MMM d")
        })) as ProgressData[] || [];
        
        const progressData = [...rawProgress].sort((a, b) => 
          new Date(a.completionDate).getTime() - new Date(b.completionDate).getTime()
        );
        setRecentProgress(progressData);

        // Weak Topics Extraction with Material Context
        const topicMap = new Map<string, { count: number, materialId: string }>();
        rawProgress.forEach(p => {
          (p.weakTopics || []).forEach(t => {
            if (!t || t.length > 50) return;
            const existing = topicMap.get(t);
            if (existing) {
              existing.count += 1;
            } else {
              topicMap.set(t, { count: 1, materialId: p.quizId });
            }
          });
        });
        
        const sortedTopicData = Array.from(topicMap.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([topic, data]) => ({ topic, materialId: data.materialId }));
          
        setWeakTopicData(sortedTopicData);

        // Daily Goal
        const today = new Date().toDateString();
        const sessionsToday = rawProgress.filter(p => new Date(p.completionDate).toDateString() === today).length;
        setDailyGoal({ 
          current: sessionsToday, 
          total: 4, 
          percentage: Math.min((sessionsToday / 4) * 100, 100) 
        });

        // Recommendation Engine
        if (latestSession && latestSession.completionPercentage < 100) {
          setRecommendation({ 
            mode: `Continue ${latestSession.mode.charAt(0).toUpperCase() + latestSession.mode.slice(1)} Mode`, 
            reason: `You're partially through "${activeSession?.materialName || 'your material'}". Finishing this section will consolidate your memory.` 
          });
        } else if (sortedTopicData.length > 0) {
          setRecommendation({ 
            mode: "Spaced Repetition", 
            reason: `We noticed you've struggled with "${sortedTopicData[0].topic}". A quick review session will help bridge the gap.` 
          });
        } else if (materials.length > 0) {
          setRecommendation({ 
            mode: "Pomodoro Mode", 
            reason: "Ready for something new? Try a Pomodoro session on your latest material for maximum focus." 
          });
        } else {
          setRecommendation({ mode: "Focus Mode", reason: "Upload your first study material to begin your learning journey!" });
        }

        // Actionable AI Insight
        if (rawProgress.length > 0) {
          const avgScore = rawProgress.reduce((acc, p) => acc + p.score, 0) / rawProgress.length;
          const latestScore = rawProgress[0].score;
          const totalSessions = rawProgress.length;
          
          if (latestScore < 50) {
            setUserInsight(`Your last quiz score was low (${latestScore}%). We recommend switching to Pomodoro Mode for your next session to break the material down into smaller, manageable chunks.`);
          } else if (sortedTopicData.length > 0) {
            setUserInsight(`You've been struggling with "${sortedTopicData[0].topic}". Try a Spaced Repetition session today to reinforce this specific concept before it fades from memory.`);
          } else if (avgScore > 85 && totalSessions > 3) {
            setUserInsight("You've mastered your current materials! To keep growing, try starting a new, more advanced topic or teaching a concept to someone else (The Feynman Technique).");
          } else {
            setUserInsight(`Consistency is key. You're maintaining a solid ${Math.round(avgScore)}% average. Continue with your scheduled Focus session to stay on track.`);
          }
        } else {
          setUserInsight("Welcome! I'll analyze your quiz scores and study habits to provide custom advice. Start by uploading a material and completing your first quiz.");
        }

        // STEP 6: Intelligent "Next Up" Recommendation
        let step: NextStep;
        const currentLatestScore = rawProgress.length > 0 ? rawProgress[0].score : 0;
        const avgScore = rawProgress.length > 0 ? rawProgress.reduce((acc, p) => acc + p.score, 0) / rawProgress.length : 0;
        
        // Priority 1: Weak Topics (If they exist, they need focus)
        if (sortedTopicData.length > 0) {
          step = {
            title: "Review Weak Topics",
            description: `Strengthen your understanding of "${sortedTopicData[0].topic}" based on recent quiz results.`,
            actionLabel: "Start Practice",
            onClick: () => navigate(`/ai-study?id=${sortedTopicData[0].materialId}&mode=spaced`),
            icon: BrainCircuit,
            colorClass: "bg-amber-500"
          };
        } 
        // Priority 2: Advanced Quiz (If performing well)
        else if (rawProgress.length > 0 && currentLatestScore >= 80) {
          step = {
            title: "Try Advanced Quiz",
            description: "You're performing well! Challenge yourself with harder questions to test deep recall.",
            actionLabel: "Start Quiz",
            onClick: () => navigate(`/quiz?id=${rawProgress[0].quizId}`),
            icon: Sparkles,
            colorClass: "bg-purple-500"
          };
        } 
        // Priority 3: Inactivity Check (If last session was more than 2 days ago)
        const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
        let lastStudyTime = 0;
        if (rawProgress.length > 0 && rawProgress[0].completionDate) {
          const date = rawProgress[0].completionDate;
          lastStudyTime = typeof date === 'string' ? new Date(date).getTime() : (date as any).toMillis?.() || new Date(date as any).getTime();
        }
        
        if (lastStudyTime && lastStudyTime < twoDaysAgo && materials.length > 0) {
          const lastMaterial = materials[0];
          step = {
            title: "Welcome Back!",
            description: `It's been a few days since your last session. Return to "${lastMaterial.fileName.split('.')[0]}" to keep your streak alive.`,
            actionLabel: "Pick Up Where You Left Off",
            onClick: () => navigate(`/ai-study?id=${lastMaterial.id}`),
            icon: RotateCcw,
            colorClass: "bg-orange-500"
          };
        }
        // Priority 4: Returning to Last Subject or Starting New
        else if (materials.length > 0) {
          const lastMaterial = materials[0];
          if (avgScore >= 85 && currentLatestScore >= 80) {
            step = {
              title: "Master New Topic",
              description: `You've mastered "${lastMaterial.fileName.split('.')[0]}" with an average of ${Math.round(avgScore)}%. Record a new victory today.`,
              actionLabel: "Explore Materials",
              onClick: () => navigate("/materials"),
              icon: TrendingUp,
              colorClass: "bg-indigo-500"
            };
          } else {
            step = {
              title: `Focus on ${lastMaterial.fileName.split('.')[0]}`,
              description: `Maintain your momentum in your latest topic. You're currently performing at ${Math.round(avgScore)}%.`,
              actionLabel: "Continue Learning",
              onClick: () => navigate(`/ai-study?id=${lastMaterial.id}`),
              icon: Clock,
              colorClass: "bg-blue-500"
            };
          }
        }
        // Priority 4: Start New Material
        else {
          step = {
            title: "Start New Session",
            description: "Ready for your first milestone? Upload a material to begin your intelligent learning cycle.",
            actionLabel: "Upload Material",
            onClick: () => navigate("/materials"),
            icon: BookOpen,
            colorClass: "bg-green-500"
          };
        }
        setNextStep(step);

      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const stats = [
    { name: "Materials", value: recentMaterials.length, icon: BookOpen, color: "text-blue-500" },
    { name: "Sessions", value: recentProgress.length, icon: Clock, color: "text-purple-500" },
    { name: "Success", value: recentProgress.length > 0 ? Math.round(recentProgress.reduce((acc, curr) => acc + curr.score, 0) / recentProgress.length) + "%" : "0%", icon: TrendingUp, color: "text-green-500" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Sparkles className="animate-spin text-primary opacity-20" size={48} />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground animate-pulse">
          Crafting your dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 max-w-7xl mx-auto">
      {/* Header & Greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hello, <span className="text-primary">{userName}</span>!
          </h1>
          <p className="text-muted-foreground">
            {recentProgress.length > 0 
              ? `You've mastered ${recentProgress.filter(p => p.score > 80).length} topics so far. What's next?`
              : "Ready to start your learning journey today?"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => navigate("/materials")} 
            className="rounded-full px-6 shadow-lg shadow-primary/20"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Material
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: GUIDED LEARNING (9 units) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Section 1: Continue Learning (Primary Action) */}
          <Card className={cn(
            "rounded-[2.5rem] border-2 transition-all duration-300 overflow-hidden relative group shadow-sm",
            activeSession ? "border-primary/20 bg-primary/5 hover:shadow-xl hover:shadow-primary/5" : "border-border/50 bg-card hover:border-primary/20"
          )}>
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <BrainCircuit size={200} />
            </div>
            
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary border-none px-3 py-0.5 font-black text-[10px] uppercase tracking-wider">
                      {activeSession ? `Resume: ${activeSession.mode}` : "Your Journey"}
                    </Badge>
                  </div>
                  
                  {activeSession ? (
                    <div>
                      <h2 className="text-3xl font-black mb-2 tracking-tight">Continue studying "{activeSession.materialName}"</h2>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                        <div className="flex items-center gap-1.5 font-bold">
                          <CheckCircle2 size={16} className="text-green-500" />
                          {activeSession.completionPercentage}% Progress
                        </div>
                        <div className="flex items-center gap-1.5 font-mono font-bold">
                          <Clock size={16} className="text-primary" />
                          {activeSession.timeLeft ? `${Math.floor(activeSession.timeLeft / 60)}m left` : "Self-paced"}
                        </div>
                      </div>
                      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden p-[2px] mb-6">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${activeSession.completionPercentage}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-3xl font-black mb-2 tracking-tight">Ready to boost your expertise?</h2>
                      <p className="text-muted-foreground font-medium">Select a study material to start an AI-powered mastery session.</p>
                      {recentMaterials.length === 0 && (
                        <p className="text-sm text-primary mt-4 font-bold flex items-center gap-2 bg-primary/10 w-fit px-4 py-2 rounded-xl border border-primary/20 animate-pulse">
                          <Sparkles size={16} />
                          Upload your first material to begin!
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <Button 
                      size="lg" 
                      className="rounded-full px-10 h-14 font-black transition-all shadow-xl shadow-primary/20 hover:scale-105 active:scale-95"
                      onClick={() => {
                        if (activeSession) {
                          navigate(`/ai-study?id=${activeSession.materialId}&mode=${activeSession.mode}`);
                        } else {
                          navigate("/ai-study");
                        }
                      }}
                    >
                      {activeSession ? "Resume Session" : "Choose Material"}
                      <ChevronRight size={20} className="ml-1" />
                    </Button>
                    {activeSession && (
                      <Button variant="ghost" className="rounded-full text-muted-foreground font-bold hover:bg-primary/5" onClick={() => navigate("/ai-study")}>
                        Different Material
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="hidden md:block w-px h-32 bg-border/50" />
                
                <div className="w-full md:w-auto min-w-[220px] space-y-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Suggested next step</p>
                  <div className="space-y-4">
                    <div className="p-5 rounded-3xl bg-background border border-border/50 shadow-sm">
                      <p className="text-xs font-black mb-1.5 uppercase text-primary tracking-wider">{recommendation?.mode || "Focus Mode"}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground font-medium italic opacity-80">"{recommendation?.reason}"</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

              {/* Section 2: Weak Topics & Progress Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Weak Topics to Review */}
            <Card className="rounded-[2.5rem] border-border/50 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <BrainCircuit className="text-amber-500" size={20} />
                  Topics to Master
                </CardTitle>
                <CardDescription className="text-xs font-medium">Concepts for your next review session</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {weakTopicData.length > 0 ? (
                  <div className="space-y-3">
                    {weakTopicData.map((item, i) => (
                      <div 
                        key={i} 
                        className="flex items-center justify-between p-4 rounded-2xl bg-amber-50/30 border border-amber-100/50 hover:bg-amber-50 hover:scale-[1.02] transition-all group cursor-pointer"
                        onClick={() => navigate(`/ai-study?id=${item.materialId}&mode=spaced`)}
                      >
                        <span className="text-sm font-bold text-amber-900 truncate pr-4">{toTitleCase(item.topic)}</span>
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-white border-amber-200 text-amber-700 shrink-0">
                          Review
                        </Badge>
                      </div>
                    ))}
                    <Button 
                      variant="outline" 
                      className="w-full rounded-2xl h-11 mt-2 border-dashed border-amber-200 text-xs font-bold text-amber-700 bg-amber-50/20 hover:bg-amber-50"
                      onClick={() => navigate("/ai-study")}
                    >
                      Browse Review Areas
                    </Button>
                  </div>
                ) : recentProgress.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-6 bg-muted/10 rounded-[2rem] border-2 border-dashed border-border/50">
                    <BookOpen className="text-primary mb-3 opacity-40" size={36} />
                    <p className="text-sm font-black text-foreground uppercase tracking-wider">Ready to start?</p>
                    <p className="text-[11px] text-muted-foreground mt-2 max-w-[200px] mx-auto leading-relaxed font-medium">
                      Upload your first study material to begin your AI-powered learning journey.
                    </p>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="mt-3 text-[10px] font-black h-auto p-0 uppercase tracking-widest text-primary"
                      onClick={() => navigate("/materials")}
                    >
                      Go to Materials <ChevronRight size={10} className="ml-1" />
                    </Button>
                  </div>
                ) : (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-6 bg-muted/10 rounded-[2rem] border-2 border-dashed border-border/50">
                    <Sparkles className="text-primary mb-3 animate-pulse" size={36} />
                    <p className="text-sm font-black text-foreground uppercase tracking-wider">Flawless execution!</p>
                    <p className="text-[11px] text-muted-foreground mt-2 max-w-[200px] mx-auto leading-relaxed font-medium">
                      Great job! Your recent performance looks consistent. Keep up the momentum.
                    </p>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="mt-3 text-[10px] font-black h-auto p-0 uppercase tracking-widest text-primary"
                      onClick={() => navigate("/materials")}
                    >
                      Start New Material <ChevronRight size={10} className="ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Learning Velocity (Downsized Chart) */}
            <Card className="rounded-[2.5rem] border-border/50 shadow-sm overflow-hidden bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <TrendingUp className="text-green-500" size={20} />
                  Course Velocity
                </CardTitle>
                <CardDescription className="text-xs font-medium">Performance trends across your journey</CardDescription>
              </CardHeader>
              <CardContent className="h-48 pt-4">
                {recentProgress.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={recentProgress}>
                      <defs>
                        <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis domain={[0, 100]} hide />
                      <RechartsTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-900 text-white border-none px-3 py-1.5 rounded-full shadow-2xl text-[10px] font-black">
                                {payload[0].value}% Score
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="score" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        fill="url(#velocityGrad)"
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                    <BarChart3 size={32} className="mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Data Yet</p>
                  </div>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 mt-4 hover:bg-primary/5 hover:text-primary transition-all"
                  onClick={() => navigate("/progress")}
                >
                  View Performance Hub <ChevronRight size={10} className="ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Section 3: Recent Quiz History (New) */}
          <Card className="rounded-[2.5rem] border-border/50 shadow-sm overflow-hidden bg-white">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black flex items-center gap-2">
                  <BarChart3 className="text-purple-500" size={22} />
                  Recent Quiz History
                </CardTitle>
                <CardDescription className="text-sm font-medium">Your latest performance records</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl font-bold text-sm h-10 px-4"
                onClick={() => navigate("/progress")}
              >
                View All
              </Button>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {recentProgress.length > 0 ? (
                <div className="space-y-3">
                  {[...recentProgress].reverse().slice(0, 5).map((record, i) => {
                    const material = recentMaterials.find(m => m.id === record.quizId);
                    
                    const getPerformanceLabel = (score: number) => {
                      if (score >= 90) return { label: "Excellent", color: "bg-green-100 text-green-700 border-green-200" };
                      if (score >= 70) return { label: "Strong", color: "bg-blue-100 text-blue-700 border-blue-200" };
                      if (score >= 40) return { label: "Improving", color: "bg-amber-100 text-amber-700 border-amber-200" };
                      return { label: "Needs Review", color: "bg-red-100 text-red-700 border-red-200" };
                    };
                    
                    const perf = getPerformanceLabel(record.score);
                    
                    return (
                      <div 
                        key={record.id} 
                        className="p-4 rounded-2xl bg-muted/30 border border-border/50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-full shrink-0 flex flex-col items-center justify-center border-2 border-white shadow-sm",
                              record.score >= 80 ? "bg-green-500 text-white" :
                              record.score >= 60 ? "bg-blue-500 text-white" :
                              "bg-amber-500 text-white"
                            )}>
                              <span className="text-sm font-black leading-none">{record.score}%</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold truncate max-w-[150px] md:max-w-xs leading-none">
                                  {material?.fileName || "Study Session"}
                                </p>
                                <Badge variant="outline" className={cn("text-xs h-5 px-2 font-bold uppercase tracking-tight shrink-0", perf.color)}>
                                  {perf.label}
                                </Badge>
                                {record.studyMode && (
                                  <Badge variant="secondary" className="text-xs h-5 px-2 font-bold uppercase tracking-tight bg-purple-50 text-purple-600 border-purple-100">
                                    {record.studyMode.replace("mode", "")}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                {record.date}
                              </p>
                              
                              {record.weakTopics && record.weakTopics.length > 0 && (
                                <div className="pt-1">
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">Weak Areas:</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {record.weakTopics.slice(0, 2).map((topic: string, idx: number) => (
                                      <span key={idx} className="text-xs text-slate-500 bg-white/50 px-2.5 py-0.5 rounded-md border border-border/30">
                                        • {toTitleCase(topic)}
                                      </span>
                                    ))}
                                    {record.weakTopics.length > 2 && (
                                      <span className="text-xs text-slate-400 italic">+{record.weakTopics.length - 2} more</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center opacity-50 space-y-2">
                  <FileText className="mx-auto" size={32} />
                  <p className="text-xs font-medium text-muted-foreground">No quiz activity recorded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: INSIGHTS & UTILS (4 units) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Actionable AI Insight */}
          <Card className="rounded-[2rem] border-none bg-slate-950 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Sparkles size={120} />
            </div>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-indigo-400">
                <BrainCircuit size={18} />
                Actionable Insight
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-6 pb-8">
              <p className="text-lg font-medium leading-relaxed tracking-tight">
                "{userInsight}"
              </p>
              <Button 
                className="w-full rounded-full bg-white text-slate-950 hover:bg-slate-200 font-bold shadow-lg"
                onClick={nextStep?.onClick || (() => navigate("/materials"))}
              >
                Start Recommended Session
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats Grid (Compact) */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <Card key={stat.name} className="rounded-2xl border-border/50 p-4 text-center hover:bg-muted/30 transition-colors">
                <stat.icon className={cn("mx-auto mb-2 opacity-70", stat.color)} size={18} />
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">{stat.name}</p>
              </Card>
            ))}
          </div>

          {/* Next Up Intelligence Card */}
          <Card className="rounded-[2.5rem] border-border/50 shadow-sm overflow-hidden bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-muted-foreground/80">
                <CalendarIcon size={16} />
                Next Up
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {nextStep ? (
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className={cn("p-3 rounded-2xl shrink-0 text-white shadow-lg", nextStep.colorClass)}>
                      <nextStep.icon size={24} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-base leading-tight">{nextStep.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {nextStep.description}
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={nextStep.onClick}
                    className="w-full rounded-2xl h-12 font-bold gap-2 group"
                  >
                    {nextStep.actionLabel}
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2 opacity-50">
                  <Clock size={32} className="mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium">Analyzing patterns...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily Goal Mini */}
          <Card className="rounded-[2rem] border-border/50 shadow-sm p-6 bg-muted/10 relative overflow-hidden">
             <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Goal Achievement</p>
                  <h3 className="text-2xl font-black">{dailyGoal.current}<span className="text-sm text-muted-foreground">/{dailyGoal.total}</span></h3>
                </div>
                <div className="text-xl font-black text-primary">{dailyGoal.percentage}%</div>
             </div>
             <Progress value={dailyGoal.percentage} className="h-1.5" />
             <p className="text-[10px] mt-4 text-muted-foreground font-medium">
               {dailyGoal.percentage === 100 ? "Limitless potential reached today! 🔥" : "Complete your daily quota to maintain streaks."}
             </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
