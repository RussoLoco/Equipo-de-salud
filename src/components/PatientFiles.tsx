import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { PatientFile } from '../types';
import { FileUp, File, Loader2, Trash2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PatientFilesProps {
  patientId: string;
}

export default function PatientFiles({ patientId }: PatientFilesProps) {
  const { profile } = useAuth();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    const q = query(
      collection(db, `patients/${patientId}/files`),
      orderBy('uploadDate', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setFiles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatientFile)));
    }, (err) => {
      console.error(err);
      // Don't crash if permission denied, just show empty
    });

    return () => unsub();
  }, [patientId]);

  const canUpload = profile && ['doctor', 'ecografista', 'psiquiatra', 'odontologo', 'nutritionist', 'admin'].includes(profile.role);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Reset input
    e.target.value = '';

    setIsUploading(true);

    try {
      let base64data = '';
      let finalSize = file.size;

      // Compress if it's an image
      if (file.type.startsWith('image/')) {
        base64data = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            const maxDim = 1200; // max width/height

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('No 2d context'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.6)); // 60% quality jpeg
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        
        // Estimate base64 size: roughly length * 0.75
        finalSize = Math.round(base64data.length * 0.75);
      } else {
        // For PDFs or other files, just convert to base64
        base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        finalSize = Math.round(base64data.length * 0.75);
      }

      // Check size limit (approx 800KB for Firestore)
      if (finalSize > 800 * 1024) {
        alert(file.type.startsWith('image/') 
          ? "Incluso con la reducción, la imagen sigue siendo muy grande. Intenta con una imagen más liviana."
          : "El archivo PDF es demasiado grande. El límite actual es de 800KB.");
        setIsUploading(false);
        return;
      }

      const fileData: Omit<PatientFile, 'id'> = {
        patientId,
        fileName: file.name,
        fileType: file.type.startsWith('image/') ? 'image/jpeg' : file.type,
        fileUrl: base64data,
        uploadedBy: profile.uid,
        uploaderName: profile.name,
        uploaderRole: profile.role,
        uploadDate: new Date().toISOString(),
        size: finalSize
      };

      await addDoc(collection(db, `patients/${patientId}/files`), fileData);

    } catch (err) {
      console.error("Error uploading/compressing file:", err);
      alert("Hubo un error al procesar el archivo.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileRec: PatientFile) => {
    if (!profile || profile.role !== 'admin') return;
    if (!window.confirm(`¿Eliminar permanentemente el archivo "${fileRec.fileName}"?`)) return;

    try {
      // Delete doc
      await deleteDoc(doc(db, `patients/${patientId}/files`, fileRec.id));

    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `files`);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <ImageIcon className="h-5 w-5 text-blue-500" />;
    return <File className="h-5 w-5 text-slate-500" />;
  };

  if (!canUpload && files.length === 0) return null;

  return (
    <div className="space-y-6 mt-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-2">
          <FileUp className="h-3.5 w-3.5" />
          Estudios y Archivos Adjuntos
        </h3>
        
        {canUpload && (
          <label className={cn(
            "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2 cursor-pointer",
            isUploading 
              ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
              : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
          )}>
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            {isUploading ? 'Subiendo...' : 'Subir Archivo'}
            <input 
              type="file" 
              className="hidden" 
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        )}
      </div>

      {files.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map(file => (
            <div key={file.id} className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col group relative overflow-hidden">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 shrink-0 flex items-center justify-center border border-slate-100">
                  {getFileIcon(file.fileType)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate" title={file.fileName}>{file.fileName}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    {format(new Date(file.uploadDate), "dd MMM HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
              
              <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
                <p className="text-[9px] font-bold text-slate-400">
                  Subido por: {file.uploaderName}
                </p>
                
                <div className="flex items-center gap-2">
                  <a 
                    href={file.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="Abrir Archivo"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {profile?.role === 'admin' && (
                    <button 
                      onClick={() => handleDelete(file)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Eliminar Archivo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50/50 p-8 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
          <ImageIcon className="h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-500">No hay archivos adjuntos</p>
          <p className="text-xs text-slate-400 mt-1">Aquí puedes guardar fotos, análisis o estudios en PDF del paciente.</p>
        </div>
      )}
    </div>
  );
}
