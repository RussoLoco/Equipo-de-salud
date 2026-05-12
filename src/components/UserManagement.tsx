import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { useAuth } from './AuthProvider';
import { Users, Shield, UserCircle, Loader2, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export default function UserManagement() {
  const { profile, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'users'), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    return () => unsub();
  }, [isAdmin]);

  const changeRole = async (targetUid: string, newRole: UserRole) => {
    setUpdatingUid(targetUid);
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        role: newRole,
        isPending: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + targetUid);
    } finally {
      setUpdatingUid(null);
    }
  };

  const updatePhone = async (targetUid: string, newPhone: string) => {
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        phone: newPhone
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + targetUid);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
        <Users className="h-5 w-5 text-blue-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Control de Accesos</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Asignación de roles y permisos</p>
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
            ) : users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <UserCircle className="h-5 w-5" />
                    </div>
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
                    u.role === 'PENDIENTE' ? "bg-red-50 text-red-600 border border-red-100 animate-pulse" :
                    "bg-blue-100 text-blue-700 shadow-sm"
                  )}>
                    {u.role === 'pharmacy' ? 'Farmacia' : u.role === 'admin' ? 'Administrador' : u.role === 'admission' ? 'Admisión' : u.role === 'nurse' ? 'Antropometría' : u.role === 'nutritionist' ? 'Nutrición' : u.role === 'PENDIENTE' ? 'Pendiente App' : 'Médico'}
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
