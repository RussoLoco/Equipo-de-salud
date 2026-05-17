import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Order, Patient, Medicine, OrderItem } from '../types';
import { 
  History, 
  Users, 
  ClipboardList, 
  TrendingDown, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Activity, 
  Pill,
  ArrowRight,
  Download,
  Trash2,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../lib/utils';

export default function AdminHistory() {
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'patients' | 'stock' | 'files'>('prescriptions');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data States
  const [prescriptions, setPrescriptions] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stockOutLog, setStockOutLog] = useState<{
    id: string;
    drugName: string;
    quantity: number;
    patientName: string;
    date: string;
    doctorName: string;
  }[]>([]);
  
  const [fileLogs, setFileLogs] = useState<{
    id: string;
    fileName: string;
    size: number;
    uploaderName: string;
    uploadDate: string;
    patientId: string;
  }[]>([]);

  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

  const deletePatient = async (id: string) => {
    setIsDeleting(true);
    setDeletingPatientId(null);
    try {
      await supabase.from('patients').delete().eq('id', id);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteAllPatients = async () => {
    setIsDeleting(true);
    setConfirmingDeleteAll(false);
    try {
      await supabase.from('patients').delete().not('id', 'is', null);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let subOrders: any;
    let subPatients: any;
    let subFiles: any;

    const fetchData = async () => {
      setLoading(true);
      
      // 1. Fetch Prescriptions (Orders)
      const { data: ordersData } = await supabase.from('orders').select('*').order('date', { ascending: false }).limit(100);
      if (ordersData) {
        setPrescriptions(ordersData as Order[]);
        
        // Derived: Stock Out Log (Only from delivered orders)
        const stockLog = ordersData
          .filter(o => o.status === 'Entregado')
          .flatMap(o => o.items.map(item => ({
            id: `${o.orderId}-${item.drugName}`,
            drugName: item.drugName,
            quantity: parseInt(item.quantity.replace(/[^0-9]/g, '')) || 0,
            patientName: o.patientName || 'Anónimo',
            doctorName: o.doctorName,
            date: o.deliveredAt || o.date
          })));
        setStockOutLog(stockLog as any);
      }

      // 2. Fetch Patients
      const { data: pats } = await supabase.from('patients').select('*').order('name', { ascending: true }).limit(100);
      if (pats) {
        setPatients(pats as Patient[]);
      }

      // 3. Fetch Files
      const { data: allFiles } = await supabase.from('patient_files').select('*').order('uploadDate', { ascending: false });
      if (allFiles) {
        setFileLogs(allFiles as any[]);
      }

      setLoading(false);
    };

    fetchData();

    subOrders = supabase.channel('public:orders:admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      }).subscribe();
      
    subPatients = supabase.channel('public:patients:admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        fetchData();
      }).subscribe();
      
    subFiles = supabase.channel('public:patient_files:admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_files' }, () => {
        fetchData();
      }).subscribe();

    return () => {
      if (subOrders) supabase.removeChannel(subOrders);
      if (subPatients) supabase.removeChannel(subPatients);
      if (subFiles) supabase.removeChannel(subFiles);
    };
  }, []);

  const filteredPrescriptions = prescriptions.filter(p => 
    p.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.doctorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.orderId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.dni.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStock = stockOutLog.filter(s => 
    s.drugName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.patientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFiles = fileLogs.filter(f => 
    f.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.uploaderName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-fit shadow-inner">
          <button 
            onClick={() => setActiveTab('prescriptions')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              activeTab === 'prescriptions' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Recetas
          </button>
          <button 
            onClick={() => setActiveTab('patients')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              activeTab === 'patients' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Beneficiarios
          </button>
          <button 
            onClick={() => setActiveTab('stock')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              activeTab === 'stock' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            Stock Saliente
          </button>
          <button 
            onClick={() => setActiveTab('files')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all",
              activeTab === 'files' ? "bg-white text-blue-600 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Archivos ({fileLogs.length})
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por nombre, DNI o droga..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Recetas Emitidas */}
        {activeTab === 'prescriptions' && (
          <div className="grid grid-cols-1 gap-4">
            {filteredPrescriptions.map(order => (
              <div key={order.orderId} className="bg-white border border-slate-200 p-6 rounded-[2rem] hover:shadow-xl transition-all group overflow-hidden relative">
                <div className={cn(
                  "absolute top-0 right-0 px-4 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-xl",
                  order.status === 'Entregado' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                )}>
                  {order.status === 'Entregado' ? 'Dispensado' : 'Pendiente'}
                </div>
                
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{order.patientName}</h4>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI {order.patientDni}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500 font-bold">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.date), 'dd/MM/yyyy HH:mm', { locale: es })}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 pt-4 md:pt-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Prescripción por Dr/a. {order.doctorName}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                          <span className="text-xs font-bold text-slate-700">{item.drugName}</span>
                          <span className="text-[10px] font-black bg-white px-2 py-1 border border-slate-200 rounded-lg">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {order.deliveredAt && (
                    <div className="md:w-48 flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 pt-4 md:pt-0">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Entregado en Farmacia</p>
                      <p className="text-[10px] font-bold text-slate-500">{format(new Date(order.deliveredAt), 'dd/MM/yyyy HH:mm', { locale: es })}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Listado de Pacientes */}
        {activeTab === 'patients' && (
          <div className="space-y-6">
            <div className="flex justify-end pr-4">
              {confirmingDeleteAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-red-600 tracking-widest bg-red-50 px-4 py-3 rounded-2xl">¿IRREVERSIBLE! CONFIRMAR VACIADO?</span>
                  <button onClick={deleteAllPatients} disabled={isDeleting} className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all">SÍ, BORRAR TODO</button>
                  <button onClick={() => setConfirmingDeleteAll(false)} className="px-4 py-3 text-slate-400 hover:bg-slate-100 rounded-[1.5rem] text-[10px] font-black uppercase transition-all">Cancelar</button>
                </div>
              ) : (
                <button 
                  onClick={() => setConfirmingDeleteAll(true)}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all border border-red-100 shadow-sm shadow-red-50 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {isDeleting ? 'Borrando...' : 'Eliminar Todos los Pacientes'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatients.map(patient => (
              <div key={patient.id} className="group bg-white border border-slate-200 p-8 rounded-[2.5rem] hover:shadow-xl transition-all space-y-6">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                    <User className="h-7 w-7" />
                  </div>
                  <div className="flex flex-col items-end">
                    {deletingPatientId === patient.id ? (
                      <div className="flex flex-col items-end gap-1 mb-2 bg-red-50 p-2 rounded-xl">
                        <span className="text-[8px] font-black text-red-600 uppercase">¿Seguro?</span>
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); deletePatient(patient.id); }} className="text-[10px] font-black text-white bg-red-600 px-2 py-1 rounded hover:bg-red-700">Sí</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletingPatientId(null); }} className="text-[10px] font-black text-slate-500 bg-white px-2 py-1 rounded hover:bg-slate-200">No</button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeletingPatientId(patient.id); }}
                        disabled={isDeleting}
                        className={cn(
                          "p-2 rounded-xl transition-all mb-2",
                          isDeleting ? "text-slate-200 cursor-not-allowed" : "text-slate-300 hover:text-red-500 hover:bg-red-50"
                        )}
                        title="Eliminar Paciente"
                      >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                    <span className="text-[10px] font-bold text-slate-300">ID: {patient.id.slice(0, 8)}</span>
                    <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-widest mt-1">
                      {patient.category || 'Paciente'}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900">{patient.name}</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI {patient.dni}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Edad</p>
                    <p className="text-xs font-bold text-slate-700">{patient.age || '---'} años</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contacto</p>
                    <p className="text-xs font-bold text-slate-700">{patient.phone || '---'}</p>
                  </div>
                  <div className="col-span-2 space-y-1 mt-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación</p>
                    <p className="text-[10px] font-bold text-slate-500 leading-tight">{patient.location || 'No especificada'}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3" />
                      Antecedentes Clínicos
                    </p>
                    <p className="text-[10px] text-slate-600 line-clamp-3 leading-relaxed">
                      {patient.clinicalHistory || 'Sin antecedentes registrados.'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        {/* Reposición de Existencias (Stock Out Log) */}
        {activeTab === 'stock' && (
          <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Registro de Salidas de Stock</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Medicamentos entregados a pacientes</p>
              </div>
              <button className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors">
                <Download className="h-5 w-5" />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Medicamento</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cant.</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Médico</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((log) => (
                    <tr key={log.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5 text-[10px] font-bold text-slate-500">
                        {format(new Date(log.date), 'dd/MM HH:mm', { locale: es })}
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-black text-slate-800">{log.drugName}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center justify-center min-w-[2.5rem] h-8 bg-blue-50 text-blue-600 rounded-xl text-xs font-black border border-blue-100">
                          {log.quantity}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-xs font-bold text-slate-600">{log.patientName}</td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                             <User className="h-3 w-3" />
                           </div>
                           <span className="text-[10px] font-bold text-slate-500">Dr. {log.doctorName}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredStock.length === 0 && (
              <div className="p-20 text-center">
                <TrendingDown className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No se registran salidas de stock aún</p>
              </div>
            )}
          </div>
        )}

        {/* Archivos (Upload history limit UI) */}
        {activeTab === 'files' && (
          <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Registro de Archivos</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-orange-500">
                  Total Archivos: {fileLogs.length} | Límite Aproximado (Firestore Tier): ~1,200
                </p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Archivo</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso / Disp.</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Profesional</th>
                    <th className="px-8 py-4 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((log) => {
                    const mbSize = (log.size / (1024 * 1024)).toFixed(2);
                    return (
                      <tr key={log.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5 text-[10px] font-bold text-slate-500">
                          {format(new Date(log.uploadDate), 'dd/MM HH:mm', { locale: es })}
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-slate-800">{log.fileName}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="inline-flex items-center justify-center min-w-[3.5rem] h-8 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black border border-orange-100">
                            {mbSize} MB
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                             <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                               <User className="h-3 w-3" />
                             </div>
                             <span className="text-[10px] font-bold text-slate-500">{log.uploaderName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <button 
                            onClick={async () => {
                              if (window.confirm(`¿Seguro que deseas eliminar permanentemente el archivo "${log.fileName}"?`)) {
                                try {
                                  await supabase.from('patient_files').delete().eq('id', log.id);
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            title="Eliminar Archivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredFiles.length === 0 && (
              <div className="p-20 text-center">
                <Download className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No hay archivos registrados globalmente todavía.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
