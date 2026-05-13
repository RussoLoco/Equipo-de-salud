import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, getDoc, addDoc, orderBy, where, limit, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Patient, PatientVisit, Vitals, UserProfile } from '../types';
import { useAuth } from './AuthProvider';
import { Search, UserPlus, FileText, ClipboardList, Thermometer, Weight, Ruler, Activity, Check, X, Loader2, User, Calendar, History, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Patients() {
  const { profile, activeRole } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [newPatient, setNewPatient] = useState({ dni: '', name: '', age: '', location: '', phone: '', category: 'Adulto' as 'Adulto' | 'Niño' });
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<PatientVisit[]>([]);
  const [dailyQueue, setDailyQueue] = useState<PatientVisit[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const [selectedVisitForVitals, setSelectedVisitForVitals] = useState<PatientVisit | null>(null);
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [editingHistoryText, setEditingHistoryText] = useState('');
  const [vitals, setVitals] = useState<Vitals>({
    date: new Date().toISOString(),
    weight: '',
    height: '',
    temperature: '',
    bloodPressure: '',
    recordedBy: profile?.uid || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Inicio del día actual (00:00) para reiniciar turnos diariamente
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeLimit = today.toISOString();

    const qQueue = query(
      collection(db, 'visits'),
      where('status', '==', 'checkin'),
      where('date', '>=', timeLimit),
      orderBy('date', 'asc'),
      limit(100)
    );

    const unsubQueue = onSnapshot(qQueue, (snap) => {
      setDailyQueue(snap.docs.map(d => d.data() as PatientVisit));
      setLoadingQueue(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visits_queue'));

    const qPatients = query(collection(db, 'patients'), orderBy('name'), limit(100));
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setPatients(snap.docs.map(d => d.data() as Patient));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'patients'));

    return () => {
      unsubQueue();
      unsubPatients();
    };
  }, []);

  const fetchHistory = (patientId: string) => {
    const q = query(
      collection(db, `patients/${patientId}/visits`), 
      orderBy('date', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPatientHistory(snap.docs.map(d => d.data() as PatientVisit));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `patients/${patientId}/visits`));
    return unsub;
  };

  useEffect(() => {
    let unsubHistory: (() => void) | undefined;
    if (selectedPatient) {
      unsubHistory = fetchHistory(selectedPatient.id);
      setEditingHistoryText(selectedPatient.clinicalHistory || '');
    }
    return () => unsubHistory?.();
  }, [selectedPatient]);

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.dni || !newPatient.name) return;
    setIsSubmitting(true);
    try {
      const id = newPatient.dni; 
      const docRef = doc(db, 'patients', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        throw new Error('El paciente con este DNI ya existe.');
      }
      const patientData: Patient = {
        id,
        dni: newPatient.dni,
        name: newPatient.name,
        age: newPatient.age,
        location: newPatient.location,
        phone: newPatient.phone,
        category: newPatient.category,
        createdAt: new Date().toISOString()
      };
      
      const batch = writeBatch(db);
      batch.set(doc(db, 'patients', id), patientData);
      
      // Auto-checkin on registration
      const visitId = doc(collection(db, 'visits')).id;
      const visitData: PatientVisit = {
        id: visitId,
        patientId: id,
        patientName: newPatient.name,
        patientDni: newPatient.dni,
        age: newPatient.age || '',
        location: newPatient.location || '',
        date: new Date().toISOString(),
        status: 'checkin',
        vitals: {
          date: new Date().toISOString(),
          weight: '',
          height: '',
          temperature: '',
          bloodPressure: '',
          recordedBy: profile?.uid || ''
        }
      };
      batch.set(doc(db, 'visits', visitId), visitData);
      batch.set(doc(db, `patients/${id}/visits`, visitId), visitData);

      await batch.commit();
      
      setIsRegistering(false);
      setNewPatient({ dni: '', name: '', age: '', location: '', phone: '', category: 'Adulto' });
      setSelectedPatient(patientData);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'patients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckIn = async (patient: Patient) => {
    if (!profile) return;
    setIsSubmitting(true);
    try {
      // Check if already has a pending visit in the last 12 hours to avoid duplicates
      const today = new Date();
      today.setHours(today.getHours() - 12);
      const q = query(
        collection(db, 'visits'),
        where('patientId', '==', patient.id),
        where('status', 'in', ['checkin', 'espera', 'atendiendo']),
        where('date', '>=', today.toISOString())
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert('Este paciente ya tiene una consulta en curso hoy.');
        return;
      }

      const visitId = doc(collection(db, 'visits')).id;
      const visitData: PatientVisit = {
        id: visitId,
        patientId: patient.id,
        patientName: patient.name,
        patientDni: patient.dni,
        age: patient.age || '',
        location: patient.location || '',
        date: new Date().toISOString(),
        status: 'checkin',
        vitals: {
          date: new Date().toISOString(),
          weight: '',
          height: '',
          temperature: '',
          bloodPressure: '',
          recordedBy: profile.uid
        }
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'visits', visitId), visitData);
      batch.set(doc(db, `patients/${patient.id}/visits`, visitId), visitData);
      await batch.commit();

      alert(`Turno asignado correctamente para ${patient.name}. Pase a Biometría.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'visits_checkin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !profile) return;
    
    // Si estamos procesando un turno existente de la cola
    const visitId = selectedVisitForVitals?.id || doc(collection(db, 'visits')).id;
    
    setIsSubmitting(true);
    try {
      const visitData: PatientVisit = {
        id: visitId,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        patientDni: selectedPatient.dni,
        age: selectedPatient.age || '',
        location: selectedPatient.location || '',
        date: selectedVisitForVitals?.date || new Date().toISOString(),
        status: 'espera', // Pasa a espera (sala de espera médica)
        vitals: {
          ...vitals,
          date: new Date().toISOString(),
          recordedBy: profile.uid
        }
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'visits', visitId), visitData, { merge: true });
      batch.set(doc(db, `patients/${selectedPatient.id}/visits`, visitId), visitData, { merge: true });
      await batch.commit();

      setIsStartingVisit(false);
      setSelectedVisitForVitals(null);
      setVitals({
        date: '',
        weight: '',
        height: '',
        temperature: '',
        bloodPressure: '',
        recordedBy: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'visits_vitals');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateClinicalHistory = async () => {
    if (!selectedPatient || !isDoctor) return;
    setIsSubmitting(true);
    try {
      await setDoc(doc(db, 'patients', selectedPatient.id), {
        clinicalHistory: editingHistoryText
      }, { merge: true });
      
      setSelectedPatient(prev => prev ? { ...prev, clinicalHistory: editingHistoryText } : null);
      setIsEditingHistory(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'patients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    if (!isAdmin || !window.confirm('¿Estás seguro de que deseas eliminar permanentemente a este paciente y todo su historial?')) return;
    
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'patients', patientId));
      if (selectedPatient?.id === patientId) {
        setSelectedPatient(null);
      }
      alert('Paciente eliminado correctamente.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'patients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.dni.includes(searchTerm)
  );

  const canEditVitals = activeRole === 'nurse' || activeRole === 'admin';
  const isDoctor = activeRole === 'doctor';
  const isAdmission = activeRole === 'admission' || activeRole === 'admin';
  const isAdmin = activeRole === 'admin';
  const isNutritionist = activeRole === 'nutritionist';

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 relative group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o DNI..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {isAdmission && (
          <button 
            onClick={() => setIsRegistering(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo Paciente
          </button>
        )}
      </div>

      {(canEditVitals || isAdmission) && dailyQueue.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between ml-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5" />
              Cola de Biometría (Turnos del Día)
            </h3>
            <span className="bg-blue-100 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
              {dailyQueue.length} Pendientes
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {dailyQueue.map((visit, index) => (
              <button 
                key={visit.id}
                onClick={() => {
                  const p = patients.find(pat => pat.id === visit.patientId);
                  if (p) {
                    setSelectedPatient(p);
                    setSelectedVisitForVitals(visit);
                    setIsStartingVisit(true);
                  }
                }}
                className="group relative bg-white border border-slate-200 p-6 rounded-[2rem] text-left hover:border-blue-300 hover:shadow-xl transition-all space-y-4 overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-slate-900 text-white px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-bl-xl">
                  Turno #{index + 1}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 line-clamp-1">{visit.patientName}</h4>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{format(new Date(visit.date), 'HH:mm')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                   <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Tomar Biometría</span>
                   <ArrowRight className="h-3.5 w-3.5 text-blue-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Patient List */}
        <div className="xl:col-span-1 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Pacientes Registrados</h3>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredPatients.map(p => (
              <div 
                key={p.id}
                onClick={() => setSelectedPatient(p)}
                className={cn(
                  "w-full p-4 rounded-3xl border text-left transition-all flex items-center justify-between group cursor-pointer",
                  selectedPatient?.id === p.id 
                    ? "bg-slate-900 border-slate-900 shadow-xl" 
                    : "bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/10"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                    selectedPatient?.id === p.id ? "bg-white/10 text-white" : "bg-slate-50 text-slate-400 group-hover:text-blue-500"
                  )}>
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={cn("text-xs font-bold", selectedPatient?.id === p.id ? "text-white" : "text-slate-800")}>{p.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                       <p className={cn("text-[8px] font-black uppercase tracking-widest", selectedPatient?.id === p.id ? "text-slate-400" : "text-slate-300")}>DNI {p.dni}</p>
                       {p.location && (
                         <>
                           <span className={cn("w-0.5 h-0.5 rounded-full shrink-0", selectedPatient?.id === p.id ? "bg-slate-500" : "bg-slate-200")} />
                           <p className={cn("text-[8px] font-black uppercase tracking-widest truncate max-w-[80px]", selectedPatient?.id === p.id ? "text-slate-400" : "text-slate-300")}>{p.location}</p>
                         </>
                       )}
                       {p.category && (
                         <>
                           <span className={cn("w-0.5 h-0.5 rounded-full shrink-0", selectedPatient?.id === p.id ? "bg-slate-500" : "bg-slate-200")} />
                           <p className={cn("text-[8px] font-black uppercase tracking-widest", selectedPatient?.id === p.id ? "text-slate-400" : "text-slate-300")}>{p.category}</p>
                         </>
                       )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePatient(p.id);
                      }}
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                        selectedPatient?.id === p.id ? "bg-red-500/20 text-red-100 hover:bg-red-500 hover:text-white" : "bg-slate-50 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      )}
                      title="Eliminar Paciente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                    selectedPatient?.id === p.id ? "bg-white/20 text-white rotate-0" : "bg-slate-50 text-slate-300 opacity-0 group-hover:opacity-100 -rotate-90 group-hover:rotate-0"
                  )}>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Patient Details & History */}
        <div className="xl:col-span-2 space-y-8">
          {selectedPatient ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Header Info */}
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center text-blue-600 shadow-inner">
                    <User className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{selectedPatient.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">DNI: {selectedPatient.dni}</span>
                      {selectedPatient.age && (
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Edad: {selectedPatient.age} años</span>
                        </div>
                      )}
                      {selectedPatient.location && (
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Localidad: {selectedPatient.location}</span>
                        </div>
                      )}
                      {selectedPatient.phone && (
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Cel: {selectedPatient.phone}</span>
                        </div>
                      )}
                      {selectedPatient.category && (
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Cat: {selectedPatient.category}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Registrado: {format(new Date(selectedPatient.createdAt), 'dd/MM/yyyy', { locale: es })}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeletePatient(selectedPatient.id)}
                      className="w-full sm:w-auto px-6 py-4 bg-white border border-red-200 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm flex items-center gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  )}
                  {isDoctor && (
                    <button 
                      onClick={() => setIsEditingHistory(true)}
                      className="w-full sm:w-auto px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm"
                    >
                      Actualizar H. Clínica
                    </button>
                  )}
                  {canEditVitals && (
                    <button 
                      onClick={() => {
                        setSelectedVisitForVitals(null);
                        setIsStartingVisit(true);
                      }}
                      className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200"
                    >
                      Nueva Visita (Biometría)
                    </button>
                  )}
                  {isAdmission && (
                    <button 
                      onClick={() => handleCheckIn(selectedPatient)}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Ingresar a Consulta
                    </button>
                  )}
                </div>
              </div>

              {/* Permanent Clinical History Section */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-[2rem] p-8 space-y-4">
                <div className="flex justify-between items-center">
                   <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                     <FileText className="h-3.5 w-3.5" />
                     Antecedentes y Resumen Clínico Permanente
                   </h3>
                   {isDoctor && !isEditingHistory && (
                     <button 
                       onClick={() => setIsEditingHistory(true)}
                       className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                     >
                       Editar Resumen
                     </button>
                   )}
                </div>
                
                {isEditingHistory ? (
                  <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <textarea 
                      className="w-full p-6 bg-white border border-amber-200 rounded-3xl text-sm font-bold text-slate-700 min-h-[200px] focus:ring-4 focus:ring-amber-100 transition-all"
                      value={editingHistoryText}
                      onChange={(e) => setEditingHistoryText(e.target.value)}
                      placeholder="Escribe aquí los antecedentes patológicos, quirúrgicos, alérgicos y el resumen clínico permanente del paciente..."
                    />
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => {
                          setIsEditingHistory(false);
                          setEditingHistoryText(selectedPatient.clinicalHistory || '');
                        }}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleUpdateClinicalHistory}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/60 p-6 rounded-3xl border border-white shadow-sm min-h-[100px]">
                    <p className="text-sm text-slate-600 font-medium whitespace-pre-wrap leading-relaxed italic">
                      {selectedPatient.clinicalHistory || 'Sin antecedentes permanentes registrados aún.'}
                    </p>
                  </div>
                )}
              </div>

              {/* History Timeline */}
              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  Historia Clínica Evolutiva
                </h3>
                
                <div className="space-y-4">
                  {patientHistory.map((visit, index) => (
                    <div key={visit.id} className="relative pl-10 group">
                      {/* Timeline Line */}
                      {index !== patientHistory.length - 1 && (
                        <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-100 group-hover:bg-blue-100 transition-colors" />
                      )}
                      
                      {/* Timeline Dot */}
                      <div className={cn(
                        "absolute left-0 top-0 w-10 h-10 rounded-2xl border-4 border-white shadow-sm flex items-center justify-center z-10 transition-all",
                        visit.status === 'atendido' ? "bg-emerald-500 text-white scale-90" : "bg-amber-500 text-white"
                      )}>
                        {visit.status === 'atendido' ? <Check className="h-4 w-4" /> : <Activity className="h-4 w-4 animate-pulse" />}
                      </div>

                      <div className="bg-white border border-slate-200 p-6 rounded-3xl hover:border-blue-200 transition-all shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between gap-6">
                          <div className="flex-1 space-y-6">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-black text-slate-800">
                                {format(new Date(visit.date), 'EEEE dd/MM/yyyy', { locale: es })}
                              </span>
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                                visit.status === 'atendido' ? "bg-emerald-100 text-emerald-700" : 
                                visit.status === 'atendiendo' ? "bg-blue-100 text-blue-700" : 
                                "bg-amber-100 text-amber-700"
                              )}>
                                {visit.status === 'atendido' ? 'Atendido' : 
                                 visit.status === 'atendiendo' ? 'En Atención' : 
                                 'En Espera'}
                              </span>
                            </div>

                            {/* Part A: Vitals (Always Visible to Doc/Admin/Admission) */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-1">Peso</span>
                                <div className="flex items-center gap-2">
                                  <Weight className="h-3.5 w-3.5 text-blue-500" />
                                  <span className="text-xs font-bold text-slate-700">{visit.vitals.weight} kg</span>
                                </div>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-1">Talla</span>
                                <div className="flex items-center gap-2">
                                  <Ruler className="h-3.5 w-3.5 text-blue-500" />
                                  <span className="text-xs font-bold text-slate-700">{visit.vitals.height} cm</span>
                                </div>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-1">Temperatura</span>
                                <div className="flex items-center gap-2">
                                  <Thermometer className="h-3.5 w-3.5 text-red-500" />
                                  <span className="text-xs font-bold text-slate-700">{visit.vitals.temperature} °C</span>
                                </div>
                              </div>
                              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-1">Presión</span>
                                <div className="flex items-center gap-2">
                                  <Activity className="h-3.5 w-3.5 text-purple-500" />
                                  <span className="text-xs font-bold text-slate-700">{visit.vitals.bloodPressure}</span>
                                </div>
                              </div>
                            </div>

                            {/* Part B: Medical Notes (Restricted) */}
                            {visit.evolution && (profile?.role === 'doctor' || profile?.role === 'admin' || profile?.role === 'nutritionist') && (
                              <div className="pt-4 border-t border-slate-100 space-y-4">
                                <div>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2">Antecedentes Anotados</span>
                                  <p className="text-xs text-slate-600 font-medium italic leading-relaxed bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50">
                                    {visit.evolution.antecedents || 'Sin antecedentes registrados.'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2">Evolución Médica</span>
                                  <p className="text-xs text-slate-700 font-bold leading-relaxed">
                                    {visit.evolution.notes}
                                  </p>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center">
                                      <User className="h-3 w-3 text-slate-400" />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400">Dr. {visit.evolution.doctorName}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {!visit.evolution && visit.status === 'espera' && profile?.role === 'doctor' && (
                              <div className="pt-4 flex justify-end">
                                <button 
                                  onClick={() => {/* Navigate to consultation */}}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                                >
                                  Continuar Atención
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {patientHistory.length === 0 && (
                    <div className="bg-slate-50 border border-slate-100 border-dashed rounded-3xl p-12 text-center">
                      <p className="text-xs font-bold text-slate-400 italic">No hay registros previos para este paciente.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[70vh] flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 border border-slate-100 border-dashed rounded-[3rem]">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center text-slate-200 mb-6">
                <Search className="h-10 w-10" />
              </div>
              <h4 className="text-xl font-bold text-slate-400">Selecciona un paciente</h4>
              <p className="text-sm text-slate-300 font-medium max-w-xs mt-2">Busca en la lista de la izquierda para ver su historial médico completo.</p>
            </div>
          )}
        </div>
      </div>

      {/* Register Patient Modal */}
      {isRegistering && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleRegisterPatient} className="p-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Nuevo Paciente</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Carga inicial de filiación</p>
                </div>
                <button type="button" onClick={() => setIsRegistering(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6 mb-10">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Número de DNI</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 35.444.222"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                    value={newPatient.dni}
                    onChange={e => setNewPatient({...newPatient, dni: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Nombre Completo</label>
                  <input 
                    type="text" 
                    placeholder="Apellido, Nombres"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                    value={newPatient.name}
                    onChange={e => setNewPatient({...newPatient, name: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Edad</label>
                    <input 
                      type="text" 
                      placeholder="Ej: 45"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                      value={newPatient.age}
                      onChange={e => setNewPatient({...newPatient, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Localidad</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Posadas"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                      value={newPatient.location}
                      onChange={e => setNewPatient({...newPatient, location: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Nro. de Celular</label>
                    <input 
                      type="text" 
                      placeholder="Ej: 3764123456"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                      value={newPatient.phone}
                      onChange={e => setNewPatient({...newPatient, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Categoría</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                        value={newPatient.category}
                        onChange={e => setNewPatient({...newPatient, category: e.target.value as 'Adulto' | 'Niño'})}
                      >
                        <option value="Adulto">Adulto</option>
                        <option value="Niño">Niño</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ArrowRight className="h-3 w-3 rotate-90" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Registrar Paciente
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Start Visit / Vitals Modal */}
      {isStartingVisit && selectedPatient && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleStartVisit} className="p-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    {selectedVisitForVitals ? 'Procesar Turno' : 'Nueva Visita'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Biometría y signos vitales</p>
                </div>
                <button type="button" onClick={() => setIsStartingVisit(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="bg-blue-50/50 p-6 rounded-3xl mb-8 flex items-center gap-4 border border-blue-100">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{selectedPatient.name}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI: {selectedPatient.dni}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 flex items-center gap-2">
                       <Weight className="h-3 w-3" /> Peso (kg)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: 75"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={vitals.weight}
                      onChange={e => setVitals({...vitals, weight: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 flex items-center gap-2">
                      <Ruler className="h-3 w-3" /> Talla (cm)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: 175"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={vitals.height}
                      onChange={e => setVitals({...vitals, height: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 flex items-center gap-2">
                      <Thermometer className="h-3 w-3" /> Temperatura
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: 36.5"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={vitals.temperature}
                      onChange={e => setVitals({...vitals, temperature: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 flex items-center gap-2">
                      <Activity className="h-3 w-3" /> Presión Art.
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: 120/80"
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={vitals.bloodPressure}
                      onChange={e => setVitals({...vitals, bloodPressure: e.target.value})}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsStartingVisit(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
                  {selectedVisitForVitals ? 'Confirmar Biometría' : 'Finalizar Admisión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
