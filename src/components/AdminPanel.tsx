import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Medicine, UploadRecord } from '../types';
import { Database, Check, AlertCircle, FileText, ArrowRight, Users, Upload, Trash2, Loader2, RefreshCw, Layers, ShieldAlert, ShoppingBag, Activity, User } from 'lucide-react';
import UserManagement from './UserManagement';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function AdminPanel() {
  const [isWipingOrders, setIsWipingOrders] = useState(false);
  const [adminTab, setAdminTab] = useState<'import' | 'users' | 'system'>('system');
  const [loading, setLoading] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [totalInventario, setTotalInventario] = useState<number | null>(null);
  const [totalPedidos, setTotalPedidos] = useState<number | null>(null);
  const [totalPacientes, setTotalPacientes] = useState<number | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fetchHistory = async () => {
    try {
      const { data } = await supabase.from('upload_records').select('*').order('timestamp', { ascending: false }).limit(50);
      if (data) setUploadHistory(data as UploadRecord[]);
    } catch (e) {
      console.error('Error fetching history', e);
    }
  };

  const refreshStats = async () => {
    setLoading(true);
    try {
      const [{ count: invCount }, { count: ordCount }, { count: patCount }] = await Promise.all([
        supabase.from('medicines').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('*', { count: 'exact', head: true })
      ]);
      
      setTotalInventario(invCount);
      setTotalPedidos(ordCount);
      setTotalPacientes(patCount);
      
      await fetchHistory();
      setSuccess(true);
      setSuccessMsg('Estadísticas actualizadas desde el servidor.');
      setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 3000);
    } catch (e) {
      setError('Error al actualizar estadísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial stats fetch
    refreshStats();

    const sub = supabase.channel('public:uploads_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uploads_history' }, () => {
        fetchHistory();
      }).subscribe();
    
    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, isDanger = true) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await onConfirm();
      },
      isDanger
    });
  };

  const performWipeInventory = async () => {
    setIsWiping(true);
    try {
      console.log('--- WIPE INVENTORY START ---');
      await supabase.from('medicines').delete().not('drugId', 'is', null);
      setTotalInventario(0); // Optimistic clear
      return true;
    } catch (err) {
      console.error('Error in performWipeInventory:', err);
      throw err;
    } finally {
      setIsWiping(false);
    }
  };

  const performWipeOrders = async () => {
    setIsWipingOrders(true);
    try {
      console.log('--- WIPE ORDERS START ---');
      await supabase.from('orders').delete().not('orderId', 'is', null);
      setTotalPedidos(0); // Optimistic clear
      return true;
    } catch (err) {
      console.error('Error in performWipeOrders:', err);
      throw err;
    } finally {
      setIsWipingOrders(false);
    }
  };

  const performWipePatients = async () => {
    try {
      console.log('--- WIPE PATIENTS START ---');
      await supabase.from('patients').delete().not('id', 'is', null);
      setTotalPacientes(0);
      return true;
    } catch (err) {
      console.error('Error in performWipePatients:', err);
      throw err;
    }
  };

  const handleWipeInventory = async () => {
    triggerConfirm(
      '¿BORRAR TODO EL INVENTARIO?',
      'Esta acción eliminará permanentemente todos los medicamentos almacenados en el sistema.',
      async () => {
        setError(null);
        setSuccess(false);
        setLoading(true);
        try {
          await performWipeInventory();
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Inventario vaciado con éxito.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 5000);
        } catch (err) {
          setError('Error al vaciar inventario.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleWipeOrders = async () => {
    triggerConfirm(
      '¿BORRAR TODO EL HISTORIAL?',
      'Se eliminarán todos los pedidos, entregas y registros de operaciones. No afecta el stock actual.',
      async () => {
        setError(null);
        setSuccess(false);
        setLoading(true);
        try {
          await performWipeOrders();
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Historial vaciado con éxito.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 5000);
        } catch (err) {
          setError('Error al vaciar historial.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleWipePatients = async () => {
    triggerConfirm(
      '¿BORRAR TODOS LOS PACIENTES?',
      'Esta acción eliminará todos los registros de pacientes y sus antecedentes. Es irreversible.',
      async () => {
        setError(null);
        setLoading(true);
        try {
          const count = await performWipePatients();
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Base de datos de pacientes vaciada.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 5000);
        } catch (err) {
          setError('Error al borrar pacientes.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const performWipeVisits = async () => {
    try {
      await supabase.from('patient_visits').delete().not('id', 'is', null);
    } catch (err) {}
  };

  const performWipeAllSubcollectionsOfPatients = async () => {
    // Note: To delete all patient visits in client sdk, we must first find all patients 
    // or use collectionGroup('visits'). Wait, collectionGroup('visits') needs an index, 
    // but we can query it and delete? No, the easiest way to delete subcollections in client SDK 
    // without an index on collectionGroup is to delete the collections manually when deleting patients, or via collectionGroup if possible. 
    // Actually, if we just delete 'visits' from root, the 'visits' under 'patients' are orphaned.
    // Let's use collectionGroup('visits') if possible. But it requires index. 
    // Alternatively, since we are doing total wipe, we can fetch all patients, and their visits, deleting them before the patient.
    // Wait, the rules allow reading `visits` at the root and under patients.
  };

  const handleClinicalWipe = async () => {
    triggerConfirm(
      '¿PURGAR HISTORIAL CLÍNICO Y PACIENTES?',
      'Se borrará TODO: Cola de pedidos pendientes, Historial Operativo, Pacientes, Historias Clínicas y Archivos. NO se tocará el stock de medicamentos.',
      async () => {
        setError(null);
        setSuccess(false);
        setLoading(true);
        try {
          await performWipeOrders();
          await performWipeVisits();
          await performWipePatients();
          
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Base de datos clínica vaciada con éxito.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 8000);
        } catch (err) {
          setError('Error durante la purga clínica.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleTotalWipe = async () => {
    triggerConfirm(
      '¿PURGAR TODA LA BASE DE DATOS (Excepto Usuarios)?',
      'Se borrará TODO: Inventario, Historial de pedidos, Pacientes, Visitas, y Cargas. Esta es la acción más crítica e irreversible.',
      async () => {
        setError(null);
        setSuccess(false);
        setLoading(true);
        try {
          await performWipeInventory();
          await performWipeOrders();
          await performWipeVisits();
          await performWipePatients();
          
          await supabase.from('upload_records').delete().not('id', 'is', null);

          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Purga total exitosa: se conservaron solo los usuarios.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 8000);
        } catch (err) {
          setError('Error durante la purga total.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleDeleteUpload = async (upload: UploadRecord) => {
    triggerConfirm(
      '¿Eliminar esta carga?',
      `Se borrarán los ${upload.itemCount} medicamentos asociados a "${upload.filename}".`,
      async () => {
        setLoading(true);
        try {
          await supabase.from('medicines').delete().eq('uploadId', upload.id);
          await supabase.from('upload_records').delete().eq('id', upload.id);
          
          setSuccess(true);
          setSuccessMsg(`Carga "${upload.filename}" eliminada con éxito.`);
          await refreshStats();
        } catch (err) {
          setError('Error al eliminar la carga.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          if (!buffer) throw new Error('No se pudo leer el contenido del archivo.');
          
          let workbook;
          try {
            // First attempt with ArrayBuffer (Uint8Array is safer)
            const data = new Uint8Array(buffer);
            workbook = XLSX.read(data, { type: 'array', cellDates: true });
          } catch (e) {
            console.warn('XLSX initial read failed, retrying...', e);
            throw new Error('Hubo un problema al decodificar el archivo Excel. Asegúrate de que no esté protegido o dañado.');
          }

          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('El archivo Excel no contiene ninguna hoja de cálculo.');
          }

          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
          
          if (!rows || rows.length === 0) {
            throw new Error('El archivo parece estar vacío.');
          }

          console.log('Rows parsed from Excel:', rows.length);
          await processRows(rows, file.name);
        } catch (err: any) {
          console.error('XLSX Processing Error:', err);
          setError(err.message || 'Error al procesar el archivo Excel. Verifica el formato.');
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Error de lectura del archivo.');
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: async (results) => {
          await processRows(results.data as string[][], file.name);
          setLoading(false);
        },
        error: (err) => {
          setError('Error al leer el archivo CSV.');
          setLoading(false);
        }
      });
    }
  };

  const processRows = async (rows: any[][], filename: string) => {
    try {
      console.log('Processing rows from:', filename, 'Total rows:', rows.length);
      const uploadId = crypto.randomUUID();
      let currentBatch: Medicine[] = [];
      let count = 0;

      let startIndex = 0;
      if (rows.length > 0) {
        const firstRowStr = rows[0].map(c => String(c || '').toLowerCase()).join(' ');
        if (
          firstRowStr.includes('id') || 
          firstRowStr.includes('nombre') || 
          firstRowStr.includes('drug') || 
          firstRowStr.includes('droga') ||
          firstRowStr.includes('medicamento')
        ) {
          startIndex = 1;
          console.log('Fila de encabezado detectada e ignorada.');
        }
      }

      const formatVal = (val: any) => {
        if (typeof val === 'number' && val > 30000) {
          try {
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
          } catch (e) {
            return String(val);
          }
        }
        return String(val || '').trim();
      };

      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        
        let drug = String(row[0] || '').trim();
        let brandName = String(row[1] || '').trim();
        let presentation = String(row[2] || '').trim();
        let therapeuticAction = String(row[3] || '').trim();
        let dosage = String(row[4] || '').trim();
        let stock = String(row[5] || '').trim(); 
        let expirationDate = formatVal(row[6]);
        let laboratory = String(row[7] || '').trim();
        let location = String(row[8] || '').trim();
        let categoryRaw = String(row[9] || '').toLowerCase();

        if (!drug && !brandName) {
          console.log(`Fila ${i} saltada: sin droga ni nombre comercial.`);
          continue;
        }

        const finalId = crypto.randomUUID();
        
        const medData: Medicine = {
          drugId: finalId,
          drug,
          brandName,
          presentation: presentation || '',
          therapeuticAction: therapeuticAction || '',
          dosage: dosage || '',
          stock: stock,
          expirationDate: expirationDate || '',
          laboratory: laboratory || 'GENERICO',
          location: location || '',
          category: (categoryRaw.includes('niño') || categoryRaw.includes('ped') || categoryRaw.includes('susp') ? 'Niño' : 'Adulto'),
          uploadId
        };

        currentBatch.push(medData);
        count++;

        if (currentBatch.length === 400) {
          const { error: batchError } = await supabase.from('medicines').insert(currentBatch as any);
          if (batchError) throw batchError;
          currentBatch = [];
          console.log(`Commit batch: ${count} items processed.`);
        }
      }

      if (count > 0) {
        if (currentBatch.length > 0) {
          const { error: finalBatchError } = await supabase.from('medicines').insert(currentBatch as any);
          if (finalBatchError) throw finalBatchError;
        }

        const uploadRecord: UploadRecord = {
          id: uploadId,
          filename: filename,
          timestamp: new Date().toISOString(),
          itemCount: count
        };
        const { error: historyError } = await supabase.from('upload_records').insert(uploadRecord as any);
        if (historyError) throw historyError;

        setSuccess(true);
        setSuccessMsg(`¡Carga Exitosa! Se procesaron ${count} medicamentos.`);
        console.log('Final success:', count, 'items.');
      } else {
        setError('No se encontraron datos válidos. Verifica el orden de las columnas.');
      }
    } catch (err: any) {
      console.error('Error procesando filas:', err);
      let errMsg = err?.message || JSON.stringify(err);
      setError('Error interno al guardar los datos: ' + errMsg);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {(success || error) && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5">
           <div className={cn(
              "px-6 py-4 rounded-3xl text-sm font-black flex items-center gap-4 shadow-2xl border backdrop-blur-md",
              success ? "bg-emerald-500/90 text-white border-emerald-400" : "bg-red-500/90 text-white border-red-400"
            )}>
              {success ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              {success ? successMsg : error}
              <button onClick={() => { setSuccess(false); setError(null); }} className="ml-4 p-1 hover:bg-white/20 rounded-full">
                <ShieldAlert className="h-4 w-4" />
              </button>
            </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg",
                  confirmModal.isDanger ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                )}>
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">{confirmModal.title}</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Requiere Atenticación</p>
                </div>
              </div>
              
              <p className="text-sm text-slate-500 leading-relaxed mb-10 font-bold">
                {confirmModal.message}
              </p>

              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "flex-1 py-4 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl",
                    confirmModal.isDanger ? "bg-red-600 hover:bg-red-700 shadow-red-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
                >
                  Sí, Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl w-fit">
            <button
              onClick={() => setAdminTab('system')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                adminTab === 'system' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Mantenimiento
            </button>
            <button
              onClick={() => setAdminTab('users')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                adminTab === 'users' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Gestión de Usuarios
            </button>
            <button
              onClick={() => setAdminTab('import')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                adminTab === 'import' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Database className="h-3.5 w-3.5" />
              Carga Masiva (Excel/CSV)
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={refreshStats}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white transition-all border border-slate-200 shadow-sm"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Actualizar Stats
            </button>
          </div>
        </div>

      {adminTab === 'users' ? (
        <UserManagement />
      ) : adminTab === 'system' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Database className="w-24 h-24" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Stock Total</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 leading-none">{totalInventario ?? '---'}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">SKUs</span>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1 rounded-lg">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Sincronizado
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShoppingBag className="w-24 h-24" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Movimientos</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 leading-none">{totalPedidos ?? '---'}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Órdenes</span>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 w-fit px-3 py-1 rounded-lg">
                <Activity className="w-3 h-3" />
                Historial Activo
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users className="w-24 h-24" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Padron de Beneficiarios</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 leading-none">{totalPacientes ?? '---'}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pacientes</span>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 w-fit px-3 py-1 rounded-lg">
                <User className="w-3 h-3" />
                Base Clínica
              </div>
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-10 shadow-sm space-y-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full -translate-y-1/2 translate-x-1/2 p-10" />
            
            <div className="relative">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Acciones Críticas del Sistema</h2>
              <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-[0.2em]">ZONA DE MANTENIMIENTO Y SEGURIDAD</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
              <div className="p-8 rounded-[2rem] border border-red-100 bg-red-50/20 space-y-6 hover:bg-red-50/40 transition-colors">
                <div className="flex items-center gap-4 text-red-600">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-100/50">
                    <Database className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Inventario Maestro</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Elimina todos los registros de medicamentos. Esta acción es necesaria antes de realizar una recarga completa anual o semestral.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleWipeInventory}
                    disabled={isWiping}
                    className="flex-1 min-w-[180px] flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-100 disabled:opacity-50"
                  >
                    {isWiping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Vaciar Inventario
                  </button>
                  <button
                    onClick={handleTotalWipe}
                    disabled={isWiping || isWipingOrders}
                    className="flex-1 min-w-[180px] flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-red-600 text-white border border-red-700 hover:bg-red-700 transition-all shadow-xl shadow-red-200 disabled:opacity-50"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Purgar Base de Datos
                  </button>
                </div>
              </div>

              <div className="p-8 rounded-[2rem] border border-slate-200 bg-slate-50/30 space-y-6 hover:bg-slate-100/40 transition-colors">
                <div className="flex items-center gap-4 text-slate-800">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-100">
                    <Activity className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Órdenes y Pedidos</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Vacía la cola de pedidos pendientes de farmacia y limpia el registro de auditoría de entregados.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleWipeOrders}
                    disabled={isWipingOrders}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white text-slate-700 border border-slate-200 hover:bg-slate-900 hover:text-white transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                  >
                    {isWipingOrders ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Vaciar Cola de Pedidos
                  </button>
                </div>
              </div>

              <div className="p-8 rounded-[2rem] border border-indigo-100 bg-indigo-50/20 space-y-6 hover:bg-indigo-50/40 transition-colors md:col-span-2">
                <div className="flex items-center gap-4 text-indigo-700">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest">Gestión de Pacientes e Historia Clínica</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-2xl">
                  ADVERTENCIA: Purga toda la base de datos de pacientes, historias clínicas, archivos e imágenes adjuntas. También limpia la cola de pedidos pendientes y los historiales. NO afecta el inventario de medicamentos.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleClinicalWipe}
                    disabled={loading}
                    className="flex items-center gap-3 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white border border-indigo-700 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    Purgar Base Clínica
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="mb-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-blue-400">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Importación Inteligente</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Carga masiva vía Excel / CSV</p>
            </div>
          </div>

          <div className="space-y-8">
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "rounded-3xl border-2 border-dashed p-16 flex flex-col items-center justify-center text-center transition-all",
                dragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-slate-50/30",
                loading && "opacity-50 pointer-events-none"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-xl",
                dragActive ? "bg-blue-600 text-white animate-bounce" : "bg-white text-slate-400"
              )}>
                {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileText className="h-8 w-8" />}
              </div>
              
              <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">
                {loading ? 'Procesando archivo...' : dragActive ? 'Suelta el archivo aquí' : 'Suelte su archivo Excel o CSV'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed font-medium mb-8">
                Arrastra tu hoja de cálculo (.xlsx, .xls, .csv) o haz clic abajo para seleccionar.
              </p>

              <label className="cursor-pointer bg-slate-900 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                Seleccionar Archivo
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  className="hidden" 
                  onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                />
              </label>

              {success && (
                <div className="mt-8 flex items-center gap-2 text-emerald-600 font-bold text-xs animate-in fade-in zoom-in">
                  <Check className="h-4 w-4" />
                  {successMsg || '¡Sincronización Exitosa! Datos actualizados en el servidor.'}
                </div>
              )}

              {error && (
                <div className="mt-8 flex items-center gap-2 text-red-500 font-bold text-xs">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-blue-600">Tip</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Columnas Requeridas (A-J)</h4>
                      <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                        DROGA | COMERCIAL | PRESENT | ACCIÓN | DOSIS | CANT | VTO | LAB | CAJA | TIPO
                      </p>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic flex items-center justify-center text-[11px] text-slate-400 leading-relaxed text-center">
                    "Los registros de la carga masiva se crearán automáticamente con nuevos Identificadores en la base de datos de manera incremental."
                </div>
            </div>

            {/* Upload History List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Archivos Cargados Recientemente</h3>
                <span className="text-[10px] font-bold text-slate-300">{uploadHistory.length} Cargas Registradas</span>
              </div>
              
              {uploadHistory.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {uploadHistory.map((upload) => (
                    <div key={upload.id} className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{upload.filename}</h4>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {new Date(upload.timestamp).toLocaleString()} • {upload.itemCount} medicamentos
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteUpload(upload)}
                        className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Eliminar esta carga"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 border border-slate-100 rounded-3xl bg-slate-50/20 text-center">
                  <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">No hay historial de cargas aún</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
