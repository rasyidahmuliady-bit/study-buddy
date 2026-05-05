import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { 
  BarChart3, 
  TrendingUp, 
  Award, 
  Calendar, 
  BookOpen,
  BrainCircuit,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress as ShadcnProgress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Progress() {
  const [progressData, setProgressData] = useState<any[]>([]);
  const [materials, setMaterials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      // Fetch progress records
      const q = query(
        collection(db, "progress"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("completionDate", "desc")
      );
      const snap = await getDocs(q);
      const records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProgressData(records);

      // Fetch materials to map materialId to name
      const materialsSnap = await getDocs(query(collection(db, "materials"), where("userId", "==", auth.currentUser.uid)));
      const materialMap: Record<string, string> = {};
      materialsSnap.docs.forEach(doc => {
        materialMap[doc.id] = doc.data().fileName;
      });
      setMaterials(materialMap);
    } catch (error: any) {
      console.error("Progress fetch error:", error);
      if (error.code === 'failed-precondition') {
        alert("This view requires a database index. Please check the console for the setup link.");
      }
      handleFirestoreError(error, OperationType.LIST, "progress");
    } finally {
      setLoading(false);
    }
  };

  const avgScore = progressData.length > 0 
    ? Math.round(progressData.reduce((acc, curr) => acc + curr.score, 0) / progressData.length) 
    : 0;

  // Dynamic Insights Extraction
  const getProcessedWeakTopics = () => {
    const topicCounts: Record<string, { count: number; materialId: string; subject: string }> = {};
    
    progressData.forEach(p => {
      const topics = p.weakTopics || [];
      topics.forEach((topic: string) => {
        // Normalize: title case for cleaner concepts
        let normalized = topic.trim();
        // Basic cleaning if it's already a sentence but short
        normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        
        // Filter out very long ones that missed the truncation in Quiz.tsx
        if (normalized.length > 50) return;

        if (topicCounts[normalized]) {
          topicCounts[normalized].count += 1;
        } else {
          topicCounts[normalized] = { 
            count: 1, 
            materialId: p.quizId,
            subject: materials[p.quizId] || "General"
          };
        }
      });
    });

    return Object.entries(topicCounts)
      .map(([topic, data]) => ({ topic, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  };

  const weakTopicInsights = getProcessedWeakTopics();
  
  const masteredTopics = Array.from(new Set(
    progressData
      .filter(p => p.score >= 80)
      .map(p => materials[p.quizId])
      .filter(Boolean)
  )).slice(0, 3);

  const stats = [
    { name: "Average Score", value: `${avgScore}%`, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-50" },
    { name: "Quizzes Completed", value: progressData.length, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" },
    { name: "Study Streak", value: "3 Days", icon: Award, color: "text-purple-500", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Your Progress</h1>
        <p className="text-muted-foreground">Track your learning journey and quiz performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name} className="border-border shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quiz History */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 size={20} />
            Quiz History
          </h2>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 border rounded-xl bg-card">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading history...</p>
            </div>
          ) : progressData.length > 0 ? (
            <div className="space-y-4">
              {progressData.map((record) => (
                <Card key={record.id} className="border-border shadow-sm hover:border-primary/30 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                          {record.score}%
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{materials[record.quizId] || "Deleted Material"}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {format(new Date(record.completionDate), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <BrainCircuit size={14} />
                              AI Quiz
                            </span>
                            {record.studyTime && (
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {Math.floor(record.studyTime / 60)}m {record.studyTime % 60}s
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          record.score >= 80 ? "bg-green-100 text-green-700 hover:bg-green-100" :
                          record.score >= 50 ? "bg-blue-100 text-blue-700 hover:bg-blue-100" :
                          "bg-destructive/10 text-destructive hover:bg-destructive/10"
                        )}>
                          {record.score >= 80 ? "Mastered" : record.score >= 50 ? "Proficient" : "Needs Review"}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-6 space-y-2">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Score Breakdown</span>
                        <span>{record.score}%</span>
                      </div>
                      <ShadcnProgress value={record.score} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-xl bg-card">
              <AlertCircle className="mx-auto text-muted-foreground mb-4" size={48} />
              <h3 className="text-lg font-semibold">No progress data yet</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                Complete your first AI-generated quiz to see your progress tracking here.
              </p>
            </div>
          )}
        </div>

        {/* Weak Topics & Insights */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BrainCircuit size={18} className="text-purple-500" />
                Learning Insights
              </CardTitle>
              <CardDescription>AI-generated focus areas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Weak Topics</h4>
                <div className="space-y-4">
                  {weakTopicInsights.length > 0 ? (
                    weakTopicInsights.map((insight, idx) => (
                      <div key={idx} className="group flex flex-col gap-2 p-3 rounded-2xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                            <span className="text-sm font-bold text-destructive leading-tight">
                              {insight.topic}
                            </span>
                          </div>
                          {insight.count > 1 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20 font-bold uppercase">
                              {insight.count} Errors
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-destructive/60 font-medium truncate max-w-[150px]">
                            {insight.subject}
                          </span>
                          <Link to={`/ai-study?id=${insight.materialId}&mode=spaced`}>
                            <Button 
                              variant="link" 
                              size="sm" 
                              className="h-6 p-0 text-[10px] font-black uppercase text-destructive hover:text-destructive/80 flex items-center gap-1"
                            >
                              Study Again
                              <ArrowRight size={10} />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic px-1">
                      {progressData.length > 0 ? "No weak topics identified yet. Great job!" : "Finish a quiz to see your focus areas."}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">Strengths</h4>
                <div className="flex flex-wrap gap-2">
                  {masteredTopics.length > 0 ? (
                    masteredTopics.map((topic, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="bg-green-50 text-green-700 hover:bg-green-100 border-green-100/50 py-1.5 px-3 rounded-full text-[10px] font-bold"
                      >
                        {topic}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      {progressData.length > 0 ? "Keep studying to build your strengths!" : "Your mastered subjects will appear here."}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground italic">
                  {progressData.length > 0 
                    ? `You've completed ${progressData.length} sessions with a ${avgScore}% average. ${avgScore >= 80 ? "You're mastering your subjects!" : "Focus on your weak topics to improve."}`
                    : "Insights will be generated based on your past study sessions and quiz performance once you begin."
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-primary text-primary-foreground">
            <CardHeader>
              <CardTitle className="text-lg">Next Milestone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Complete 5 Quizzes</span>
                  <span>{progressData.length}/5</span>
                </div>
                <ShadcnProgress value={(progressData.length / 5) * 100} className="h-2 bg-white/20" />
                <p className="text-xs opacity-80 mb-4">
                  Complete 2 more quizzes to earn the "Study Enthusiast" badge!
                </p>
                <Link to="/settings?tab=badges" className="block">
                  <Button variant="secondary" size="sm" className="w-full bg-white/20 hover:bg-white/30 border-none text-white font-bold">
                    View All Badges
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
