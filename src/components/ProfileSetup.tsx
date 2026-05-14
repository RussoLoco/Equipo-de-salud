import React, { useState, useRef } from 'react';
import { Camera, Save, LogOut, Loader2, User, Phone, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';

interface ProfileSetupProps {
  profile: UserProfile;
  onComplete: (updatedProfile: UserProfile) => void;
  onSignOut: () => void;
  onCancel?: () => void;
}

export default function ProfileSetup({ profile, onComplete, onSignOut, onCancel }: ProfileSetupProps) {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(profile.photoURL || null);
  const [formData, setFormData] = useState({
    name: profile.name || '',
    lastName: profile.lastName || '',
    phone: profile.phone || ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Minify image using canvas
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Export as low quality jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImagePreview(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.lastName || !formData.phone) return;

    setLoading(true);
    try {
      const userRef = doc(db, 'users', profile.uid);
      const updatedData = {
        name: formData.name,
        lastName: formData.lastName,
        phone: formData.phone,
        photoURL: imagePreview,
        profileCompleted: true
      };

      await updateDoc(userRef, updatedData);
      onComplete({ ...profile, ...updatedData });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + profile.uid);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-200 overflow-hidden"
      >
        <div className="p-8 sm:p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-100 mb-4">
              <User className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              {onCancel ? 'Editar Perfil' : 'Completa tu Perfil'}
            </h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">
              {onCancel ? 'Actualiza tu información personal' : 'Configuración Inicial de Usuario'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative group cursor-pointer"
              >
                <div className={cn(
                  "w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center transition-all",
                  "group-hover:border-blue-100 group-hover:scale-105"
                )}>
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-slate-300" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white border-4 border-white shadow-lg">
                  <Camera className="h-4 w-4" />
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageChange} 
                accept="image/*" 
                className="hidden" 
              />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Foto de Perfil</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-200 outline-none transition-all"
                  placeholder="Ej: Juan"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Apellido</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-200 outline-none transition-all"
                  placeholder="Ej: Pérez"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Teléfono Celular</label>
              <div className="relative">
                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-200 outline-none transition-all"
                  placeholder="Ej: +54 9 11 ..."
                />
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <button
                type="submit"
                disabled={loading || !formData.name || !formData.lastName || !formData.phone}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-blue-400 group-hover:scale-110 transition-transform" />
                    {onCancel ? 'Guardar Cambios' : 'Finalizar Configuración'}
                  </>
                )}
              </button>

              {onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full py-4 text-slate-400 hover:text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar Edición
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full py-4 text-slate-400 hover:text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <div className="flex items-center justify-center gap-2">
                    <LogOut className="h-3 w-3" />
                    Regresar al Logín
                  </div>
                </button>
              )}
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
