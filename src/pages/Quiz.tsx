import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, query, where, getDocs, orderBy, limit, deleteDoc } from "firebase/firestore";
import { generateQuiz, generateStudyChunks } from "@/lib/gemini";
import { 
  BrainCircuit, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowRight,
  ArrowLeft,
  Trophy,
  RefreshCw,
  Home,
  BookOpen,
  AlertCircle,
  RotateCcw,
  Clock
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

export default function Quiz() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const materialId = queryParams.get("id");
  const mode = queryParams.get("mode") || "focus";
  const limitIndex = queryParams.get("limitIndex") ? parseInt(queryParams.get("limitIndex")!) : null;
  const initialStudyTime = parseInt(queryParams.get("studyTime") || "0");

  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAnswered, setIsAnswered] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [startTime] = useState(Date.now());
  const [totalStudyTime, setTotalStudyTime] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);

  useEffect(() => {
    if (!materialId && location.pathname === "/quiz") {
      navigate("/materials");
      return;
    }
    if (materialId) {
      fetchMaterialAndGenerateQuiz();
    }
  }, [materialId, location.pathname]);

  const fetchMaterialAndGenerateQuiz = async () => {
    try {
      const docSnap = await getDoc(doc(db, "materials", materialId!));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMaterialName(data.fileName);
        
        let targetContent = data.content;

        // Fetch previously seen questions for this material
        const progressQuery = query(
          collection(db, "progress"),
          where("userId", "==", auth.currentUser?.uid),
          where("quizId", "==", materialId),
          orderBy("completionDate", "desc"),
          limit(5)
        );
        const progressSnap = await getDocs(progressQuery);
        const seenQuestions: string[] = [];
        progressSnap.forEach(doc => {
          const pastQuestions = doc.data().allQuestions || [];
          seenQuestions.push(...pastQuestions);
        });

        // Requirement: Generate quiz ONLY on completed chunks if limitIndex is set
        if (limitIndex !== null) {
          const chunks = await generateStudyChunks(data.content);
          // Only take chunks up to the limitIndex (e.g. if linkIndex is 2, take 0, 1, 2)
          const limitedChunks = chunks.slice(0, limitIndex + 1);
          targetContent = limitedChunks.map((c: any) => `${c.title}\n\n${c.content}`).join("\n\n---\n\n");
        }

        const quizData = await generateQuiz(targetContent, seenQuestions);
        setQuestions(quizData);
      } else {
        navigate("/materials");
      }
    } catch (error) {
      console.error("Error fetching quiz:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExitQuiz = () => {
    if (showResult) {
      navigate("/");
      return;
    }
    
    // Resume at the specific chunk if we were in a partial quiz
    const exitUrl = `/ai-study?id=${materialId}&mode=${mode}`;
    navigate(exitUrl);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      const quizDuration = Math.round((Date.now() - startTime) / 1000);
      const total = initialStudyTime + quizDuration;
      setTotalStudyTime(total);
      saveProgress(total);
      setShowResult(true);
    }
  };

  const handleCheckAnswer = () => {
    if (!selectedOption || !currentQuestion) return;
    setIsAnswered(true);
    if (selectedOption === currentQuestion.correctAnswer) {
      setScore(prev => prev + 1);
    } else {
      setWrongAnswers(prev => [...prev, {
        question: currentQuestion.question,
        yourAnswer: selectedOption,
        correctAnswer: currentQuestion.correctAnswer,
        topic: currentQuestion.topic,
        explanation: currentQuestion.explanation
      }]);
    }
  };

  const saveProgress = async (totalTime: number) => {
    if (!auth.currentUser) return;
    const finalScore = Math.round((score / questions.length) * 100);
    // Requirement: Extract meaningful topics. If it's a question, try to truncate or use a generic "Topic" label
    const weakTopics = wrongAnswers.map(wa => {
      if (wa.topic) return wa.topic;
      // If it's a question (ends with ?), try to extract something meaningful or truncate
      const q = wa.question;
      if (q.length > 30) {
        return q.substring(0, 27) + "...";
      }
      return q;
    }).slice(0, 5);
    const allQuestions = questions.map(q => q.question);
    try {
      await addDoc(collection(db, "progress"), {
        userId: auth.currentUser.uid,
        quizId: materialId, 
        score: finalScore,
        completionDate: new Date().toISOString(),
        studyTime: totalTime,
        weakTopics: weakTopics,
        allQuestions: allQuestions,
        studyMode: mode // Requirement: Save selected mode in database
      });

      // Requirement #1: Session Cleanup - After quiz is finished and progress saved, clear the session
      try {
        const sessionId = `${auth.currentUser.uid}_${materialId}`;
        await deleteDoc(doc(db, "sessions", sessionId));
      } catch (sessionErr) {
        console.error("Error clearing session:", sessionErr);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "progress");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500">
        <div className="relative">
          <Loader2 className="h-16 w-16 animate-spin text-primary opacity-20" />
          <BrainCircuit className="absolute inset-0 m-auto h-8 w-8 text-primary animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">
            {limitIndex !== null ? "Analyzing Your Progress..." : "Generating AI Quiz..."}
          </h2>
          <p className="text-muted-foreground font-medium">
            {limitIndex !== null 
              ? "We're focusing on the sections you just studied."
              : "Creating personalized questions from your material."}
          </p>
        </div>
      </div>
    );
  }

  if ((!questions || questions.length === 0) && !showResult) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 animate-in fade-in">
        <div className="bg-destructive/10 p-4 rounded-full text-destructive">
          <AlertCircle size={48} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Quiz Data Unavailable</h2>
          <p className="text-muted-foreground">We couldn't generate questions for this material. This can happen if the content is too brief or if there was a technical glitch.</p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate("/materials")}>Back to Materials</Button>
          <Button onClick={() => window.location.reload()}>Retry Generation</Button>
        </div>
      </div>
    );
  }

  if (showResult) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8"
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 text-primary mb-4">
            <Trophy size={48} />
          </div>
          
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Quiz Completed!</h1>
            <p className="text-base text-muted-foreground">Great job finishing "{materialName}"</p>
          </div>

          <Card className="border-border shadow-lg overflow-hidden max-w-md mx-auto">
            <div className="bg-primary p-6 text-primary-foreground">
              <p className="text-xs uppercase tracking-widest opacity-80 mb-1">Your Score</p>
              <h2 className="text-4xl font-bold">{percentage}%</h2>
              <p className="mt-2 text-sm opacity-90">{score} out of {questions.length} correct</p>
            </div>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-muted-foreground mb-1">Study Time</p>
                  <p className="font-bold">{Math.floor(totalStudyTime / 60)}m {totalStudyTime % 60}s</p>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-muted-foreground mb-1">Accuracy</p>
                  <p className="font-bold">{percentage}%</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Performance</span>
                  <span>{percentage >= 70 ? "Excellent!" : percentage >= 50 ? "Good Effort" : "Keep Practicing"}</span>
                </div>
                <Progress value={percentage} className="h-3" />
              </div>

              {wrongAnswers.length > 0 && (
                <div className="space-y-3 pt-4">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="text-orange-500" />
                    Topics to Review
                  </h4>
                  <div className="space-y-2">
                    {wrongAnswers.map((wa, i) => (
                      <div key={i} className="p-4 rounded-xl bg-orange-50 border border-orange-100 space-y-2">
                        <p className="font-bold text-orange-800 text-sm">{wa.question}</p>
                        <div className="flex flex-col gap-1 text-xs">
                          <p className="text-destructive font-medium">Your answer: {wa.yourAnswer}</p>
                          <p className="text-green-700 font-bold">Correct: {wa.correctAnswer}</p>
                        </div>
                        <p className="text-orange-700 text-[10px] leading-relaxed italic border-t border-orange-200/50 pt-2">
                          {wa.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-3 pt-4">
                {/* Mode-specific actions */}
                {mode === "pomodoro" ? (
                  <Button 
                    className="gap-2 w-full py-6 rounded-xl text-lg font-bold shadow-md" 
                    onClick={() => navigate(`/ai-study?id=${materialId}&mode=pomodoro`)}
                  >
                    <Clock size={20} />
                    Next Study Session (20m)
                  </Button>
                ) : mode === "spaced" ? (
                  <div className="flex flex-col gap-3">
                    <Button 
                      className="gap-2 w-full py-6 rounded-xl text-lg font-bold shadow-md bg-orange-600 hover:bg-orange-700" 
                      onClick={() => navigate(`/ai-study?id=${materialId}&mode=spaced`)}
                    >
                      <BookOpen size={20} />
                      Review Weak Topics
                    </Button>
                    <Button 
                      variant="outline"
                      className="h-auto py-4 rounded-xl text-lg font-bold border-2 gap-2"
                      onClick={() => window.location.reload()}
                    >
                      <RefreshCw size={20} />
                      Practice Again (Varied Quiz)
                    </Button>
                    {wrongAnswers.length > 0 && (
                      <Button 
                        variant="destructive"
                        className="h-auto py-4 rounded-xl text-lg font-bold gap-2"
                        onClick={() => {
                          setQuestions(wrongAnswers);
                          setWrongAnswers([]);
                          setScore(0);
                          setCurrentQuestionIndex(0);
                          setSelectedOption(null);
                          setIsAnswered(false);
                          setShowResult(false);
                        }}
                      >
                        <AlertCircle size={20} />
                        Retry {wrongAnswers.length} Incorrect
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button 
                    className="gap-2 w-full py-6 rounded-xl text-lg font-bold shadow-md" 
                    onClick={() => navigate(`/ai-study?id=${materialId}&mode=focus`)}
                  >
                    <BookOpen size={20} />
                    Continue Studying
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-3 mt-2">
                  {mode !== "spaced" && (
                    <Button variant="outline" className="gap-2" onClick={() => window.location.reload()}>
                      <RefreshCw size={18} />
                      Retake Quiz
                    </Button>
                  )}
                  <Button variant="outline" className={cn("gap-2", mode === "spaced" && "col-span-2")} onClick={() => navigate("/materials")}>
                    <BookOpen size={18} />
                    Materials
                  </Button>
                </div>
                <Button variant="secondary" className="gap-2 w-full" onClick={() => navigate("/")}>
                  <Home size={18} />
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = (questions && questions.length > 0 && currentQuestionIndex < questions.length) ? questions[currentQuestionIndex] : null;
  const progress = (questions && questions.length > 0) ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExitQuiz} 
              className="h-9 px-4 rounded-xl border-2 hover:bg-muted font-semibold transition-all shadow-sm"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-lg font-semibold truncate max-w-[250px] text-foreground/80">{materialName}</h1>
          </div>
          <Badge variant="outline" className="gap-1 px-3 py-1 border-primary/30 text-primary bg-primary/5 font-semibold">
            <BrainCircuit size={14} />
            AI Quiz
          </Badge>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-muted-foreground uppercase tracking-widest">Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span className="text-primary font-mono text-sm">Score: {score}</span>
          </div>
          <Progress value={progress} className="h-2 rounded-full" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="border-border shadow-2xl rounded-[32px] overflow-hidden border-t-8 border-t-primary">
            {currentQuestion ? (
              <>
                <CardHeader className="pb-4 pt-10 px-6 sm:px-10 text-center">
                  <CardTitle className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-balance font-heading text-slate-900">
                    {currentQuestion.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 p-6 sm:p-10 pt-4">
                  <RadioGroup 
                    value={selectedOption || ""} 
                    onValueChange={setSelectedOption}
                    disabled={isAnswered}
                    className="grid gap-4"
                  >
                    {currentQuestion.options.map((option: string, index: number) => {
                      const isCorrect = option === currentQuestion.correctAnswer;
                      const isSelected = selectedOption === option;
                      
                      return (
                        <div key={index} className="relative">
                          <RadioGroupItem
                            value={option}
                            id={`option-${index}`}
                            className="sr-only"
                          />
                          <Label
                            htmlFor={`option-${index}`}
                            className={cn(
                              "flex items-center justify-between w-full p-4 rounded-xl border-2 cursor-pointer transition-all text-base font-semibold shadow-sm transition-all duration-200 font-sans",
                              isSelected ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/5" : "border-border/60 hover:border-primary/40 hover:bg-muted/30",
                              isAnswered && isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-100",
                              isAnswered && isSelected && !isCorrect && "border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-100",
                              isAnswered && !isSelected && !isCorrect && "opacity-40 grayscale-[0.3]"
                            )}
                          >
                            <span className="flex-1 pr-4 leading-relaxed">{option}</span>
                            <div className="shrink-0 flex items-center justify-center">
                              {isAnswered && isCorrect && <CheckCircle2 className="text-emerald-600" size={24} />}
                              {isAnswered && isSelected && !isCorrect && <XCircle className="text-rose-600" size={24} />}
                              {!isAnswered && (
                                <div className={cn(
                                  "w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center",
                                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                )}>
                                  {isSelected && <div className="w-2 h-2 bg-white rounded-full shadow-sm" />}
                                </div>
                              )}
                            </div>
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>

                  {isAnswered && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className={cn(
                        "p-6 rounded-[20px] text-sm leading-relaxed border-2 animate-in zoom-in-95 duration-300 shadow-sm",
                        selectedOption === currentQuestion.correctAnswer 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-950" 
                          : "bg-amber-50 border-amber-100 text-amber-950"
                      )}
                    >
                      <p className="font-black mb-3 flex items-center gap-2 uppercase tracking-[0.15em] text-[10px] opacity-70">
                        {selectedOption === currentQuestion.correctAnswer ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <AlertCircle size={14} className="text-amber-600" />
                        )}
                        EXPLANATION
                      </p>
                      <p className="text-base font-medium text-balance leading-relaxed font-sans">{currentQuestion.explanation}</p>
                    </motion.div>
                  )}
                </CardContent>
              </>
            ) : (
              <div className="p-12 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                <p className="text-muted-foreground">Question data was lost. Please restart the quiz.</p>
                <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">Restart Quiz</Button>
              </div>
            )}
            <CardFooter className="p-6 sm:p-10 pt-0 flex flex-col sm:flex-row justify-between items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleExitQuiz}
                className="text-muted-foreground hover:text-foreground font-semibold hover:bg-transparent text-sm"
              >
                Stop & Return to Study
              </Button>
              <div className="flex gap-4 w-full sm:w-auto">
                {!isAnswered ? (
                  <Button 
                    onClick={handleCheckAnswer} 
                    disabled={!selectedOption}
                    className="w-full sm:w-auto min-w-[160px] h-11 rounded-xl text-base font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Check Answer
                  </Button>
                ) : (
                  <Button 
                    onClick={handleNext} 
                    className="w-full sm:w-auto min-w-[160px] h-11 rounded-xl text-base font-bold shadow-xl shadow-primary/20 gap-2 transition-all hover:scale-[1.02] active:scale-95 px-6"
                  >
                    {currentQuestionIndex === questions.length - 1 ? "Finish Quiz" : "Next Question"}
                    <ArrowRight size={20} />
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
