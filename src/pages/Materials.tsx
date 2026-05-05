import React, { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, updateDoc } from "firebase/firestore";
import { 
  FileText, 
  Upload, 
  Trash2, 
  Plus, 
  Search, 
  Filter,
  X,
  Calendar,
  File, 
  MoreVertical,
  BrainCircuit,
  Loader2,
  CheckCircle2,
  Edit
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
  SheetFooter,
  SheetClose
} from "@/components/ui/sheet";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Set worker for PDF.js using unpkg to match the package version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function Materials() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newContent, setNewContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [updating, setUpdating] = useState(false);
  
  // Filtering state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterFileType, setFilterFileType] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "materials"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("uploadDate", "desc")
      );
      const snap = await getDocs(q);
      setMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error: any) {
      console.error("Fetch error:", error);
      if (error.code === 'failed-precondition') {
        alert("This view requires a database index. Please check the console for the setup link.");
      }
      handleFirestoreError(error, OperationType.LIST, "materials");
    } finally {
      setLoading(false);
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'txt') {
      return await file.text();
    }
    
    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    }
    
    if (extension === 'pptx') {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      let fullText = "";
      
      const slideFiles = Object.keys(zip.files).filter(name => 
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );
      
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)![0]);
        const numB = parseInt(b.match(/\d+/)![0]);
        return numA - numB;
      });

      for (const slideFile of slideFiles) {
        const content = await zip.file(slideFile)?.async('text');
        if (content) {
          const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          fullText += `[Slide ${slideFile.match(/\d+/)![0]}]: ${text}\n\n`;
        }
      }
      return fullText;
    }
    
    throw new Error("Unsupported file format. Please use PDF, PPTX, or TXT.");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (!newFileName) {
      setNewFileName(file.name.split('.').slice(0, -1).join('.'));
    }

    setExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      setNewContent(text);
    } catch (error: any) {
      alert(error.message || "Failed to extract text from file.");
      setSelectedFile(null);
    } finally {
      setExtracting(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    if (!newFileName) {
      alert("Please enter a file name.");
      return;
    }
    
    if (!newContent) {
      alert("Please select a file or paste content to upload.");
      return;
    }
    
    setUploading(true);
    try {
      await addDoc(collection(db, "materials"), {
        userId: auth.currentUser.uid,
        fileName: newFileName,
        subject: newSubject,
        content: newContent,
        uploadDate: new Date().toISOString(),
        fileType: selectedFile?.name.split('.').pop()?.toLowerCase() || 'text'
      });
      setIsUploadOpen(false);
      setNewFileName("");
      setNewSubject("");
      setNewContent("");
      setSelectedFile(null);
      fetchMaterials();
    } catch (error: any) {
      console.error("Upload error:", error);
      alert("Failed to upload material. Please check your connection or try again.");
      handleFirestoreError(error, OperationType.CREATE, "materials");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this material?")) return;
    try {
      await deleteDoc(doc(db, "materials", id));
      setMaterials(materials.filter(m => m.id !== id));
    } catch (error: any) {
      console.error("Delete error:", error);
      alert("Failed to delete material. Please try again.");
      handleFirestoreError(error, OperationType.DELETE, `materials/${id}`);
    }
  };

  const openEditDialog = (material: any) => {
    setCurrentMaterialId(material.id);
    setEditFileName(material.fileName);
    setEditSubject(material.subject || "");
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMaterialId) return;
    
    if (!editFileName.trim()) {
      alert("File name cannot be empty.");
      return;
    }

    setUpdating(true);
    try {
      await updateDoc(doc(db, "materials", currentMaterialId), {
        fileName: editFileName,
        subject: editSubject
      });
      setIsEditOpen(false);
      fetchMaterials();
    } catch (error: any) {
      console.error("Update error:", error);
      alert("Failed to update material. Please try again.");
      handleFirestoreError(error, OperationType.UPDATE, `materials/${currentMaterialId}`);
    } finally {
      setUpdating(false);
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.subject && m.subject.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSubject = filterSubject === "all" || m.subject === filterSubject;
    const matchesFileType = filterFileType === "all" || m.fileType === filterFileType;
    
    let matchesDate = true;
    if (filterStartDate) {
      matchesDate = matchesDate && isAfter(new Date(m.uploadDate), startOfDay(new Date(filterStartDate)));
    }
    if (filterEndDate) {
      matchesDate = matchesDate && isBefore(new Date(m.uploadDate), endOfDay(new Date(filterEndDate)));
    }

    return matchesSearch && matchesSubject && matchesFileType && matchesDate;
  });

  const uniqueSubjects = Array.from(new Set(materials.map(m => m.subject).filter(Boolean)));
  const uniqueFileTypes = Array.from(new Set(materials.map(m => m.fileType).filter(Boolean)));

  const clearFilters = () => {
    setFilterSubject("all");
    setFilterFileType("all");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const activeFilterCount = [
    filterSubject !== "all",
    filterFileType !== "all",
    filterStartDate !== "",
    filterEndDate !== ""
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Study Materials</h1>
          <p className="text-muted-foreground">Upload and manage your study notes and documents</p>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2">
            <Plus size={18} />
            Upload Material
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleUpload}>
              <DialogHeader>
                <DialogTitle>Upload Study Material</DialogTitle>
                <DialogDescription>
                  Add your notes or document content here. AI will use this to generate study chunks and quizzes.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="file">Upload File (PDF, PPTX, TXT)</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      id="file" 
                      type="file" 
                      accept=".pdf,.pptx,.txt"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                  </div>
                  {extracting && (
                    <p className="text-xs text-primary flex items-center gap-2 animate-pulse">
                      <Loader2 size={12} className="animate-spin" />
                      Extracting text from {selectedFile?.name}...
                    </p>
                  )}
                  {selectedFile && !extracting && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      File loaded: {selectedFile.name}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fileName">File Name / Title</Label>
                  <Input 
                    id="fileName" 
                    placeholder="e.g. Introduction to Algorithms" 
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subject">Subject (Optional)</Label>
                  <Input 
                    id="subject" 
                    placeholder="e.g. Computer Science" 
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="content">Content Preview</Label>
                    <div className="flex items-center gap-2">
                      {extracting && <Loader2 size={12} className="animate-spin text-primary" />}
                      <span className="text-[10px] text-muted-foreground italic">
                        {extracting ? "Extracting text..." : newContent ? `${newContent.length} characters extracted` : "No content yet"}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <textarea 
                      id="content" 
                      className={cn(
                        "flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                        extracting && "opacity-50"
                      )}
                      placeholder="Extracted text will appear here automatically after you select a file..."
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      disabled={extracting}
                      required
                    />
                    {extracting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[1px] rounded-md">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="text-xs font-medium">Reading file...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border shadow-sm !rounded-[24px] overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-background border border-border px-4 py-2.5 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <Search size={18} className="text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search by title or subject..." 
                className="bg-transparent border-none outline-none text-sm w-full font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger render={<Button variant="outline" className="h-11 px-4 gap-2 rounded-2xl border-border hover:bg-muted relative" />}>
                <Filter size={18} />
                <span className="hidden sm:inline">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] flex items-center justify-center font-bold border-2 border-background">
                    {activeFilterCount}
                  </span>
                )}
              </SheetTrigger>
              <SheetContent className="w-[350px] sm:w-[450px] p-0">
                <SheetHeader className="p-8 border-b border-border/50 bg-muted/30">
                  <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                    <Filter className="text-primary" size={24} />
                    Advance Filters
                  </SheetTitle>
                  <SheetDescription className="text-sm font-medium mt-2">
                    Refine your material list using the criteria below.
                  </SheetDescription>
                </SheetHeader>
                
                <div className="p-8 space-y-10 overflow-y-auto flex-1">
                  {/* Subject Filter */}
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-primary/70">Subject</Label>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        onClick={() => setFilterSubject("all")}
                        className={cn(
                          "px-5 py-2.5 rounded-full text-xs font-bold transition-all border",
                          filterSubject === "all" 
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                            : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                        )}
                      >
                        All
                      </button>
                      {uniqueSubjects.map(s => (
                        <button
                          key={s}
                          onClick={() => setFilterSubject(s)}
                          className={cn(
                            "px-5 py-2.5 rounded-full text-xs font-bold transition-all border",
                            filterSubject === s 
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                              : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File Type Filter */}
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-primary/70">File Type</Label>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        onClick={() => setFilterFileType("all")}
                        className={cn(
                          "px-5 py-2.5 rounded-full text-xs font-bold transition-all border",
                          filterFileType === "all" 
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                            : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                        )}
                      >
                        All
                      </button>
                      {uniqueFileTypes.map(t => (
                        <button
                          key={t}
                          onClick={() => setFilterFileType(t)}
                          className={cn(
                            "px-5 py-2.5 rounded-full text-xs font-bold transition-all border uppercase",
                            filterFileType === t 
                              ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                              : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/30"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date Filter */}
                  <div className="space-y-4">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-primary/70">Upload Date Range</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">From</span>
                        <div className="relative group">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input 
                            type="date" 
                            className="h-11 pl-10 text-xs rounded-2xl bg-muted/30 border-border/50 focus:bg-background transition-all"
                            value={filterStartDate}
                            onChange={(e) => setFilterStartDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">To</span>
                        <div className="relative group">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input 
                            type="date" 
                            className="h-11 pl-10 text-xs rounded-2xl bg-muted/30 border-border/50 focus:bg-background transition-all"
                            value={filterEndDate}
                            onChange={(e) => setFilterEndDate(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-muted/20 border-t border-border/50 flex flex-row gap-4">
                  <Button 
                    variant="outline" 
                    className="flex-1 rounded-xl h-11 font-bold" 
                    onClick={clearFilters}
                    disabled={activeFilterCount === 0}
                  >
                    Reset All
                  </Button>
                  <SheetClose render={<Button className="flex-1 rounded-xl h-11 font-bold shadow-lg shadow-primary/20" />}>
                    Apply Filters
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading materials...</p>
            </div>
          ) : filteredMaterials.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-medium">
                    <th className="text-left py-3 px-4">Name</th>
                    <th className="text-left py-3 px-4">Subject</th>
                    <th className="text-left py-3 px-4">Date Uploaded</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((material) => (
                    <tr key={material.id} className="border-b border-border hover:bg-muted/50 transition-colors group">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                            {material.fileType === 'pdf' ? <FileText size={16} /> : 
                             material.fileType === 'pptx' ? <Plus size={16} /> : 
                             <FileText size={16} />}
                          </div>
                          <span className="font-medium">{material.fileName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {material.subject ? (
                          <Badge variant="secondary" className="font-normal">
                            {material.subject}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic">No subject</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {format(new Date(material.uploadDate), "MMM d, yyyy")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors outline-none">
                              <MoreVertical size={16} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(material)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(material.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <File size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No materials found</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1">
                {searchQuery ? "Try adjusting your search query." : "Upload your study notes to get started with AI-powered learning."}
              </p>
              {!searchQuery && (
                <Button className="mt-6" onClick={() => setIsUploadOpen(true)}>
                  Upload First Material
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Edit Material Details</DialogTitle>
              <DialogDescription>
                Update the file name and subject for your study material.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="editFileName">File Name / Title</Label>
                <Input 
                  id="editFileName" 
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editSubject">Subject</Label>
                <Input 
                  id="editSubject" 
                  placeholder="e.g. Computer Science" 
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updating}>
                {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
