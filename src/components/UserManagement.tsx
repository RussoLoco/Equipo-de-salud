import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types';
import { useAuth } from './AuthProvider';
import { Users, Shield, UserCircle, Loader2, Check, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

export default function UserManagement() {
  const { profile, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');

  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  useEffect(() => {
    if (!isAdmin) return;

    let subscription: any;

    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(100);
      
      if (!error && data) {
        setUsers(data as UserProfile[]);
      }
      setLoading(false);
    };

    fetchUsers();

    subscription = supabase
      .channel('public:users:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [isAdmin]);

  const changeRole = async (targetUid: string, newRole: UserRole) => {
    setUpdatingUid(targetUid);
    try {
      const { error } = await supabase.from('users').update({
        role: newRole,
        isPending: false
      }).eq('uid', targetUid);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating role:", error);
    } finally {
      setUpdatingUid(null);
    }
  };

  const updatePhone = async (targetUid: string, newPhone: string) => {
    try {
      await supabase.from('users').update({
        phone: newPhone
      }).eq('uid', targetUid);
    } catch (error) {
      console.error("Error updating phone:", error);
    }
  };

  const getRoleName = (r: string) => {
    switch(r) {
      case 'pharmacy': return 'Farmacia';
      case 'admin': return 'Administrador';
      case 'admission': return 'Admisión';
      case 'nurse': return 'Antropometría';
      case 'nutritionist': return 'Nutrición';
      case 'ecografista': return 'Ecografía';
      case 'psiquiatra': return 'Psiquiatría';
      case 'odontologo': return 'Odontología';
      case 'receso': return 'Receso Temporal';
      case 'PENDIENTE': return 'Pendiente App';
      case 'WAITING': return 'WAITING';
      default: 
        if (String(r).toUpperCase() === 'WAITING') return 'WAITING';
        return 'Médico';
    }
  };

  const filteredUsers = useMemo(() => {
    if (roleFilter === 'ALL') return users;
    return users.filter(u => u.role === roleFilter);
  }, [users, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => {
      counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return counts;
  }, [users]);

  if (!isAdmin) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Control de Accesos</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Asignación de roles y permisos</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}
            className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none focus:ring-0 cursor-pointer min-w-[180px]"
          >
            <option value="ALL">Todos los Usuarios ({users.length})</option>
            {Object.entries(roleCounts).map(([role, count]) => (
              <option key={role} value={role}>
                {getRoleName(role)} ({count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-100">
              <th className="px-6 py-4">Usuario</th>
              <th className="px-6 py-4">Email / Teléfono</th>
              <th className="px-6 py-4">Rol Asignado</th>
              <th className="px-6 py-4 text-right">Acciones de Rol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
                  Cargando usuarios...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400 font-medium">
                  No hay usuarios con este rol.
                </td>
              </tr>
            ) : filteredUsers.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.name} className="h-8 w-8 rounded-full border border-slate-200 object-cover shadow-sm bg-white" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shadow-sm">
                        <UserCircle className="h-5 w-5" />
                      </div>
                    )}
                    <span className="font-bold text-slate-700">{u.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-slate-500 font-medium text-xs">{u.email}</p>
                  <input 
                    type="text"
                    placeholder="Sin teléfono..."
                    defaultValue={u.phone || ''}
                    onBlur={(e) => updatePhone(u.uid, e.target.value)}
                    className="mt-1 bg-transparent border-none p-0 text-[10px] font-bold text-slate-400 focus:ring-0 focus:text-blue-500 transition-all outline-none"
                  />
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                    u.role === 'pharmacy' ? "bg-purple-100 text-purple-700 shadow-sm" : 
                    u.role === 'admin' ? "bg-slate-900 text-white shadow-lg" :
                    u.role === 'admission' ? "bg-amber-100 text-amber-700 shadow-sm" :
                    u.role === 'nurse' ? "bg-emerald-100 text-emerald-700 shadow-sm" :
                    u.role === 'nutritionist' ? "bg-orange-100 text-orange-700 shadow-sm" : 
                    u.role === 'ecografista' ? "bg-blue-900 text-blue-100 shadow-sm" :
                    u.role === 'psiquiatra' ? "bg-indigo-100 text-indigo-700 shadow-sm" :
                    u.role === 'odontologo' ? "bg-teal-100 text-teal-700 shadow-sm" :
                     u.role === 'receso' ? "bg-slate-200 text-slate-700 shadow-sm" :
                    u.role === 'PENDIENTE' || String(u.role).toUpperCase() === 'WAITING' ? "bg-red-50 text-red-600 border border-red-100 animate-pulse" :
                    "bg-blue-100 text-blue-700 shadow-sm"
                  )}>
                    {u.role === 'pharmacy' ? 'Farmacia' : 
                     u.role === 'admin' ? 'Administrador' : 
                     u.role === 'admission' ? 'Admisión' : 
                     u.role === 'nurse' ? 'Antropometría' : 
                     u.role === 'nutritionist' ? 'Nutrición' : 
                     u.role === 'ecografista' ? 'Ecografía' :
                     u.role === 'psiquiatra' ? 'Psiquiatría' :
                     u.role === 'odontologo' ? 'Odontología' :
                      u.role === 'receso' ? 'Receso Temporal' :
                     u.role === 'PENDIENTE' || String(u.role).toUpperCase() === 'WAITING' ? (String(u.role).toUpperCase() === 'WAITING' ? 'WAITING' : 'Pendiente App') : 'Médico'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <select
                      disabled={updatingUid === u.uid}
                      value={u.role}
                      onChange={(e) => changeRole(u.uid, e.target.value as UserRole)}
                      className="text-[10px] font-black uppercase tracking-widest bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                      <option value="PENDIENTE">PENDIENTE</option>
                      <option value="doctor">MÉDICO</option>
                      <option value="nurse">ANTROPOMETRÍA</option>
                      <option value="pharmacy">FARMACIA</option>
                      <option value="admission">ADMISIÓN</option>
                      <option value="nutritionist">NUTRICIÓN</option>
                      <option value="ecografista">ECOGRAFÍA</option>
                      <option value="psiquiatra">PSIQUIATRÍA</option>
                      <option value="odontologo">ODONTOLOGÍA</option>
                      <option value="receso">RECESO TEMPORAL</option>
                      <option value="admin">ADMIN</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
