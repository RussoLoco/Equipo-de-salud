import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { LogIn, Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  activeRole: UserRole | null;
  isSuperAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  toggleAdminView: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminViewRole, setAdminViewRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const superAdminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'davidhhgg620@gmail.com';
  const isSuperAdmin = user?.email === superAdminEmail;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            const isSuper = user.email === superAdminEmail;
            const defaultRole = isSuper ? 'admin' : 'PENDIENTE';
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              name: user.displayName || 'Usuario',
              role: defaultRole as any,
              phone: '',
              isPending: !isSuper
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
        }
      } else {
        setProfile(null);
        setAdminViewRole(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const signIn = async () => {
    await loginWithGoogle();
  };

  const handleSignOut = async () => {
    await logout();
  };

  const toggleAdminView = (role: UserRole) => {
    if (isSuperAdmin || profile?.role === 'admin') {
      setAdminViewRole(role);
    }
  };

  const activeRole = (isSuperAdmin || profile?.role === 'admin') && adminViewRole ? adminViewRole : profile?.role || null;

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      activeRole,
      isSuperAdmin,
      signIn, 
      signOut: handleSignOut,
      toggleAdminView
    }}>
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center bg-slate-50">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      ) : user && profile ? (
        children
      ) : (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-100 p-6 text-center font-sans">
          <div className="mb-8 rounded-3xl bg-white p-12 shadow-2xl shadow-slate-200 border border-slate-200 max-w-sm w-full">
            <div className="mb-8 flex justify-center">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-100">
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <div className="absolute w-8 h-2 bg-white rounded-full"></div>
                  <div className="absolute h-8 w-2 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-800">Equipo de<span className="text-blue-600">salud</span></h1>
            <p className="mb-10 text-slate-400 text-sm font-bold uppercase tracking-widest">Gestión Médica y Farmacéutica</p>
            
            <div className="space-y-4">
              <button
                onClick={signIn}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-8 py-4 font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-200 uppercase text-xs tracking-widest"
              >
                <LogIn className="h-4 w-4 text-blue-400" />
                Validar Acceso Cloud
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="max-w-md text-[10px] font-bold uppercase tracking-[0.2em]">
              Servidor Cloud: Operativo
            </p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
