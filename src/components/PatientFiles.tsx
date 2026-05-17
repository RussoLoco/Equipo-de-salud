import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { PatientFile } from '../types';
import { FileUp, File, Loader2, Trash2, ExternalLink, Image as ImageIcon, Download, X } from 'lucide-react';
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
  const [fileToDelete, setFileToDelete] = useState<PatientFile | null>(null);

  const [fileToPreview, setFileToPreview] = useState<PatientFile | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let sub: any;

    const fetchFiles = async () => {
      const { data } = await supabase.from('patient_files').select('*').eq('patientId', patientId).order('uploadDate', { ascending: false });
      if (data) setFiles(data as PatientFile[]);
    };

    fetchFiles();

    sub = supabase.channel(`public:patient_files:${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_files', filter: `patientId=eq.${patientId}` }, () => {
        fetchFiles();
      }).subscribe();

    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, [patientId]);

  const canUpload = profile && ['doctor', 'ecografista', 'psiquiatra', 'odontologo', 'nutritionist', 'admin'].includes(profile.role);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

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
            const maxDim = 1200;

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
            resolve(canvas.toDataURL('image/jpeg', 0.6));
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
        
        finalSize = Math.round(base64data.length * 0.75);
      } else {
        base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        finalSize = Math.round(base64data.length * 0.75);
      }

      if (finalSize > 800 * 1024) {
        alert(file.type.startsWith('image/') 
          ? "Incluso con la reducción, la imagen sigue siendo muy grande. Intenta con una imagen de menor resolución."
          : "El archivo PDF supera el límite de 800KB. El sistema no puede comprimir PDFs automáticamente. Por favor, saca una O VARIAS FOTOS (JPG/PNG) del documento, o comprime el PDF antes de subirlo.");
        setIsUploading(false);
        return;
      }

      const newFileId = crypto.randomUUID();
      const fileData: PatientFile = {
        id: newFileId,
        patientId,
        fileName: file.name,
        fileType: file.type.startsWith('image/') ? 'image/jpeg' : file.type,
        fileUrl: base64data,
        uploadedBy: profile.uid,
        uploaderName: profile.name,
        uploaderRole: profile.role || '',
        uploadDate: new Date().toISOString(),
        size: finalSize
      };

      await supabase.from('patient_files').insert(fileData as any);

    } catch (err) {
      console.error("Error uploading/compressing file:", err);
      alert("Hubo un error al procesar el archivo.");
    } finally {
      setIsUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!profile || profile.role !== 'admin' || !fileToDelete) return;

    try {
      await supabase.from('patient_files').delete().eq('id', fileToDelete.id);
    } catch (err) {
      console.error(err);
    } finally {
      setFileToDelete(null);
    }
  };

  const handleDelete = (fileRec: PatientFile) => {
    setFileToDelete(fileRec);
  };

  const handleOpenDoc = (file: PatientFile) => {
    setFileToPreview(file);
  };

  const handleDownload = (file: PatientFile) => {
    try {
      const arr = file.fileUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) return;
      const mimeType = mimeMatch[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Error downloading file:", err);
      const link = document.createElement('a');
      link.href = file.fileUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
                <div className="w-12 h-12 rounded-2xl bg-slate-50 shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden">
                  {file.fileType.startsWith('image/') ? (
                    <img src={file.fileUrl} alt={file.fileName} className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleOpenDoc(file)} />
                  ) : (
                    getFileIcon(file.fileType)
                  )}
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
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleOpenDoc(file)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="Abrir Archivo"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDownload(file)}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                    title="Descargar Archivo"
                  >
                    <Download className="h-4 w-4" />
                  </button>
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

      {/* File Preview Modal */}
      {fileToPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl h-full max-h-[90vh] bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative border border-slate-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20">
              <h3 className="text-white font-bold text-sm truncate flex-1 pr-4">{fileToPreview.fileName}</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDownload(fileToPreview)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                  <Download className="h-3 w-3" />
                  Descargar
                </button>
                <button 
                  onClick={() => setFileToPreview(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-black/40 flex items-center justify-center p-4">
              {fileToPreview.fileType.startsWith('image/') ? (
                <img src={fileToPreview.fileUrl} alt={fileToPreview.fileName} className="max-w-full max-h-full object-contain rounded-xl" />
              ) : (
                <iframe src={fileToPreview.fileUrl} title={fileToPreview.fileName} className="w-full h-full bg-white rounded-xl border-none" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setFileToDelete(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 border border-red-200">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">¿Eliminar Archivo?</h3>
              <p className="text-sm text-slate-500 font-medium">
                Se eliminará permanentemente el archivo <span className="font-bold text-slate-700">"{fileToDelete.fileName}"</span>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => setFileToDelete(null)}
                className="flex-1 px-4 py-3 bg-white text-slate-700 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 border border-slate-200 transition-all shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all shadow-sm"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
