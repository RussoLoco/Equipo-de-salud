import React, { createContext, useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { User } from "@supabase/supabase-js";
import { supabase, loginWithGoogle, logout } from "../lib/supabase";
import { UserProfile, UserRole } from "../types";
import { LogIn, Loader2 } from "lucide-react";
import ProfileSetup from "./ProfileSetup";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  activeRole: UserRole | null;
  isSuperAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  toggleAdminView: (role: UserRole) => void;
  openProfileEdit: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminViewRole, setAdminViewRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const superAdminEmail =
    import.meta.env.VITE_SUPER_ADMIN_EMAIL || "davidhhgg620@gmail.com";
  const isSuperAdmin = user?.email === superAdminEmail;

  useEffect(() => {
    let hasSetStatus = false;
    let subscription: any;

    const setupAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      handleUserChange(session?.user || null);

      if (session?.user && window.opener) {
        window.close();
        return { subscription: { unsubscribe: () => {} } }; // Dummy return
      }

      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          handleUserChange(session?.user || null);
        },
      );

      return authListener;
    };

    const handleUserChange = async (currentUser: User | null) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const { data, error } = await supabase
            .from("users")
            .select("*")
            .eq("uid", currentUser.id)
            .single();

          if (data) {
            const userProfile = data as UserProfile;
            setProfile(userProfile);

            if (!hasSetStatus) {
              const normalizedRole = (userProfile.role || "").toLowerCase();
              if (
                normalizedRole !== "pendiente" &&
                normalizedRole !== "waiting" &&
                normalizedRole !== "receso"
              ) {
                await supabase
                  .from("users")
                  .update({
                    status: "online",
                    lastActiveAt: new Date().toISOString(),
                  })
                  .eq("uid", currentUser.id);
              }
              hasSetStatus = true;
            }
          } else if (error && error.code === "PGRST116") {
            const isSuper = currentUser.email === superAdminEmail;
            const defaultRole = isSuper ? "admin" : "PENDIENTE";
            const newProfile = {
              uid: currentUser.id,
              email: currentUser.email || "",
              name: currentUser.user_metadata?.full_name || "Usuario",
              lastName: "",
              photoURL: currentUser.user_metadata?.avatar_url || "",
              role: defaultRole as any,
              phone: "",
              isPending: !isSuper,
              profileCompleted: false,
              status: defaultRole === "PENDIENTE" ? "offline" : "online",
              lastActiveAt: new Date().toISOString(),
            };
            await supabase.from("users").insert([newProfile]);
            setProfile(newProfile as UserProfile);
            hasSetStatus = true;
          }
        } catch (error) {
          console.error("Error in user change:", error);
        }

        if (subscription) {
          supabase.removeChannel(subscription);
        }
        subscription = supabase
          .channel(`user-profile-${currentUser.id}-${crypto.randomUUID()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "users",
              filter: `uid=eq.${currentUser.id}`,
            },
            (payload) => {
              setProfile(payload.new as UserProfile);
            },
          )
          .subscribe();

        setLoading(false);
      } else {
        setProfile(null);
        setAdminViewRole(null);
        if (subscription) supabase.removeChannel(subscription);
        setLoading(false);
      }
    };

    const listener = setupAuth();

    return () => {
      listener.then((l) => l.subscription.unsubscribe());
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  useEffect(() => {
    if (!user || !profile) return;
    const normalizedRole = (profile.role || "").toLowerCase();
    if (
      normalizedRole === "pendiente" ||
      normalizedRole === "waiting" ||
      normalizedRole === "receso"
    )
      return;

    let heartbeatInterval: any;

    const updateStatus = async (status: "online" | "offline") => {
      try {
        await supabase
          .from("users")
          .update({ status, lastActiveAt: new Date().toISOString() })
          .eq("uid", user.id);
      } catch (err) {}
    };

    const handleVisibilityChange = () => {
      updateStatus(
        document.visibilityState === "hidden" ? "offline" : "online",
      );
    };

    const handleBeforeUnload = () => {
      updateStatus("offline");
    };

    heartbeatInterval = setInterval(
      () => {
        if (document.visibilityState === "visible") {
          updateStatus("online");
        }
      },
      5 * 60 * 1000,
    );

    handleVisibilityChange();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(heartbeatInterval);
      updateStatus("offline");
    };
  }, [user, profile?.uid, profile?.role]);

  const [authError, setAuthError] = useState<string | null>(null);

  const signIn = async () => {
    try {
      setAuthError(null);
      const user = await loginWithGoogle();
      if (!user) {
        setAuthError(
          "El inicio de sesión fue cancelado o bloqueado por el navegador.",
        );
      }
    } catch (error: any) {
      setAuthError("Error al iniciar sesión. Por favor, intente de nuevo.");
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  const toggleAdminView = (role: UserRole) => {
    if (isSuperAdmin || profile?.role === "admin") {
      setAdminViewRole(role);
    }
  };

  const openProfileEdit = () => {
    setIsEditingProfile(true);
  };

  const activeRole =
    (isSuperAdmin || profile?.role === "admin") && adminViewRole
      ? adminViewRole
      : profile?.role || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        activeRole,
        isSuperAdmin,
        signIn,
        signOut: handleSignOut,
        toggleAdminView,
        openProfileEdit,
      }}
    >
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center bg-slate-50">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      ) : user && profile ? (
        !profile.profileCompleted || isEditingProfile ? (
          <ProfileSetup
            profile={profile}
            onComplete={(updated) => {
              setProfile(updated);
              setIsEditingProfile(false);
            }}
            onSignOut={handleSignOut}
            onCancel={
              profile.profileCompleted
                ? () => setIsEditingProfile(false)
                : undefined
            }
          />
        ) : (
          children
        )
      ) : (
        <div className="relative flex h-screen w-full overflow-hidden items-center justify-center bg-slate-50 font-sans">
          {/* Fondo Periférico de Imágenes (Photos) */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            {[
              {
                url: "/1.jpg",
                className:
                  "top-[-5%] md:top-[5%] left-[-10%] md:left-[5%] w-40 md:w-48 rotate-[-15deg] md:rotate-[-6deg]",
              },
              {
                url: "/2.jpg",
                className:
                  "hidden md:block top-[15%] left-[25%] lg:left-[22%] w-40 rotate-[4deg]",
              },
              {
                url: "/3.jpg",
                className:
                  "hidden md:block top-[8%] right-[10%] lg:right-[20%] w-48 md:w-56 rotate-[-3deg]",
              },
              {
                url: "/4.jpg",
                className:
                  "hidden lg:block bottom-[10%] left-[8%] w-60 rotate-[5deg]",
              },
              {
                url: "/5.jpg",
                className:
                  "hidden md:block bottom-[25%] left-[10%] lg:left-[28%] w-36 lg:w-44 rotate-[-8deg]",
              },
              {
                url: "/6.jpg",
                className:
                  "hidden xl:block top-[40%] left-[2%] w-44 rotate-[12deg]",
              },
              {
                url: "/7.jpg",
                className:
                  "hidden md:block top-[35%] right-[2%] lg:right-[5%] w-48 lg:w-52 rotate-[-5deg]",
              },
              {
                url: "/8.jpg",
                className:
                  "hidden md:block bottom-[15%] right-[15%] lg:right-[22%] w-44 md:w-48 rotate-[6deg]",
              },
              {
                url: "/9.jpg",
                className:
                  "bottom-[-10%] md:bottom-[5%] right-[-5%] md:right-[3%] w-48 md:w-40 rotate-[-15deg] md:rotate-[-10deg]",
              },
            ].map((img, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.1,
                  type: "spring",
                  bounce: 0.3,
                }}
                className={`absolute p-2 bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 ${img.className}`}
              >
                <img
                  src={img.url}
                  alt={`Misión ${i + 1}`}
                  className="rounded-xl w-full h-full object-cover aspect-[4/3] shadow-inner"
                />
              </motion.div>
            ))}
          </div>

          <div className="absolute inset-0 z-0 bg-slate-100/40 backdrop-blur-[1px] pointer-events-none md:hidden transition-all"></div>

          {/* Tarjeta Central de Login */}
          <div className="z-10 flex flex-col items-center p-6 w-full max-w-sm">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="w-full mb-8 rounded-3xl bg-white/80 backdrop-blur-xl p-10 shadow-2xl shadow-slate-300/60 border border-white"
            >
              <div className="mb-8 flex justify-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-200">
                  <div className="relative w-8 h-8 flex items-center justify-center">
                    <div className="absolute w-8 h-2 bg-white rounded-full"></div>
                    <div className="absolute h-8 w-2 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="mb-2 text-3xl font-black tracking-tight text-slate-800"
                >
                  Equipo de <span className="text-blue-600">salud</span>
                </motion.h1>
                <p className="mb-10 text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                  Gestión Médica y Farmacéutica
                </p>

                <div className="space-y-4">
                  {authError && (
                    <div className="mb-4 rounded-xl bg-red-50 p-3 text-[10px] font-bold uppercase tracking-widest text-red-500 border border-red-100 animate-in fade-in slide-in-from-top-2">
                      {authError}
                    </div>
                  )}
                  {window !== window.top && (
                    <div className="mb-4 rounded-xl bg-amber-50 p-3 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-200">
                      Google bloquea el inicio de sesión dentro de la vista previa. Abre la app en otra pestaña (↗) para datos reales, o usa el Modo Diseño.
                    </div>
                  )}

                  <button
                    onClick={signIn}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-8 py-4 font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-200 uppercase text-xs tracking-widest"
                  >
                    <LogIn className="h-4 w-4 text-blue-400" />
                    Validar Acceso Cloud (Google)
                  </button>

                  {window !== window.top && (
                    <button
                      onClick={() => {
                        const mockUser = {
                          id: "mock-id",
                          email: "preview@aistudio.dev",
                          user_metadata: { full_name: "Usuario de Vista Previa" }
                        } as any;
                        const mockProfile = {
                          uid: "mock-id",
                          email: "preview@aistudio.dev",
                          name: "Usuario",
                          lastName: "Vista Previa",
                          role: "admin",
                          isPending: false,
                          profileCompleted: true,
                          status: "online",
                          lastActiveAt: new Date().toISOString()
                        } as any;
                        setUser(mockUser);
                        setProfile(mockProfile);
                      }}
                      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-8 py-4 font-bold text-slate-700 transition-all hover:bg-slate-50 border-2 border-slate-200 active:scale-95 uppercase text-xs tracking-widest"
                    >
                      Ver Diseño de App (Modo Prueba)
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex items-center gap-2 text-slate-500 bg-white/60 backdrop-blur-md px-4 py-2 rounded-full border border-white"
            >
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap">
                Servidor Cloud: Operativo
              </p>
            </motion.div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
