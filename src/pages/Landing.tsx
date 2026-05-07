import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { 
  BrainCircuit, 
  BookOpen, 
  Clock, 
  BarChart3, 
  ChevronRight,
  Sparkles,
  ShieldCheck
} from "lucide-react";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-primary p-1.5 rounded-lg">
                <BrainCircuit className="text-primary-foreground" size={20} />
              </div>
              <span className="text-xl font-bold tracking-tight">Study Buddy</span>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/login")}>Log in</Button>
              <Button onClick={() => navigate("/register")}>Get Started</Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles size={14} />
              <span>AI-Powered Learning Support</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
              Study Smarter,<br />Not Harder.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Break down complex materials into manageable chunks. Master subjects with AI-generated quizzes and structured study sessions designed for university students.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-12 px-8 text-lg gap-2" onClick={() => navigate("/register")}>
                Start Studying
                <ChevronRight size={20} />
              </Button>
            </div>
          </motion.div>

          {/* Feature Preview Image/Mockup */}
          <motion.div 
            className="mt-20 relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <div className="relative mx-auto max-w-5xl rounded-2xl border border-border bg-muted/50 p-2 shadow-2xl overflow-hidden">
              <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
                <img 
                  src="https://picsum.photos/seed/studybuddy/1200/800" 
                  alt="Study Buddy Dashboard Preview" 
                  className="w-full h-auto"
                  referrerPolicy="no-referrer"
                />
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary/20 blur-3xl rounded-full" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Stay focused and keep improving your learning</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built for Generation Z students who prefer interactive, structured, and visually engaging learning experiences.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <BookOpen className="text-blue-500" />,
                title: "AI Content Chunking",
                description: "Upload PDFs, PPTs, or notes. Our AI breaks them into manageable study segments with customizable timers to match your focus style."
              },
              {
                icon: <BrainCircuit className="text-purple-500" />,
                title: "Smart Quizzes",
                description: "Automatically generate quizzes based on your specific materials to test retention and identify weak spots."
              },
              {
                icon: <Clock className="text-green-500" />,
                title: "Timed Sessions",
                description: "Follow a structured microlearning flow that improves focus and helps you manage your study time effectively."
              },
              {
                icon: <BarChart3 className="text-orange-500" />,
                title: "Progress Tracking",
                description: "Monitor your quiz performance and study habits with detailed analytics and performance insights."
              },
              {
                icon: <ShieldCheck className="text-cyan-500" />,
                title: "Focus Mode",
                description: "Minimize distractions with a clean, intuitive interface designed to keep you in the learning zone."
              },
              {
                icon: <Sparkles className="text-yellow-500" />,
                title: "Personalized Insights",
                description: "Get AI-driven suggestions on which topics need more review based on your previous quiz results."
              }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                className="p-8 rounded-2xl bg-background border border-border hover:border-primary/50 transition-colors group"
                whileHover={{ y: -5 }}
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto rounded-3xl bg-primary p-12 text-center text-primary-foreground relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-4xl font-bold mb-6">Ready to transform your study habits?</h2>
            <p className="text-primary-foreground/80 text-lg mb-10 max-w-xl mx-auto">
              Focus better, learn faster, and achieve your academic goals with Study Buddy.
            </p>
            <Button size="lg" variant="secondary" className="h-12 px-10 text-lg font-bold" onClick={() => navigate("/register")}>
              Get Started
            </Button>
          </div>
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BrainCircuit className="text-primary" size={24} />
            <span className="text-xl font-bold tracking-tight">Study Buddy</span>
          </div>
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Study Buddy. Built for university students everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
