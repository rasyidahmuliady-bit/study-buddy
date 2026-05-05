/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Materials from "./pages/Materials";
import AIStudy from "./pages/AIStudy";
import Quiz from "./pages/Quiz";
import Progress from "./pages/Progress";
import Settings from "./pages/Settings";
import StudySetup from "./pages/StudySetup";
import { TooltipProvider } from "@/components/ui/tooltip";

import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./lib/firebase";
import Landing from "./pages/Landing";

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Loading Study Buddy...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/landing" element={!user ? <Landing /> : <Navigate to="/" replace />} />
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                user ? (
                  <Layout>
                    <Dashboard />
                  </Layout>
                ) : (
                  <Navigate to="/landing" replace />
                )
              }
            />
            <Route
              path="/materials"
              element={
                user ? (
                  <Layout>
                    <Materials />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/ai-study"
              element={
                user ? (
                  <Layout>
                    <AIStudy />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/study-setup"
              element={
                user ? (
                  <Layout>
                    <StudySetup />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/quiz"
              element={
                user ? (
                  <Layout>
                    <Quiz />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/progress"
              element={
                user ? (
                  <Layout>
                    <Progress />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route
              path="/settings"
              element={
                user ? (
                  <Layout>
                    <Settings />
                  </Layout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </ErrorBoundary>
  );
}

