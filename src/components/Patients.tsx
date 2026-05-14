import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, getDoc, addDoc, orderBy, where, limit, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Patient, PatientVisit, Vitals, UserProfile } from '../types';
import { useAuth } from './AuthProvider';
import { Search, UserPlus, FileText, ClipboardList, Thermometer, Weight, Ruler, Activity, Check, X, Loader2, User, Calendar, History, ArrowRight, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Patients() {
  const { profile, activeRole } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Todos' | 'Adulto' | 'Niño'>('Todos');
  const [isRegistering, setIsRegistering] = useState(false);
  const [newPatient, setNewPatient] = useState({ 
    dni: '', 
    name: '', 
    age: '', 
    location: '', 
    phone: '', 
    category: 'Adulto' as 'Adulto' | 'Niño',
    guardianName: '',
    guardianRelation: 'Madre' as 'Madre' | 'Padre' | 'Familiar',
    serviceType: 'clínico' as 'pediatría' | 'clínico' | 'ecografía' | 'psiquiatría' | 'odontología' | 'nutrición'
  });
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<PatientVisit[]>([]);
  const [dailyQueue, setDailyQueue] = useState<PatientVisit[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const [selectedVisitForVitals, setSelectedVisitForVitals] = useState<PatientVisit | null>(null);
  const [selectedServiceForVitals, setSelectedServiceForVitals] = useState<PatientVisit['serviceType']>('clínico');
  const [selectedServiceForExistingPatient, setSelectedServiceForExistingPatient] = useState<PatientVisit['serviceType']>('clínico');
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

  const [allActiveVisits, setAllActiveVisits] = useState<PatientVisit[]>([]);

  const getServiceLabel = (type?: string) => {
    switch (type) {
      case 'nutrición': return 'Nutrición';
      case 'odontología': return 'Odontología';
      case 'psiquiatría': return 'Psiquiatría';
      case 'ecografía': return 'Ecografía';
      case 'pediatría': return 'Pediatría';
      case 'clínico': return 'Clínico';
      default: return type || 'Consulta';
    }
  };

  useEffect(() => {
    // Inicio del día actual (00:00) para reiniciar turnos diariamente
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeLimit = today.toISOString();

    const qQueue = query(
      collection(db, 'visits'),
      where('status', '==', 'checkin')
    );

    const unsubQueue = onSnapshot(qQueue, (snap) => {
      const activeCheckins = snap.docs.map(d => d.data() as PatientVisit)
        .filter(v => v.date >= timeLimit)
        .sort((a, b) => a.date.localeCompare(b.date));
      setDailyQueue(activeCheckins);
      setLoadingQueue(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visits_queue'));

    // Monitor ALL active visits (not just checkin) to prevent double admission
    const qActive = query(
      collection(db, 'visits')
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
      const allActive = snap.docs.map(d => d.data() as PatientVisit)
        .filter(v => ['checkin', 'espera', 'atendiendo', 'atendiendo_nutri', 'atendiendo_especialista'].includes(v.status) && v.date >= timeLimit);
      setAllActiveVisits(allActive);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'active_visits'));

    const qPatients = query(collection(db, 'patients'), orderBy('name'), limit(100));
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setPatients(snap.docs.map(d => d.data() as Patient));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'patients'));

    return () => {
      unsubQueue();
      unsubActive();
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
      setSelectedServiceForExistingPatient(selectedPatient.category === 'Niño' ? 'pediatría' : 'clínico');
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
      console.log('Starting registration for DNI:', newPatient.dni);
      const patientId = newPatient.dni.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const docRef = doc(db, 'patients', patientId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const existingData = docSnap.data() as Patient;
      const confirmCheckIn = window.confirm(`El paciente "${existingData.name}" ya está registrado con este DNI. ¿Desea iniciar una visita para ${newPatient.serviceType} ahora?`);
      if (confirmCheckIn) {
        setIsRegistering(false);
        setNewPatient({ dni: '', name: '', age: '', location: '', phone: '', category: 'Adulto', serviceType: 'clínico', guardianName: '', guardianRelation: 'Madre' });
        await handleCheckIn(existingData, newPatient.serviceType);
      }
        setIsSubmitting(false);
        return;
      }

      const patientData: Patient = {
        id: patientId,
        dni: newPatient.dni,
        name: newPatient.name,
        age: newPatient.age,
        location: newPatient.location,
        phone: newPatient.phone,
        category: newPatient.category,
        guardianName: newPatient.category === 'Niño' ? newPatient.guardianName : '',
        guardianRelation: newPatient.category === 'Niño' ? newPatient.guardianRelation : 'Familiar',
        createdAt: new Date().toISOString()
      };
      
      const batch = writeBatch(db);
      batch.set(doc(db, 'patients', patientId), patientData);
      
      const visitId = doc(collection(db, 'visits')).id;
      
      // Specialist Direct Routing or Clinical Flow
      const status = newPatient.category === 'Niño' ? 'checkin' : 'espera';

      const visitData: PatientVisit = {
        id: visitId,
        patientId: patientId,
        patientName: newPatient.name,
        patientDni: newPatient.dni,
        age: newPatient.age || '',
        location: newPatient.location || '',
        category: newPatient.category,
        date: new Date().toISOString(),
        status,
        serviceType: newPatient.serviceType,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
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
      batch.set(doc(db, `patients/${patientId}/visits`, visitId), visitData);

      await batch.commit();
      
      alert(`Paciente registrado y derivado a ${newPatient.serviceType} exitosamente.`);
      setIsRegistering(false);
      setNewPatient({ 
        dni: '', 
        name: '', 
        age: '', 
        location: '', 
        phone: '', 
        category: 'Adulto',
        guardianName: '',
        guardianRelation: 'Madre',
        serviceType: 'clínico'
      });
      setSelectedPatient(patientData);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `registration/patients/${newPatient.dni}/visits (and root)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckIn = async (patient: Patient, serviceType?: PatientVisit['serviceType']) => {
    if (!profile) return;
    
    // If serviceType not provided (e.g. from a direct path button), we might need to ask or use default
    const finalService = serviceType || (patient.category === 'Niño' ? 'pediatría' : 'clínico');

    setIsSubmitting(true);
    try {
      const today = new Date();
      today.setHours(today.getHours() - 12);
      const q = query(
        collection(db, 'visits'),
        where('patientId', '==', patient.id)
      );
      const snap = await getDocs(q);
      const activeVisits = snap.docs.map(d => d.data() as PatientVisit).filter(v => 
        ['checkin', 'espera', 'atendiendo', 'atendiendo_nutri', 'atendiendo_especialista'].includes(v.status) &&
        v.date >= today.toISOString()
      );
      if (activeVisits.length > 0) {
        alert('Este paciente ya tiene una consulta en curso hoy.');
        return;
      }

      const visitId = doc(collection(db, 'visits')).id;
      
      // Specialist Direct Routing or Clinical Flow
      const status = patient.category === 'Niño' ? 'checkin' : 'espera';

      const visitData: PatientVisit = {
        id: visitId,
        patientId: patient.id,
        patientName: patient.name,
        patientDni: patient.dni,
        age: patient.age || '',
        location: patient.location || '',
        category: patient.category,
        date: new Date().toISOString(),
        status,
        serviceType: finalService,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
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

      alert(`Turno asignado correctamente para ${patient.name} en ${finalService}.`);
    } catch (err) {
      alert(`Error al registrar el turno: ${err instanceof Error ? err.message : String(err)}`);
      handleFirestoreError(err, OperationType.CREATE, `checkin/patients/${patient.id}/visits (and root)`);
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
      const isSpecialist = ['ecografía', 'psiquiatría', 'odontología', 'nutrición'].includes(selectedServiceForVitals || '');
      
      const visitData: PatientVisit = {
        id: visitId,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        patientDni: selectedPatient.dni,
        age: selectedPatient.age || '',
        location: selectedPatient.location || '',
        category: selectedPatient.category,
        date: new Date().toISOString(), // Actualizar fecha para ir al final de la cola de consulta
        status: 'espera', // Pasa a espera
        serviceType: selectedServiceForVitals,
        updatedAt: new Date().toISOString(),
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
      handleFirestoreError(err, OperationType.UPDATE, `vitals/patients/${selectedPatient.id}/visits/${visitId} (and root)`);
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

  const filteredPatients = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.dni.includes(searchTerm);
    const matchesCategory = categoryFilter === 'Todos' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const canEditVitals = activeRole === 'nurse' || activeRole === 'admin';
  const isDoctor = activeRole === 'doctor';
  const isAdmission = activeRole === 'admission' || activeRole === 'admin';
  const isNurse = activeRole === 'nurse';
  const isAdmin = activeRole === 'admin';
  const isNutritionist = activeRole === 'nutritionist';

  // Admission View: Show registry always for better navigation
  // Nurse View: Only show Queue, no history/list
  const isNurseOnly = isNurse && !isAdmin && !isDoctor;
  const filteredQueue = dailyQueue.filter(v => v.category === 'Niño' && patients.some(p => p.id === v.patientId)); // Nurse only sees pediatric for Biometría, and only if patient exists
  const showQueue = canEditVitals && filteredQueue.length > 0;
  const showList = !isNurseOnly;

  const showHistory = isDoctor || isAdmin || isNutritionist;

  const activeVisit = allActiveVisits.find(v => v.patientId === selectedPatient?.id);
  const isInQueue = !!activeVisit;

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'checkin': return 'En Biometría';
      case 'espera': return 'En Sala de Espera';
      case 'atendiendo': return 'En Consulta Médica';
      case 'atendiendo_nutri': return 'En Nutrición';
      default: return 'En Cola';
    }
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Top Search & Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 flex flex-col sm:flex-row gap-3 w-full">
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder={isNurse ? "Buscar paciente para historia..." : "Buscar por nombre o DNI..."}
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[2rem] text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm group-hover:border-blue-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {!isNurseOnly && (
            <div className="flex bg-white border border-slate-200 p-1 rounded-full shadow-sm shrink-0">
              {(['Todos', 'Adulto', 'Niño'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                    categoryFilter === cat
                      ? "bg-slate-900 text-white shadow-lg"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {cat === 'Niño' ? 'Niños' : cat}
                </button>
              ))}
            </div>
          )}
        </div>
        {isAdmission && (
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setIsRegistering(true)}
              className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 group relative"
              title="Registrar Nuevo Paciente"
            >
              <UserPlus className="h-6 w-6" />
              <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-black px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase tracking-widest">
                Nuevo Registro
              </span>
            </button>
            <div className="hidden md:block h-8 w-px bg-slate-200 mx-2" />
          </div>
        )}
      </div>

      {/* Nurse Queue: Priority for Nurse role */}
      {showQueue && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between ml-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5" />
              Sala de Espera: Biometría Pediátrica
            </h3>
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-blue-100">
                {filteredQueue.length} {filteredQueue.length === 1 ? 'Niño' : 'Niños'} en espera
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredQueue.map((visit, index) => (
              <button 
                key={visit.id}
                onClick={() => {
                  const p = patients.find(pat => pat.id === visit.patientId);
                  if (p) {
                    setSelectedPatient(p);
                    setSelectedVisitForVitals(visit);
                    setSelectedServiceForVitals(visit.serviceType || (p.category === 'Niño' ? 'pediatría' : 'clínico'));
                    setIsStartingVisit(true);
                  }
                }}
                className="group relative bg-white border border-slate-200 p-6 rounded-[2rem] text-left hover:border-blue-600 hover:shadow-xl transition-all space-y-4 overflow-hidden shadow-sm"
              >
                <div className="absolute top-0 right-0 flex items-center">
                  <div className={cn(
                    "px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-xl",
                    visit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
                  )}>
                    {visit.category}
                  </div>
                  <div className="bg-blue-600 text-white px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-bl-xl">
                    Turno #{index + 1}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 line-clamp-1">{visit.patientName}</h4>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">DNI {visit.patientDni}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end pt-2 border-t border-slate-50">
                   <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-all">
                     <ArrowRight className="h-4 w-4" />
                   </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Registry View */}
      {showList ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Patient List */}
          <div className="xl:col-span-1 space-y-4">
            <div className="flex items-center justify-between ml-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {isNurse ? 'Historial de Pacientes' : 'Padron de Pacientes'}
              </h3>
            </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredPatients.length === 0 && searchTerm && (
              <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in zoom-in-95 duration-500 bg-white border border-slate-100 rounded-[2rem]">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-4">
                  <Search className="h-8 w-8" />
                </div>
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin coincidencias</h4>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter mt-1 max-w-[200px]">
                  No hay pacientes con DNI o nombre "{searchTerm}".
                </p>
              </div>
            )}
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
                      {selectedPatient.category === 'Niño' && selectedPatient.guardianName && (
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-blue-200 rounded-full shrink-0" />
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">Responsable: {selectedPatient.guardianName} ({selectedPatient.guardianRelation})</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-slate-200 rounded-full shrink-0" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Registrado: {format(new Date(selectedPatient.createdAt), 'dd/MM/yyyy', { locale: es })}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row min-[70.625rem]:flex-col min-[93.75rem]:flex-row sm:items-center min-[70.625rem]:items-stretch min-[93.75rem]:items-center gap-4">
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeletePatient(selectedPatient.id)}
                      className="w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto px-6 py-4 bg-white border border-red-200 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  )}
                  {isDoctor && (
                    <button 
                      onClick={() => setIsEditingHistory(true)}
                      className="w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm flex justify-center"
                    >
                      Actualizar H. Clínica
                    </button>
                  )}
                  {canEditVitals && (
                    <button 
                      onClick={() => {
                        if (isInQueue) {
                          alert(`Este paciente ya se encuentra en proceso: ${getStatusLabel(activeVisit?.status || '')}`);
                          return;
                        }
                        setSelectedVisitForVitals(null);
                        setSelectedServiceForVitals(selectedPatient.category === 'Niño' ? 'pediatría' : 'clínico');
                        setIsStartingVisit(true);
                        setVitals({
                          date: new Date().toISOString(),
                          weight: '',
                          height: '',
                          temperature: '',
                          bloodPressure: '',
                          recordedBy: profile?.uid || ''
                        });
                      }}
                      disabled={isInQueue}
                      className={cn(
                        "w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl flex justify-center",
                        isInQueue 
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                          : "bg-slate-900 text-white hover:bg-blue-600 shadow-slate-200"
                      )}
                    >
                      {isInQueue ? getStatusLabel(activeVisit?.status || '') : 'Nueva Visita (Biometría)'}
                    </button>
                  )}
                  {isAdmission && !canEditVitals && (
                    <div className="flex flex-col sm:flex-row min-[70.625rem]:flex-col min-[93.75rem]:flex-row gap-2 w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto">
                      {!isInQueue && (
                        <select 
                          className="w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto px-4 py-3 bg-blue-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 transition-all appearance-none cursor-pointer"
                          value={selectedServiceForExistingPatient}
                          onChange={e => setSelectedServiceForExistingPatient(e.target.value as any)}
                        >
                          <option value="pediatría" disabled={selectedPatient.category === 'Adulto'}>Pediatría</option>
                          <option value="clínico" disabled={selectedPatient.category === 'Niño'}>Clínico (Adultos)</option>
                          <option value="ecografía">Ecografía</option>
                          <option value="psiquiatría">Psiquiatría</option>
                          <option value="odontología">Odontología</option>
                          <option value="nutrición">Nutrición</option>
                        </select>
                      )}
                      <button 
                        onClick={() => handleCheckIn(selectedPatient, selectedServiceForExistingPatient)}
                        disabled={isInQueue}
                        className={cn(
                          "w-full sm:w-auto min-[70.625rem]:w-full min-[93.75rem]:w-auto px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl whitespace-nowrap",
                          isInQueue 
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                        )}
                      >
                        {isInQueue ? getStatusLabel(activeVisit?.status || '') : (selectedPatient.category === 'Adulto' ? 'Enviar a Sala de Espera' : 'Derivar a Biometría')}
                      </button>
                    </div>
                  )}
                  {/* Manual check-in button removed per user request for automation */}
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
              {showHistory && (
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
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-black text-slate-800">
                                    {format(new Date(visit.date), 'EEEE dd/MM/yyyy', { locale: es })}
                                  </span>
                                  <span className={cn(
                                    "px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border",
                                    visit.serviceType === 'odontología' ? "bg-purple-50 text-purple-600 border-purple-100" :
                                    visit.serviceType === 'nutrición' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                    "bg-blue-50 text-blue-600 border-blue-100"
                                  )}>
                                    {getServiceLabel(visit.serviceType)}
                                  </span>                                </div>
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
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2">Evolución Médica ({getServiceLabel(visit.serviceType)})</span>
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
              )}
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
      ) : (
        isNurse && dailyQueue.length === 0 && !searchTerm && (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-200 border-dashed rounded-[3rem] shadow-sm animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-blue-50 rounded-[2.5rem] flex items-center justify-center text-blue-200 mb-6">
              <ClipboardList className="h-10 w-10" />
            </div>
            <h4 className="text-xl font-black text-slate-400 uppercase tracking-tight">Sala de Espera Vacía</h4>
            <p className="text-sm text-slate-300 font-bold uppercase tracking-widest mt-2 max-w-xs mx-auto leading-relaxed">
              Los pacientes aparecerán aquí automáticamente una vez que Admisión complete el registro inicial.
            </p>
          </div>
        )
      )}

      {/* Register Patient Modal */}
      {isRegistering && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200">
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
                        onChange={e => {
                          const cat = e.target.value as 'Adulto' | 'Niño';
                          setNewPatient({
                            ...newPatient, 
                            category: cat,
                            serviceType: cat === 'Niño' ? 'pediatría' : 'clínico'
                          });
                        }}
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

                {!isNurse && (
                  <div>
                     <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 block ml-1">Servicio / Especialidad</label>
                     <div className="relative">
                       <select 
                         className="w-full px-4 py-3 bg-blue-50/50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 transition-all appearance-none cursor-pointer"
                         value={newPatient.serviceType}
                         onChange={e => setNewPatient({...newPatient, serviceType: e.target.value as any})}
                       >
                         <option value="pediatría" disabled={newPatient.category === 'Adulto'}>Pediatría</option>
                         <option value="clínico" disabled={newPatient.category === 'Niño'}>Clínico (Adultos)</option>
                         <option value="ecografía">Ecografía</option>
                         <option value="psiquiatría">Psiquiatría</option>
                         <option value="odontología">Odontología</option>
                         <option value="nutrición">Nutrición</option>
                       </select>
                       <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                         <ArrowRight className="h-3 w-3 rotate-90" />
                       </div>
                     </div>
                  </div>
                )}

                {/* Guardian info for Children */}
                {newPatient.category === 'Niño' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="sm:col-span-2 bg-blue-50/50 p-4 rounded-3xl mb-2">
                       <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest text-center">Información del Adulto Responsable</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Nombre del Responsable</label>
                      <input 
                        type="text" 
                        placeholder="Ej: Pérez, María"
                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all"
                        value={newPatient.guardianName}
                        onChange={e => setNewPatient({...newPatient, guardianName: e.target.value})}
                        required={newPatient.category === 'Niño'}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Parentesco</label>
                      <div className="relative">
                        <select 
                          className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer"
                          value={newPatient.guardianRelation}
                          onChange={e => setNewPatient({...newPatient, guardianRelation: e.target.value as any})}
                          required={newPatient.category === 'Niño'}
                        >
                          <option value="Madre">Madre</option>
                          <option value="Padre">Padre</option>
                          <option value="Familiar">Familiar</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                          <ArrowRight className="h-3 w-3 rotate-90" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200">
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
                  <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mt-1">
                    Servicio: {getServiceLabel(selectedServiceForVitals)}
                  </p>
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
