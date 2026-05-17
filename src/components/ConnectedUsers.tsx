import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';
import { Users, User, Circle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';

export default function ConnectedUsers() {
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    let subscription: any;

    const fetchOnlineUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'online');
      
      if (!error && data) {
        const users = (data as UserProfile[]).filter(u => {
          const r = (u.role || '').toLowerCase();
          return r !== 'pendiente' && r !== 'waiting' && r !== 'receso';
        });
        setOnlineUsers(users);
      }
    };

    fetchOnlineUsers();

    subscription = supabase
      .channel('public:users:online')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        fetchOnlineUsers();
      })
      .subscribe();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [profile?.uid]);

  const getRoleName = (r: string) => {
    switch(r) {
      case 'pharmacy': return 'Farmacia';
      case 'admin': return 'Administrador';
      case 'admission': return 'Admisión';
      case 'nurse': return 'Biometría';
      case 'doctor': return 'Médico';
      case 'nutritionist': return 'Nutrición';
      case 'ecografista': return 'Ecografía';
      case 'psiquiatra': return 'Psiquiatría';
      case 'odontologo': return 'Odontología';
      default: return r;
    }
  };

  return (
    <div className="relative flex items-center">
      <button 
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          "flex items-center justify-center p-2 rounded-2xl border transition-all active:scale-95 shadow-sm",
          showDropdown ? "border-emerald-200 bg-emerald-50 ring-4 ring-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
        )}
        title="Usuarios en línea"
      >
        <div className="relative flex items-center justify-center">
          <Users className={cn("h-5 w-5", showDropdown ? "text-emerald-600" : "text-slate-500")} />
          <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
            {onlineUsers.length > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white items-center justify-center text-[7px] font-black text-white">
              {onlineUsers.length}
            </span>
          </div>
        </div>
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute top-12 right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl border border-slate-200 p-3 z-20 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-4 py-3 mb-2 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En Línea</p>
              <div className="flex items-center gap-1.5">
                <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                <span className="text-xs font-bold text-slate-700">{onlineUsers.length} usuarios</span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 mt-1 pr-1 custom-scrollbar">
              {onlineUsers.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-500 font-medium">No hay usuarios en línea.</p>
                </div>
              ) : (
                onlineUsers.map(u => (
                  <div key={u.uid} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                      </div>
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{u.name} {u.lastName}</p>
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest truncate">{getRoleName(u.role)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
