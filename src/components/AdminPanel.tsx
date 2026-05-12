import React, { useState, useEffect } from 'react';
import { collection, doc, writeBatch, getDocs, getDocsFromServer, query, where, orderBy, setDoc, deleteDoc, onSnapshot, limit, getCountFromServer } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medicine, UploadRecord } from '../types';
import { Database, Check, AlertCircle, FileText, ArrowRight, Users, Upload, Trash2, Loader2, RefreshCw, Layers, ShieldAlert } from 'lucide-react';
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
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fetchHistory = async () => {
    try {
      const snap = await getDocsFromServer(query(collection(db, 'uploads_history'), orderBy('timestamp', 'desc'), limit(50)));
      setUploadHistory(snap.docs.map(d => d.data() as UploadRecord));
    } catch (e) {
      console.error('Error fetching history', e);
    }
  };

  const refreshStats = async () => {
    setLoading(true);
    try {
      // Optimization: Use getCountFromServer to avoid fetching all documents just for counting
      const invCount = await getCountFromServer(collection(db, 'inventory'));
      setTotalInventario(invCount.data().count);
      
      const ordCount = await getCountFromServer(collection(db, 'orders'));
      setTotalPedidos(ordCount.data().count);
      
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

    const qUploads = query(collection(db, 'uploads_history'), orderBy('timestamp', 'desc'), limit(50));
    const unsubUploads = onSnapshot(qUploads, (snap) => {
      setUploadHistory(snap.docs.map(d => d.data() as UploadRecord));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'uploads_history'));
    
    return () => {
      unsubUploads();
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
    let totalDeleted = 0;
    try {
      console.log('--- WIPE INVENTORY START ---');
      while (true) {
        // Query server directly to avoid cache discrepancies
        const snap = await getDocsFromServer(query(collection(db, 'inventory'), limit(500)));
        if (snap.empty) {
          console.log('Server reports inventory is empty.');
          break;
        }
        
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        
        totalDeleted += snap.size;
        console.log(`Deleted ${totalDeleted} inventory records...`);
        // Emergency break to prevent infinite loops if something goes wrong
        if (totalDeleted > 20000) break;
      }
      setTotalInventario(0); // Optimistic clear
      return totalDeleted;
    } catch (err) {
      console.error('Error in performWipeInventory:', err);
      throw err;
    } finally {
      setIsWiping(false);
    }
  };

  const performWipeOrders = async () => {
    setIsWipingOrders(true);
    let totalDeleted = 0;
    try {
      console.log('--- WIPE ORDERS START ---');
      while (true) {
        const snap = await getDocsFromServer(query(collection(db, 'orders'), limit(500)));
        if (snap.empty) {
          console.log('Server reports orders are empty.');
          break;
        }
        
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        
        totalDeleted += snap.size;
        console.log(`Deleted ${totalDeleted} order records...`);
        if (totalDeleted > 20000) break;
      }
      setTotalPedidos(0); // Optimistic clear
      return totalDeleted;
    } catch (err) {
      console.error('Error in performWipeOrders:', err);
      throw err;
    } finally {
      setIsWipingOrders(false);
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
          const count = await performWipeInventory();
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Inventario vaciado: ${count} registros eliminados.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 5000);
        } catch (err) {
          setError('Error al vaciar inventario.');
          handleFirestoreError(err, OperationType.DELETE, 'inventory');
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
          const count = await performWipeOrders();
          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Historial vaciado: ${count} registros eliminados.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 5000);
        } catch (err) {
          setError('Error al vaciar historial.');
          handleFirestoreError(err, OperationType.DELETE, 'orders');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleTotalWipe = async () => {
    triggerConfirm(
      '¿LIMPIEZA TOTAL DEL SISTEMA?',
      'Se borrará TODO: Inventario, Historial de pedidos y Cargas. Esta es la acción más crítica e irreversible.',
      async () => {
        setError(null);
        setSuccess(false);
        setLoading(true);
        try {
          const invCount = await performWipeInventory();
          const ordCount = await performWipeOrders();
          
          const uploadsSnap = await getDocsFromServer(collection(db, 'uploads_history'));
          const uploadBatch = writeBatch(db);
          uploadsSnap.forEach(d => uploadBatch.delete(d.ref));
          await uploadBatch.commit();

          await refreshStats();
          setSuccess(true);
          setSuccessMsg(`Limpieza total completa: ${invCount} registros de inventario y ${ordCount} de historial eliminados.`);
          setTimeout(() => { setSuccess(false); setSuccessMsg(null); }, 8000);
        } catch (err) {
          setError('Error durante la limpieza total.');
          handleFirestoreError(err, OperationType.DELETE, 'system');
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
          const q = query(collection(db, 'inventory'), where('uploadId', '==', upload.id));
          const snap = await getDocsFromServer(q);
          
          for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = writeBatch(db);
            snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          
          await deleteDoc(doc(db, 'uploads_history', upload.id));
          setSuccess(true);
          setSuccessMsg(`Carga "${upload.filename}" eliminada con éxito (${snap.size} registros).`);
          await refreshStats();
        } catch (err) {
          setError('Error al eliminar la carga.');
          handleFirestoreError(err, OperationType.DELETE, 'inventory');
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
      const uploadId = doc(collection(db, 'uploads_history')).id;
      let currentBatch = writeBatch(db);
      let count = 0;

      // Improved header detection
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

      // Helper to convert Excel date numbers or strings
      const formatVal = (val: any) => {
        if (typeof val === 'number' && val > 30000) {
          // Likely Excel date
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

        // Current Structure:
        // 0: ID | 1: Droga | 2: Marca | 3: Presentación | 4: Acción Ter. | 5: Dosis | 6: Stock/Cantidad | 7: Vencimiento | 8: Lab | 9: Tipo
        
        let drugId = String(row[0] || '').trim();
        let drug = String(row[1] || '').trim();
        let brandName = String(row[2] || '').trim();
        let presentation = String(row[3] || '').trim();
        let therapeuticAction = String(row[4] || '').trim();
        let dosage = String(row[5] || '').trim();
        let stock = String(row[6] || '').trim(); // "31BX8C" etc.
        let expirationDate = formatVal(row[7]);
        let laboratory = String(row[8] || '').trim();
        let categoryRaw = String(row[9] || '').toLowerCase();

        if (!drug && !brandName) {
          console.log(`Fila ${i} saltada: sin droga ni nombre comercial.`);
          continue;
        }

        const finalId = drugId || doc(collection(db, 'inventory')).id;
        const medicineRef = doc(db, 'inventory', finalId);
        
        const medData: Medicine = {
          drugId: finalId,
          drug,
          brandName,
          presentation: presentation || '',
          therapeuticAction: therapeuticAction || '',
          dosage: dosage || '',
          stock: stock,
          expirationDate: expirationDate || '',
          laboratory: laboratory || '',
          location: '', // Leave empty as requested
          category: (categoryRaw.includes('niño') || categoryRaw.includes('ped') || categoryRaw.includes('susp') ? 'Niño' : 'Adulto'),
          uploadId
        };

        currentBatch.set(medicineRef, medData);
        count++;

        if (count % 400 === 0) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          console.log(`Commit batch: ${count} items processed.`);
        }
      }

      if (count > 0) {
        if (count % 400 !== 0) {
          await currentBatch.commit();
        }

        const uploadRecord: UploadRecord = {
          id: uploadId,
          filename: filename,
          timestamp: new Date().toISOString(),
          itemCount: count
        };
        await setDoc(doc(db, 'uploads_history', uploadId), uploadRecord);

        setSuccess(true);
        setSuccessMsg(`¡Carga Exitosa! Se procesaron ${count} medicamentos.`);
        console.log('Final success:', count, 'items.');
      } else {
        setError('No se encontraron datos válidos. Verifica el orden de las columnas.');
      }
    } catch (err) {
      console.error('Error procesando filas:', err);
      setError('Error interno al guardar los datos. Revisa la consola para más detalles.');
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
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
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm space-y-8">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Mantenimiento de Datos</h2>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">Acciones críticas de limpieza y restauración</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border border-red-100 bg-red-50/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-red-600">
                  <Database className="h-5 w-5" />
                  <h3 className="font-bold">Inventario de Medicinas</h3>
                </div>
                {totalInventario !== null && (
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-in fade-in transition-all",
                    totalInventario === 0 ? "bg-slate-100 text-slate-400" : "bg-red-500 text-white shadow-lg shadow-red-200"
                  )}>
                    {totalInventario} {totalInventario === 1 ? 'Producto' : 'Productos'} en Stock
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Elimina todos los registros de la base de datos de inventario. Útil para reiniciar el sistema o cargar datos nuevos desde cero.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleWipeInventory}
                  disabled={isWiping}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isWiping ? 'Borrando...' : 'Vaciar Inventario'}
                </button>
                <button
                  onClick={handleTotalWipe}
                  disabled={isWiping || isWipingOrders}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-600 text-white border border-red-700 hover:bg-red-700 transition-all shadow-sm disabled:opacity-50"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Limpieza Total (DB)
                </button>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-700">
                  <FileText className="h-5 w-5" />
                  <h3 className="font-bold">Historial de Operaciones</h3>
                </div>
                {totalPedidos !== null && (
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest",
                    totalPedidos === 0 ? "bg-slate-100 text-slate-400" : "bg-blue-600 text-white shadow-lg shadow-blue-100"
                  )}>
                    {totalPedidos} {totalPedidos === 1 ? 'Orden' : 'Ordenes'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Elimina permanentemente el historial de pedidos, entregas y consumos. Esto no afecta el stock actual.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleWipeOrders}
                  disabled={isWipingOrders}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-slate-700 border border-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isWipingOrders ? 'Limpiando...' : 'Borrar Historial'}
                </button>
              </div>
            </div>
          </div>

          {/* Toast Notification handled at top of div */}
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
                      <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Columnas Requeridas (en orden)</h4>
                      <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
                        ID | Droga | Marca | Presentación | Acción | Dosis | Stock | Vencimiento | Laboratorio | Tipo
                      </p>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic flex items-center justify-center text-[11px] text-slate-400 leading-relaxed text-center">
                    "Recuerda que si el ID existe en el sistema, los datos se actualizarán. Si no existe, se creará un nuevo registro."
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
