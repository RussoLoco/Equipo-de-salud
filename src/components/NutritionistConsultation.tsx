import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, where, getDoc, writeBatch, limit, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PatientVisit, MedicalEvolution } from '../types';
import { useAuth } from './AuthProvider';
import { User, Activity, Weight, Ruler, Thermometer, Clock, ArrowRight, ClipboardList, BookOpen, ScrollText, Check, Loader2, History, X, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PatientFiles from './PatientFiles';

export default function NutritionistConsultation() {
  const { profile } = useAuth();
  const [pendingVisits, setPendingVisits] = useState<PatientVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<PatientVisit | null>(null);
  const [peekingPatient, setPeekingPatient] = useState<{ id: string, name: string, dni: string } | null>(null);
  const [peekingHistory, setPeekingHistory] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nutrition State
  const [nutritionNotes, setNutritionNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  
  // Permanent History State
  const [permanentHistory, setPermanentHistory] = useState('');
  const [isEditingPermanent, setIsEditingPermanent] = useState(false);
  
  // Evolutionary History State
  const [patientHistory, setPatientHistory] = useState<PatientVisit[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Waitlist UI State
  const [isPediatricCollapsed, setIsPediatricCollapsed] = useState(false);
  const [isAdultCollapsed, setIsAdultCollapsed] = useState(false);
  const [isBiometryCollapsed, setIsBiometryCollapsed] = useState(true);

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeLimit = today.toISOString();

    const q = query(
      collection(db, 'visits'), 
      where('status', 'in', ['espera', 'atendiendo_nutri'])
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data() as PatientVisit)
        .filter(v => v.date >= timeLimit && v.serviceType === 'nutrición');
      const sorted = docs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setPendingVisits(sorted);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visits'));
    return () => unsub();
  }, []);

  const claimVisit = async (visit: PatientVisit) => {
    if (!profile) return;

    if (visit.status === 'atendiendo_nutri' && visit.attendingDoctorId === profile.uid) {
      setSelectedVisit(visit);
      return;
    }

    if (visit.status === 'atendiendo_nutri' && visit.attendingDoctorId !== profile.uid) {
      console.warn(`Esta consulta ya está siendo atendida por ${visit.attendingDoctorName || 'otro profesional'}.`);
      return;
    }
    
    // Also block if it's being attended by a doctor (status 'atendiendo')
    if (visit.status === 'atendiendo') {
      console.warn(`Esta consulta ya está siendo atendida por el Médico.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const visitUpdate = {
        status: 'atendiendo_nutri',
        attendingDoctorId: profile.uid,
        attendingDoctorName: profile.name,
        updatedAt: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'visits', visit.id), visitUpdate);
      batch.update(doc(db, `patients/${visit.patientId}/visits`, visit.id), visitUpdate);

      await batch.commit();
      setSelectedVisit({ ...visit, ...visitUpdate } as PatientVisit);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `claim/patients/${visit.patientId}/visits/${visit.id} (and root)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const releaseVisit = async () => {
    if (!selectedVisit || !profile) {
      setSelectedVisit(null);
      return;
    }

    if (selectedVisit.attendingDoctorId !== profile.uid) {
      setSelectedVisit(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const visitUpdate = {
        status: 'espera',
        attendingDoctorId: null,
        attendingDoctorName: null,
        updatedAt: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'visits', selectedVisit.id), visitUpdate);
      batch.update(doc(db, `patients/${selectedVisit.patientId}/visits`, selectedVisit.id), visitUpdate);

      await batch.commit();
      setSelectedVisit(null);
      setRecommendations('');
      setNutritionNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `release/patients/${selectedVisit.patientId}/visits/${selectedVisit.id} (and root)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (selectedVisit) {
      getDoc(doc(db, 'patients', selectedVisit.patientId)).then(snap => {
        if (snap.exists()) {
          setPermanentHistory(snap.data().clinicalHistory || '');
        }
      });

      const q = query(
        collection(db, `patients/${selectedVisit.patientId}/visits`),
        orderBy('date', 'desc'),
        limit(50)
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        setPatientHistory(snap.docs.map(d => d.data() as PatientVisit).filter(v => v.id !== selectedVisit.id));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `patients/${selectedVisit.patientId}/visits`));

      return () => unsubscribe();
    } else {
      setPatientHistory([]);
      setShowFullHistory(false);
    }
  }, [selectedVisit]);
  
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (peekingPatient) {
      const q = query(
        collection(db, `patients/${peekingPatient.id}/visits`),
        orderBy('date', 'desc'),
        limit(20)
      );
      unsubscribe = onSnapshot(q, (snap) => {
        setPeekingHistory(snap.docs.map(d => d.data() as PatientVisit).filter(v => v.status === 'atendido'));
      }, (err) => handleFirestoreError(err, OperationType.LIST, `peeking/${peekingPatient.id}/visits`));
    } else {
      setPeekingHistory([]);
    }
    return () => unsubscribe?.();
  }, [peekingPatient]);

  const handleUpdatePermanentHistory = async () => {
    if (!selectedVisit) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'patients', selectedVisit.patientId), {
        clinicalHistory: permanentHistory
      });
      setIsEditingPermanent(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'patients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteConsultation = async () => {
    if (!selectedVisit || !profile) return;
    if (!nutritionNotes) {
      console.warn('Debes ingresar la nota de evolución nutricional.');
      return;
    }

    setIsSubmitting(true);
    try {
      const evolution: MedicalEvolution & { serviceType?: string } = {
        date: new Date().toISOString(),
        antecedents: recommendations, // Usamos antecedents para recomendaciones nutricionales
        notes: nutritionNotes,
        doctorName: profile.name,
        doctorId: profile.uid,
        doctorPhoto: profile.photoURL,
        serviceType: 'nutrición'
      };

      const visitUpdate = {
        status: 'atendido', // Marcar como atendido finaliza el ciclo
        evolution,
        updatedAt: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'visits', selectedVisit.id), visitUpdate);
      batch.update(doc(db, `patients/${selectedVisit.patientId}/visits`, selectedVisit.id), visitUpdate);

      await batch.commit();
      
      setSelectedVisit(null);
      setRecommendations('');
      setNutritionNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `complete/patients/${selectedVisit.patientId}/visits/${selectedVisit.id} (and root)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const adultVisits = pendingVisits.filter(v => v.category === 'Adulto');
  const childVisits = pendingVisits.filter(v => v.category === 'Niño');

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20">
      <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mb-4" />
      <p className="text-sm font-bold text-slate-400">Cargando sala de espera nutricional...</p>
    </div>
  );

  const renderVisitCard = (visit: PatientVisit, queueIndex: number) => {
    const isAttendedByOther = (visit.status === 'atendiendo_nutri' || visit.status === 'atendiendo') && visit.attendingDoctorId !== profile?.uid;
    const isAttendedByMe = visit.status === 'atendiendo_nutri' && visit.attendingDoctorId === profile?.uid;
    const turnNumber = queueIndex + 1;

    return (
      <div 
        key={visit.id}
        onClick={() => !isAttendedByOther && !isSubmitting && claimVisit(visit)}
        className={cn(
          "group relative bg-white border p-8 rounded-[2.5rem] text-left transition-all space-y-6 overflow-hidden",
          isAttendedByOther ? "opacity-60 border-amber-200 bg-amber-50/20 cursor-not-allowed" : "border-slate-200 hover:border-emerald-300 hover:shadow-2xl hover:shadow-emerald-100 cursor-pointer",
          isAttendedByMe && "border-emerald-200 bg-emerald-50/10 shadow-lg shadow-emerald-50"
        )}
      >
        <div className="absolute top-0 right-0 flex items-center">
            <div className={cn(
              "px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-2xl",
              visit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
            )}>
              {visit.category}
            </div>
            <div className={cn(
              "px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-2xl",
              isAttendedByOther ? "bg-amber-500 text-white" : "bg-slate-900 text-white"
            )}>
              {isAttendedByOther ? 'En Atención' : `Turno #${turnNumber}`}
            </div>
        </div>

        <div className="flex justify-between items-start">
          <div className={cn(
            "w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-transform",
            isAttendedByOther ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600 group-hover:scale-110"
          )}>
            <User className="h-6 w-6" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-slate-300 text-[10px] font-bold">
              <Clock className="h-3.5 w-3.5" />
              {format(new Date(visit.date), 'HH:mm')}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setPeekingPatient({ id: visit.patientId, name: visit.patientName, dni: visit.patientDni });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest border border-slate-100"
            >
              <History className="h-3 w-3" />
              Ver Historial
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-900 line-clamp-1">{visit.patientName}</h3>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI {visit.patientDni}</p>
          {isAttendedByOther && (
            <p className="text-[10px] font-bold text-amber-600 mt-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Atendido por {visit.attendingDoctorName || 'Colega'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-slate-500">
            <Weight className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-bold">{visit.vitals.weight || '-'}kg</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Ruler className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-bold">{visit.vitals.height || '-'}cm</span>
          </div>
        </div>

        <div className="flex items-center justify-between transition-transform pt-2">
          <span className={cn(
            "text-[10px] font-black uppercase tracking-widest",
            isAttendedByOther ? "text-amber-500" : "text-emerald-600"
          )}>
            {isAttendedByOther ? 'Ocupado' : isAttendedByMe ? 'Continuar Evaluación' : 'Llamar a Sala'}
          </span>
          {!isAttendedByOther && <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-32">
      {!selectedVisit ? (
        <div className="space-y-12">
          <div className="flex flex-col gap-10">
            {/* Child Queue */}
            <div className="space-y-6">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsPediatricCollapsed(!isPediatricCollapsed)}
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 group-hover:text-emerald-600 transition-colors">
                    <div className="p-2 bg-emerald-100 rounded-xl"><Activity className="h-5 w-5 text-emerald-600" /></div>
                    Control Nutricional: Pediátrico
                    <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-emerald-500 transition-transform", isPediatricCollapsed && "rotate-180")} />
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Niños esperando evaluación nutricional</p>
                </div>
                <div className="px-4 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 group-hover:bg-emerald-700 transition-colors">
                  {childVisits.length} Niños
                </div>
              </div>

              {!isPediatricCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
                  {childVisits.map((visit, idx) => renderVisitCard(visit, idx))}
                  {childVisits.length === 0 && (
                    <div className="col-span-full py-16 text-center bg-emerald-50/30 border-2 border-dashed border-emerald-100 rounded-[3rem]">
                      <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest">No hay niños en espera</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Adult Queue */}
            <div className="space-y-6">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsAdultCollapsed(!isAdultCollapsed)}
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 group-hover:text-slate-700 transition-colors">
                     <div className="p-2 bg-slate-100 rounded-xl"><User className="h-5 w-5 text-slate-600" /></div>
                     Control Nutricional: Adultos
                     <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-transform", isAdultCollapsed && "rotate-180")} />
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Adultos esperando evaluación nutricional</p>
                </div>
                <div className="px-4 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 group-hover:bg-slate-800 transition-colors">
                  {adultVisits.length} Adultos
                </div>
              </div>

              {!isAdultCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
                  {adultVisits.map((visit, idx) => renderVisitCard(visit, idx))}
                  {adultVisits.length === 0 && (
                    <div className="col-span-full py-16 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
                      <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No hay adultos en espera</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-400">
          <div className="flex flex-col xl:flex-row gap-8">
            <div className="flex-1 space-y-8 min-w-0">
              {/* Header Card */}
              <div className="bg-emerald-900 text-white p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-white/10 rounded-[2rem] flex items-center justify-center text-white backdrop-blur-lg">
                    <User className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tight">{selectedVisit.patientName}</h2>
                    <div className="flex flex-wrap items-center gap-4 mt-2">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">DNI: {selectedVisit.patientDni}</span>
                      <span className="w-1 h-1 bg-white/20 rounded-full" />
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest",
                        selectedVisit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
                      )}>
                        {selectedVisit.category}
                      </span>
                      <span className="w-1 h-1 bg-white/20 rounded-full" />
                      <span className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Evaluación Nutricional</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={releaseVisit}
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md disabled:opacity-50"
                >
                  Cancelar Atención
                </button>
              </div>

              {/* Vitals Summary */}
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 shadow-sm">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => setIsBiometryCollapsed(!isBiometryCollapsed)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                      <Activity className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest group-hover:text-emerald-600 transition-colors">
                        Datos Biométricos
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        Signos vitales de la admisión
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-slate-50 group-hover:bg-emerald-50 rounded-xl flex items-center justify-center transition-colors">
                    <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-emerald-500 transition-transform", isBiometryCollapsed && "rotate-180")} />
                  </div>
                </div>

                {!isBiometryCollapsed && (
                  <div className="mt-6 flex flex-col gap-3 animate-in slide-in-from-top-4 fade-in duration-300 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                          <Weight className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Corporal</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.weight} <span className="text-[10px] text-slate-400">kg</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                          <Ruler className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Talla / Estatura</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.height} <span className="text-[10px] text-slate-400">cm</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IMC (Estimado)</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">
                        {selectedVisit.vitals.weight && selectedVisit.vitals.height 
                          ? (parseFloat(selectedVisit.vitals.weight) / Math.pow(parseFloat(selectedVisit.vitals.height)/100, 2)).toFixed(1)
                          : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presión Arterial</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.bloodPressure}</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frec. Cardiaca</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.heartRate} <span className="text-[10px] text-slate-400">bpm</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SpO2</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.o2Saturation} <span className="text-[10px] text-slate-400">%</span></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Permanent Context */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-[2.5rem] p-8 space-y-4">
                <div className="flex justify-between items-center">
                   <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                     <History className="h-3.5 w-3.5" />
                     Antecedentes Clínicos y Nutricionales Permanentes
                   </h3>
                </div>
                <div className="bg-white/60 p-6 rounded-3xl border border-white shadow-sm min-h-[80px]">
                    <p className="text-sm text-slate-600 font-medium whitespace-pre-wrap leading-relaxed italic">
                      {permanentHistory || 'Sin antecedentes registrados.'}
                    </p>
                </div>
              </div>

              {/* Patient Files */}
              {selectedVisit && (
                <div className="bg-white border border-slate-200 rounded-[3rem] p-8 pb-10 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-50" />
                  <PatientFiles patientId={selectedVisit.patientId} />
                </div>
              )}

              {/* Input Section */}
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-slate-100 bg-emerald-50/50 flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-emerald-400 shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">Evaluación Nutricional</h4>
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3 block ml-1">Recomendaciones Nutricionales / Plan</label>
                      <textarea 
                        placeholder="Ingresa pautas alimentarias, recomendaciones específicas o plan de dieta..."
                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl text-sm font-bold text-slate-700 min-h-[120px] focus:ring-2 focus:ring-emerald-100 transition-all italic placeholder:text-slate-300"
                        value={recommendations}
                        onChange={(e) => setRecommendations(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.25em] mb-3 block ml-1 flex items-center justify-between">
                        <span>Nota de Evolución Nutricional</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Requerido</span>
                      </label>
                      <textarea 
                        placeholder="Describe el estado nutricional actual, hallazgos y evolución..."
                        className={cn(
                          "w-full px-6 py-4 border-2 rounded-3xl text-sm font-bold text-slate-800 min-h-[180px] focus:ring-4 focus:ring-emerald-50/50 transition-all placeholder:text-slate-300",
                          !nutritionNotes ? "border-emerald-100/50 bg-slate-50" : "border-emerald-200 bg-white"
                        )}
                        value={nutritionNotes}
                        onChange={(e) => setNutritionNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleCompleteConsultation}
                  disabled={isSubmitting || !nutritionNotes}
                  className={cn(
                    "w-full py-6 rounded-[2.5rem] font-black uppercase tracking-widest text-[12px] transition-all shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3",
                    !nutritionNotes 
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                      : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ScrollText className="h-5 w-5" />
                  )}
                  {isSubmitting ? 'GUARDANDO...' : 'FINALIZAR EVALUACIÓN NUTRICIONAL'}
                </button>
              </div>
            </div>

            {/* Sidebar for History */}
            <div className="w-full xl:w-96 shrink-0">
               <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-6 sticky top-8">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="h-3.5 w-3.5" />
                    Consultas Previas
                  </h4>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {patientHistory.map(visit => (
                      <div key={visit.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-800 uppercase tracking-tighter">
                              {format(new Date(visit.date), 'dd/MM/yyyy')}
                            </span>
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[7px] font-black uppercase tracking-widest rounded border border-emerald-100">
                              {getServiceLabel(visit.serviceType)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {visit.evolution?.doctorPhoto ? (
                              <img 
                                src={visit.evolution.doctorPhoto} 
                                alt={visit.evolution.doctorName || ''}
                                className="w-4 h-4 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-4 h-4 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                                <User className="h-2 w-2 text-slate-400" />
                              </div>
                            )}
                            <span className="text-[8px] font-bold text-slate-400 italic">
                              {visit.evolution?.doctorName ? `Dr. ${visit.evolution.doctorName.split(' ')[0]}` : 'Colega'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold line-clamp-3 leading-relaxed">
                          {visit.evolution?.notes}
                        </p>
                      </div>
                    ))}
                    {patientHistory.length === 0 && (
                      <p className="text-[10px] font-bold text-slate-300 italic text-center py-4">Sin historial previo.</p>
                    )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Peek History Modal (same as medical) */}
      {peekingPatient && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 lg:p-12 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-7xl h-full lg:h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-100">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{peekingPatient.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">DNI {peekingPatient.dni}</p>
                  </div>
                </div>
                <button onClick={() => setPeekingPatient(null)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all shadow-sm border border-slate-100">
                  <X className="h-6 w-6" />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                {peekingHistory.map(visit => (
                  <div key={visit.id} className="mb-6 bg-white border border-slate-100 p-8 rounded-3xl">
                     <div className="flex justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{format(new Date(visit.date), 'dd MMMM yyyy', { locale: es })}</span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-emerald-100">
                            {getServiceLabel(visit.serviceType)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {visit.evolution?.doctorPhoto ? (
                            <img 
                              src={visit.evolution.doctorPhoto} 
                              alt={visit.evolution.doctorName}
                              className="w-6 h-6 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                              <User className="h-3 w-3 text-slate-400" />
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">Evaluado por: {visit.evolution?.doctorName}</span>
                        </div>
                     </div>
                     <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{visit.evolution?.notes}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
