import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CortexLogo } from "@/components/cortex-logo";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Users,
  GraduationCap,
  Flag,
  Coins,
  Plus,
  Trash2,
  LogOut,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  FileText,
  MessageSquare,
  Video,
  Eye,
  Download,
  FileCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatAuthError, validateSignIn, validateSignUp } from "@/lib/auth-errors";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { auth, db, storage } from "@/integrations/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureUserDocument, getUser } from "@/services/users";
import { buildTutorProfile } from "@/services/tutors";
import { errorMessage } from "@/services/common";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Cortex" }, { name: "description", content: "Cortex admin console." }],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const { user, role, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  if (!user || role !== "admin") return <AdminLogin />;
  return <AdminPanel />;
}

function AdminLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (mode === "signup") {
      const val = validateSignUp({ email: cleanEmail, password, role: "admin" });
      if (!val.valid && val.error) {
        setFormError(val.error);
        toast.error(val.error);
        return;
      }
    } else {
      const val = validateSignIn(cleanEmail, password);
      if (!val.valid && val.error) {
        setFormError(val.error);
        toast.error(val.error);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        // Admin rights can no longer be self-assigned. Creating an account here only creates a normal account and
        // sends a verification email; /admins/{uid} can then be claimed on sign-in, but ONLY by a verified email
        // that an existing admin has added to /admin_emails (enforced by firestore.rules).
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: cleanEmail.split("@")[0] });
        await ensureUserDocument(cred.user, { displayName: cleanEmail.split("@")[0] });
        await sendEmailVerification(cred.user).catch(() => undefined);
        await fbSignOut(auth);
        toast.success(
          "Account created. Verify your email, then sign in. Admin access is granted only to pre-approved addresses.",
        );
        setMode("signin");
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const adminDoc = await getDoc(doc(db, "admins", cred.user.uid));
      if (!adminDoc.exists()) {
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user).catch(() => undefined);
          await fbSignOut(auth);
          throw new Error("Please verify your email first (we just re-sent the link), then sign in again.");
        }
        try {
          // Succeeds only if this verified email is on the allow-list.
          await setDoc(doc(db, "admins", cred.user.uid), {
            uid: cred.user.uid,
            email: cleanEmail,
            createdAt: serverTimestamp(),
          });
        } catch {
          await fbSignOut(auth);
          throw new Error("This email is not authorized for admin access.");
        }
      }
      navigate({ to: "/admin" });
    } catch (err: unknown) {
      const msg = formatAuthError(err);
      setFormError(msg);
      toast.error(msg);
      try {
        await fbSignOut(auth);
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6 bg-secondary">
      <Card className="w-full max-w-md rounded-lg border-border p-8 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-tight">Admin console</h1>
            <p className="text-xs text-muted-foreground">
              Restricted access — allowlisted emails only.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{formError}</div>
            </div>
          )}
          <div>
            <Label>Email</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (formError) setFormError(null);
                }}
                type="email"
                required
                className="h-11 rounded-md pl-9"
                placeholder="admin@example.com"
              />
            </div>
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>Password</span>
              {mode === "signup" && (
                <span className="text-[11px] text-muted-foreground font-normal">
                  Min. 8 characters
                </span>
              )}
            </Label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                type="password"
                required
                className="h-11 rounded-md pl-9"
                placeholder="••••••••"
              />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11 rounded-md">
            {mode === "signup" ? "Create admin account" : "Sign in"}{" "}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                First time?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setFormError(null);
                  }}
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  Create admin account
                </button>
              </>
            ) : (
              <>
                Already provisioned?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setFormError(null);
                  }}
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
          <div className="text-center text-[11px] text-muted-foreground">
            <Link to="/" className="underline underline-offset-4">
              Back to home
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

type TutorApp = {
  id: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
  bio: string | null;
  credentials: string | null;
  degreeProof?: {
    name: string;
    type: string;
    size: number;
    /** Storage path (tutor-proofs/{uid}/…). Legacy applications may still carry inline base64 in `data`. */
    path?: string;
    data?: string;
  } | null;
  rates?: {
    materials?: number;
    asyncQa?: number;
    zoomMeeting?: number;
  } | null;
  status: string;
};

function AdminPanel() {
  const navigate = useNavigate();
  const { user, signOut: ctxSignOut } = useAuth();
  const [apps, setApps] = useState<TutorApp[]>([]);
  const [admins, setAdmins] = useState<{ email: string }[]>([]);
  const [newAdmin, setNewAdmin] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    type: string;
    size: number;
    data: string;
    applicantName?: string;
  } | null>(null);

  /** Resolve a Storage path to a short-lived-by-rules download URL (only admins/owner can read tutor-proofs/). */
  async function openProof(a: TutorApp) {
    const proof = a.degreeProof;
    if (!proof) return;
    try {
      const url = proof.path ? await getDownloadURL(storageRef(storage, proof.path)) : (proof.data ?? "");
      if (!url) throw new Error("This application has no readable document.");
      setSelectedDoc({
        name: proof.name,
        type: proof.type,
        size: proof.size,
        data: url,
        applicantName: a.displayName ?? a.email ?? "Applicant",
      });
    } catch (e) {
      toast.error(errorMessage(e, "Could not load the document."));
    }
  }

  async function loadApps() {
    const q = query(collection(db, "tutor_applications"), where("status", "==", "pending"));
    const snap = await getDocs(q);
    setApps(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      })) as TutorApp[],
    );
  }
  async function loadAdmins() {
    try {
      const snap = await getDocs(collection(db, "admin_emails"));
      setAdmins(
        snap.docs.map((d) => ({
          email: ((d.data() as Record<string, unknown>).email as string) ?? d.id,
        })),
      );
    } catch (e: unknown) {
      console.error("Failed to load admin list:", e);
    }
  }
  useEffect(() => {
    loadApps();
    loadAdmins();
  }, []);

  /** Approve: application + user role + public tutor listing change together or not at all. */
  async function approve(app: TutorApp) {
    try {
      const applicant = await getUser(app.userId);
      if (!applicant) throw new Error("Applicant account no longer exists.");
      const rates = {
        materials: app.rates?.materials ?? 15,
        asyncQa: app.rates?.asyncQa ?? 25,
        zoomMeeting: app.rates?.zoomMeeting ?? 50,
      };
      const batch = writeBatch(db);
      batch.update(doc(db, "tutor_applications", app.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", app.userId), {
        role: "tutor",
        tutorStatus: "approved",
        credentials: app.credentials,
        bio: app.bio,
        rates,
        degreeProofName: app.degreeProof?.name ?? null,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "tutor_profiles", app.userId), {
        ...buildTutorProfile(applicant, {
          credentials: app.credentials ?? "Verified Tutor",
          bio: app.bio ?? "",
          rates,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, "users", app.userId, "notifications")), {
        type: "system",
        title: "Tutor application approved 🎉",
        text: "You're now a Verified Tutor. Set your availability in the Teacher Studio.",
        read: false,
        actorId: user?.uid ?? "",
        actionUrl: "/teacher",
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      toast.success("Tutor approved and activated");
      loadApps();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to approve"));
    }
  }
  async function reject(app: TutorApp) {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "tutor_applications", app.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", app.userId), {
        tutorStatus: "rejected",
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      toast.success("Application rejected");
      loadApps();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to reject"));
    }
  }
  async function addAdmin() {
    const email = newAdmin.trim().toLowerCase();
    if (!email) return;
    try {
      await setDoc(doc(db, "admin_emails", email), { email, createdAt: serverTimestamp() });
      setNewAdmin("");
      toast.success("Admin email added");
      loadAdmins();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Failed");
    }
  }
  async function removeAdmin(email: string) {
    try {
      await deleteDoc(doc(db, "admin_emails", email.toLowerCase()));
      loadAdmins();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Failed");
    }
  }
  async function signOut() {
    await ctxSignOut();
    navigate({ to: "/admin" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <CortexLogo size={28} />
          <div className="text-sm font-bold tracking-tight">Cortex Admin</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={signOut} size="sm" variant="ghost" className="rounded-md">
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <div className="p-6 md:p-8">
        <div className="mb-6">
          <h1 className="font-display text-4xl tracking-tight">Admin panel</h1>
          <p className="text-muted-foreground">Keep the ecosystem healthy.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Users, l: "Pending tutors", v: String(apps.length) },
            { icon: GraduationCap, l: "Admin emails", v: String(admins.length) },
            { icon: Coins, l: "Credits (soon)", v: "—" },
            { icon: Flag, l: "Open reports", v: "—" },
          ].map((s) => (
            <Card key={s.l} className="rounded-2xl border-border p-5 shadow-soft">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-2xl font-bold">{s.v}</div>
              <div className="text-xs text-muted-foreground">{s.l}</div>
            </Card>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border-border p-6 shadow-soft space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Pending teacher verifications
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review applicant qualification documents and requested service rates before
                approval.
              </p>
            </div>

            {apps.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
                No pending applications at this time.
              </div>
            )}

            {apps.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {a.displayName ?? a.email ?? a.userId.slice(0, 8)}
                      {a.degreeProof && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium"
                        >
                          Degree Attached
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.email}</div>
                    <div className="text-xs font-medium text-foreground mt-1">
                      Credentials:{" "}
                      <span className="text-muted-foreground font-normal">
                        {a.credentials || "Not specified"}
                      </span>
                    </div>
                    {a.bio && (
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {a.bio}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg h-8 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => reject(a)}
                    >
                      Reject
                    </Button>
                    <Button size="sm" className="rounded-lg h-8 text-xs" onClick={() => approve(a)}>
                      Approve
                    </Button>
                  </div>
                </div>

                {/* Service Rates Grid */}
                <div className="rounded-lg bg-secondary/50 p-2.5 border border-border/50">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-amber-500" /> Requested Service Rates
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded border bg-background p-2">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3 text-primary" /> Materials
                      </div>
                      <div className="font-bold font-mono text-sm mt-0.5">
                        {a.rates?.materials ?? 15}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">cr</span>
                      </div>
                    </div>
                    <div className="rounded border bg-background p-2">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3 text-primary" /> Async Q&A (30m)
                      </div>
                      <div className="font-bold font-mono text-sm mt-0.5">
                        {a.rates?.asyncQa ?? 25}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">cr</span>
                      </div>
                    </div>
                    <div className="rounded border bg-background p-2">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Video className="h-3 w-3 text-primary" /> Zoom (45m)
                      </div>
                      <div className="font-bold font-mono text-sm mt-0.5">
                        {a.rates?.zoomMeeting ?? 50}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">cr</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Degree Proof Document Action */}
                {a.degreeProof ? (
                  <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <FileCheck className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{a.degreeProof.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(a.degreeProof.size / 1024).toFixed(0)} KB • Qualification Proof
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs bg-background shrink-0"
                      onClick={() => openProof(a)}
                    >
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      View Document
                    </Button>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                    ⚠️ No degree proof document attached with this application.
                  </div>
                )}
              </div>
            ))}
          </Card>
          <Card className="rounded-2xl border-border p-6 shadow-soft">
            <h2 className="mb-1 text-lg font-semibold tracking-tight">Admin email allowlist</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Only accounts created with these emails can sign in as admin.
            </p>
            <div className="flex gap-2 mb-3">
              <Input
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                placeholder="admin@example.com"
                className="h-10 rounded-md"
              />
              <Button onClick={addAdmin} className="rounded-md">
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            {admins.length === 0 && (
              <div className="text-sm text-muted-foreground">No admin emails yet.</div>
            )}
            {admins.map((a) => (
              <div
                key={a.email}
                className="flex items-center justify-between rounded-xl border border-border p-3 mb-2"
              >
                <div className="text-sm font-medium">{a.email}</div>
                <Button size="sm" variant="ghost" onClick={() => removeAdmin(a.email)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Badge variant="outline" className="rounded-full mt-2">
              Existing user accounts get admin on next sign-in via role assignment
            </Badge>
          </Card>
        </div>
      </div>

      {/* Degree Proof Document Viewer Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-5 w-5 text-primary" />
              Degree Qualification Proof
            </DialogTitle>
            <DialogDescription className="text-xs">
              Applicant:{" "}
              <span className="font-semibold text-foreground">{selectedDoc?.applicantName}</span> •
              Document: <span className="font-mono">{selectedDoc?.name}</span> (
              {selectedDoc ? (selectedDoc.size / 1024).toFixed(0) : 0} KB)
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto my-3 min-h-[300px] max-h-[500px] rounded-lg border border-border bg-black/5 dark:bg-white/5 p-2 flex items-center justify-center">
            {selectedDoc?.data && selectedDoc.type.includes("pdf") ? (
              <iframe
                src={selectedDoc.data}
                title="Degree Proof PDF"
                className="w-full h-[450px] rounded border bg-white"
              />
            ) : selectedDoc?.data &&
              (selectedDoc.type.includes("image") || selectedDoc.data.startsWith("data:image/")) ? (
              <img
                src={selectedDoc.data}
                alt="Degree Qualification Document"
                className="max-h-[450px] w-auto object-contain rounded shadow-sm"
              />
            ) : (
              <div className="text-center p-8 space-y-3">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                <div className="text-sm font-medium">Document preview not directly embeddable</div>
                <p className="text-xs text-muted-foreground">
                  You can download the document below to inspect the qualification proof.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {selectedDoc && (
              <a
                href={selectedDoc.data}
                download={selectedDoc.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download Document
              </a>
            )}
            <Button size="sm" variant="outline" onClick={() => setSelectedDoc(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
