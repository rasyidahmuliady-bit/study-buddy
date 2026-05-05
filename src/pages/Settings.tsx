import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updatePassword, updateEmail } from "firebase/auth";
import { 
  User, 
  Lock, 
  Bell, 
  Shield, 
  LogOut, 
  Save,
  Loader2,
  CheckCircle2,
  Award
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { collection, query, where, getDocs } from "firebase/firestore";

const PRESET_AVATARS = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=Dusty",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Coby",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Rocky",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Tink",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Jasper",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Eden",
];

export default function Settings() {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get("tab") || "profile";

  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [quizCount, setQuizCount] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    if (!auth.currentUser) return;
    try {
      const docSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUser(data);
        setName(data.name);
        setEmail(data.email);
        setAvatarUrl(data.avatarUrl || "");
      }

      // Fetch quiz count for badges
      const q = query(collection(db, "progress"), where("userId", "==", auth.currentUser.uid));
      const snap = await getDocs(q);
      setQuizCount(snap.size);
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    if (!name.trim()) {
      setMessage({ type: "error", text: "Name cannot be empty." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        name: name.trim(),
        avatarUrl
      });
      setMessage({ type: "success", text: "Profile updated successfully!" });
      
      // Update local user state for badges/etc
      const docSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (docSnap.exists()) setUser(docSnap.data());

    } catch (error: any) {
      console.error("Profile update failed:", error);
      setMessage({ type: "error", text: "Failed to update profile. Please check your internet connection." });
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await updatePassword(auth.currentUser, newPassword);
      setMessage({ type: "success", text: "Password updated successfully!" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to update password." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences and security</p>
      </div>

      {message && (
        <Alert className={cn(
          message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-destructive/10 border-destructive/20 text-destructive"
        )}>
          <div className="flex items-center gap-2">
            {message.type === "success" ? <CheckCircle2 size={18} /> : <Shield size={18} />}
            <AlertDescription>{message.text}</AlertDescription>
          </div>
        </Alert>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="profile" className="rounded-lg gap-2">
            <User size={16} />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-lg gap-2">
            <Lock size={16} />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="rounded-lg gap-2">
            <Bell size={16} />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="badges" className="rounded-lg gap-2">
            <Award size={16} />
            Badges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details and how others see you</CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateProfile}>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {name ? name[0] : "S"}
                    </AvatarFallback>
                  </Avatar>
                  
                  <Dialog>
                    <DialogTrigger type="button" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                      Change Avatar
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Choose an Avatar</DialogTitle>
                        <DialogDescription>
                          Select one of our preset cartoon avatars.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid grid-cols-4 gap-4 py-4">
                        {PRESET_AVATARS.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            className={cn(
                              "relative rounded-full overflow-hidden border-2 transition-all p-1",
                              avatarUrl === url ? "border-primary scale-110 shadow-md" : "border-transparent hover:border-muted-foreground"
                            )}
                            onClick={() => setAvatarUrl(url)}
                          >
                            <img src={url} alt={`Avatar ${i}`} className="w-12 h-12" />
                          </button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      value={email} 
                      disabled 
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed directly.</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border p-6 bg-muted/10">
                <Button type="submit" disabled={loading} className="gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Save Changes
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Ensure your account is using a long, random password to stay secure</CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdatePassword}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input 
                    id="new-password" 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input 
                    id="confirm-password" 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required 
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t border-border p-6 bg-muted/10">
                <Button type="submit" disabled={loading} className="gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                  Update Password
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for your account</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Deleting your account will remove all your materials, progress, and personal information. This action cannot be undone.
              </p>
              <Button variant="destructive">Delete Account</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified about your study progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: "Study Reminders", desc: "Get notified when it's time to review a topic." },
                { title: "Quiz Results", desc: "Receive a summary of your quiz performance via email." },
                { title: "New AI Features", desc: "Be the first to know about new AI study tools." },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="badges" className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Your Achievements</CardTitle>
              <CardDescription>Badges you've earned through your learning journey</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {[
                  { 
                    id: "starter", 
                    name: "Early Bird", 
                    desc: "Upload your first study material", 
                    unlocked: user?.materialsCount > 0 || true, // Simplification for demo
                    icon: Award,
                    color: "text-blue-500",
                    bg: "bg-blue-50"
                  },
                  { 
                    id: "enthusiast", 
                    name: "Study Enthusiast", 
                    desc: "Complete 5 AI-generated quizzes", 
                    unlocked: quizCount >= 5,
                    icon: Award,
                    color: "text-purple-500",
                    bg: "bg-purple-50"
                  },
                  { 
                    id: "master", 
                    name: "Knowledge Master", 
                    desc: "Get 100% on a quiz", 
                    unlocked: quizCount > 0, // Placeholder
                    icon: Award,
                    color: "text-yellow-600",
                    bg: "bg-yellow-50"
                  }
                ].map((badge) => (
                  <div 
                    key={badge.id} 
                    className={cn(
                      "flex flex-col items-center text-center p-6 rounded-2xl border transition-all",
                      badge.unlocked ? "bg-card border-primary/20 shadow-sm" : "bg-muted/30 border-dashed opacity-50"
                    )}
                  >
                    <div className={cn("p-4 rounded-full mb-4", badge.unlocked ? badge.bg : "bg-muted")}>
                      <badge.icon className={badge.unlocked ? badge.color : "text-muted-foreground"} size={32} />
                    </div>
                    <h3 className="font-bold mb-1">{badge.name}</h3>
                    <p className="text-xs text-muted-foreground">{badge.desc}</p>
                    {badge.unlocked ? (
                      <Badge variant="secondary" className="mt-4 bg-green-100 text-green-700">Unlocked</Badge>
                    ) : (
                      <Badge variant="outline" className="mt-4">Locked</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
