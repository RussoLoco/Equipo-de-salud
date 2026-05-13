import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, where, getDoc, writeBatch, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PatientVisit, MedicalEvolution, Medicine, OrderItem, Order } from '../types';
import { useAuth } from './AuthProvider';
import { User, Activity, Weight, Ruler, Thermometer, Clock, ArrowRight, ClipboardList, BookOpen, ScrollText, Check, Loader2, Search, X, ShoppingCart, Plus, Trash2, Package, History, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Inventory from './Inventory';

export default function MedicalConsultation() {
  const { profile } = useAuth();
  const [pendingVisits, setPendingVisits] = useState<PatientVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<PatientVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consultation State
  const [antecedents, setAntecedents] = useState('');
  const [evolutionNotes, setEvolutionNotes] = useState('');
  
  // Permanent History State
  const [permanentHistory, setPermanentHistory] = useState('');
  const [isEditingPermanent, setIsEditingPermanent] = useState(false);
  
  // Scripting (RECETA) State
  const [showInventory, setShowInventory] = useState(false);
  const [cart, setCart] = useState<OrderItem[]>([]);

  useEffect(() => {
    // Inicio del día actual (00:00) para reiniciar turnos diariamente
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeLimit = today.toISOString();

    const q = query(
      collection(db, 'visits'), 
      where('status', 'in', ['espera', 'atendiendo']),
      where('date', '>=', timeLimit),
      limit(100)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data() as PatientVisit);
      // Ordenamos por fecha de llegada
      const sorted = docs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setPendingVisits(sorted);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'visits'));
    return () => unsub();
  }, []);

  const claimVisit = async (visit: PatientVisit) => {
    if (!profile) return;

    // If already claimed by me in local state, just select
    if (visit.status === 'atendiendo' && visit.attendingDoctorId === profile.uid) {
      setSelectedVisit(visit);
      return;
    }

    // If claimed by another doctor
    if (visit.status === 'atendiendo' && visit.attendingDoctorId !== profile.uid) {
      alert(`Esta consulta ya está siendo atendida por el Dr/a. ${visit.attendingDoctorName || 'otro profesional'}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const visitUpdate = {
        status: 'atendiendo',
        attendingDoctorId: profile.uid,
        attendingDoctorName: profile.name
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'visits', visit.id), visitUpdate);
      batch.update(doc(db, `patients/${visit.patientId}/visits`, visit.id), visitUpdate);

      await batch.commit();
      setSelectedVisit({ ...visit, ...visitUpdate });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'visits');
    } finally {
      setIsSubmitting(false);
    }
  };

  const releaseVisit = async () => {
    if (!selectedVisit || !profile) {
      setSelectedVisit(null);
      return;
    }

    // Only allow releasing if I'm the one attending (or admin)
    if (selectedVisit.attendingDoctorId !== profile.uid) {
      setSelectedVisit(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const visitUpdate = {
        status: 'espera',
        attendingDoctorId: null,
        attendingDoctorName: null
      };

      const batch = writeBatch(db);
      batch.update(doc(db, 'visits', selectedVisit.id), visitUpdate);
      batch.update(doc(db, `patients/${selectedVisit.patientId}/visits`, selectedVisit.id), visitUpdate);

      await batch.commit();
      setSelectedVisit(null);
      setAntecedents('');
      setEvolutionNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'visits');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (selectedVisit) {
      // Fetch permanent clinical history from patients collection
      getDoc(doc(db, 'patients', selectedVisit.patientId)).then(snap => {
        if (snap.exists()) {
          setPermanentHistory(snap.data().clinicalHistory || '');
        }
      });
    }
  }, [selectedVisit]);

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
    if (!evolutionNotes) {
      alert('Debes ingresar la nota de evolución médica.');
      return;
    }

    setIsSubmitting(true);
    try {
      const evolution: MedicalEvolution = {
        date: new Date().toISOString(),
        antecedents,
        notes: evolutionNotes,
        doctorName: profile.name,
        doctorId: profile.uid
      };

      const visitUpdate = {
        status: 'atendido',
        evolution
      };

      const batch = writeBatch(db);

      // Create Order if cart has items
      let orderId: string | null = null;
      if (cart.length > 0) {
        orderId = doc(collection(db, 'orders')).id;
        const orderData: Order = {
          orderId,
          date: new Date().toISOString(),
          doctorId: profile.uid,
          doctorName: profile.name,
          patientId: selectedVisit.patientId,
          patientName: selectedVisit.patientName,
          patientDni: selectedVisit.patientDni,
          items: cart,
          status: 'Pendiente',
          location: 'Consultorio'
        };
        batch.set(doc(db, 'orders', orderId), orderData);
      }

      // Update visit in both locations
      const mainVisitRef = doc(db, 'visits', selectedVisit.id);
      const patientVisitRef = doc(db, `patients/${selectedVisit.patientId}/visits`, selectedVisit.id);
      
      batch.update(mainVisitRef, visitUpdate);
      batch.update(patientVisitRef, visitUpdate);

      if (orderId) {
        // Link order to visit if needed (optional but good practice)
        // visitUpdate.orderIds = [orderId]; // If we want to store it
      }

      await batch.commit();
      
      setSelectedVisit(null);
      setAntecedents('');
      setEvolutionNotes('');
      setCart([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'visits');
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeFromCart = (drugId: string) => {
    setCart(cart.filter(item => item.drugId !== drugId));
  };

  const updateCartQuantity = (drugId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.drugId === drugId) {
        const current = parseInt(String(item.quantity).replace(/[^0-9]/g, '')) || 0;
        const next = Math.max(1, current + delta);
        return { ...item, quantity: String(next) };
      }
      return item;
    }));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20">
      <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
      <p className="text-sm font-bold text-slate-400">Cargando sala de espera...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32">
      {!selectedVisit ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sala de Espera</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pacientes listos para atención médica</p>
            </div>
            <div className="px-4 py-2 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {pendingVisits.length} Pendientes
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pendingVisits.map((visit, index) => {
              const isAttendedByOther = visit.status === 'atendiendo' && visit.attendingDoctorId !== profile?.uid;
              const isAttendedByMe = visit.status === 'atendiendo' && visit.attendingDoctorId === profile?.uid;
              const turnNumber = index + 1;

              return (
                <button 
                  key={visit.id}
                  onClick={() => claimVisit(visit)}
                  disabled={isAttendedByOther || isSubmitting}
                  className={cn(
                    "group relative bg-white border p-8 rounded-[2.5rem] text-left transition-all space-y-6 overflow-hidden",
                    isAttendedByOther ? "opacity-60 border-amber-200 bg-amber-50/20 cursor-not-allowed" : "border-slate-200 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100",
                    isAttendedByMe && "border-emerald-200 bg-emerald-50/20 shadow-lg shadow-emerald-50"
                  )}
                >
                  {isAttendedByOther ? (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white px-4 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-2xl">
                      En Atención
                    </div>
                  ) : (
                    <div className="absolute top-0 right-0 bg-slate-900 text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-2xl">
                      Turno #{turnNumber}
                    </div>
                  )}

                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-transform",
                      isAttendedByOther ? "bg-amber-100 text-amber-600" : "bg-blue-50 text-blue-600 group-hover:scale-110"
                    )}>
                      <User className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2 text-slate-300 text-[10px] font-bold">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(visit.date), 'HH:mm')}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900 line-clamp-1">{visit.patientName}</h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI {visit.patientDni}</p>
                    {isAttendedByOther && (
                      <p className="text-[10px] font-bold text-amber-600 mt-2 flex items-center gap-1.5">
                        <Activity className="h-3 w-3" />
                        Dr/a. {visit.attendingDoctorName}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Weight className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-bold">{visit.vitals.weight}kg</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Activity className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-xs font-bold">{visit.vitals.bloodPressure}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between transition-transform pt-2">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      isAttendedByOther ? "text-amber-500" : "text-blue-600"
                    )}>
                      {isAttendedByOther ? 'Ocupado' : isAttendedByMe ? 'Continuar Atención' : 'Llamar Paciente'}
                    </span>
                    {!isAttendedByOther && <ArrowRight className="h-4 w-4 text-blue-600 group-hover:translate-x-1 transition-transform" />}
                  </div>
                </button>
              );
            })}
            {pendingVisits.length === 0 && (
              <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
                <div className="w-16 h-16 bg-white rounded-3xl mx-auto flex items-center justify-center text-slate-200 mb-4">
                  <Check className="h-8 w-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-400">No hay pacientes en espera</h4>
                <p className="text-xs text-slate-300 font-medium max-w-xs mx-auto mt-2 italic">Todas las consultas han sido completadas o no hay ingresos desde Admisión aún.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-400">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Consultation Form */}
            <div className="flex-1 space-y-8">
              {/* Header Card */}
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-white/10 rounded-[2rem] flex items-center justify-center text-white backdrop-blur-lg">
                    <User className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tight">{selectedVisit.patientName}</h2>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DNI: {selectedVisit.patientDni}</span>
                      <span className="w-1 h-1 bg-white/20 rounded-full" />
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Consulta Actual</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={releaseVisit}
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md disabled:opacity-50"
                >
                  Cancelar Consulta
                </button>
              </div>

              {/* Biometry Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-2">Peso Corporal</span>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                      <Weight className="h-4 w-4" />
                    </div>
                    <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.weight} <span className="text-[10px] text-slate-400">kg</span></span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-3xl">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-2">Talla / Estatura</span>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                      <Ruler className="h-4 w-4" />
                    </div>
                    <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.height} <span className="text-[10px] text-slate-400">cm</span></span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-3xl">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-2">Temperatura</span>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                      <Thermometer className="h-4 w-4" />
                    </div>
                    <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.temperature} <span className="text-[10px] text-slate-400">°C</span></span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-3xl">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest block mb-2">Presión Arterial</span>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                      <Activity className="h-4 w-4" />
                    </div>
                    <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.bloodPressure}</span>
                  </div>
                </div>
              </div>

              {/* Permanent Clinical History (Antecedentes) */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-[2.5rem] p-8 space-y-4">
                <div className="flex justify-between items-center">
                   <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                     <History className="h-3.5 w-3.5" />
                     Antecedentes y Resumen Clínico Permanente
                   </h3>
                   {!isEditingPermanent && (
                     <button 
                       onClick={() => setIsEditingPermanent(true)}
                       className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                     >
                       Actualizar Historial
                     </button>
                   )}
                </div>
                
                {isEditingPermanent ? (
                  <div className="space-y-4">
                    <textarea 
                      className="w-full p-6 bg-white border border-amber-200 rounded-3xl text-sm font-bold text-slate-700 min-h-[150px] focus:ring-4 focus:ring-amber-100 transition-all font-sans"
                      value={permanentHistory}
                      onChange={(e) => setPermanentHistory(e.target.value)}
                      placeholder="Antecedentes patológicos, alergias, cirugías previas..."
                    />
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => setIsEditingPermanent(false)}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleUpdatePermanentHistory}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 flex items-center gap-2"
                      >
                        {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Guardar Historial
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/60 p-6 rounded-3xl border border-white shadow-sm min-h-[80px]">
                    <p className="text-sm text-slate-600 font-medium whitespace-pre-wrap leading-relaxed italic">
                      {permanentHistory || 'Sin antecedentes permanentes registrados aún.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Medical Input */}
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">Evolución Médica</h4>
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3 block ml-1">Antecedentes Relevantes (Contexto)</label>
                      <textarea 
                        placeholder="Ingresa antecedentes, alergias o condiciones previas..."
                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl text-sm font-bold text-slate-700 min-h-[100px] focus:ring-2 focus:ring-blue-100 transition-all italic placeholder:text-slate-300"
                        value={antecedents}
                        onChange={(e) => setAntecedents(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] mb-3 block ml-1 flex items-center justify-between">
                        <span>Nota de Evolución de Hoy</span>
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Campo Requerido</span>
                      </label>
                      <textarea 
                        placeholder="Describe el estado actual, diagnóstico y plan de tratamiento..."
                        className={cn(
                          "w-full px-6 py-4 bg-slate-50 border-2 rounded-3xl text-sm font-bold text-slate-800 min-h-[180px] focus:ring-4 focus:ring-blue-50/50 transition-all placeholder:text-slate-300",
                          !evolutionNotes ? "border-blue-100/50" : "border-emerald-100 bg-white"
                        )}
                        value={evolutionNotes}
                        onChange={(e) => setEvolutionNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setShowInventory(true)}
                    className="flex-1 py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-[2rem] font-black uppercase tracking-widest text-[11px] hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center gap-3 group"
                  >
                    <Plus className="h-4 w-4 bg-slate-100 p-0.5 rounded group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors" />
                    Agregar Medicación (Farmacia)
                  </button>
                  <button 
                    onClick={handleCompleteConsultation}
                    disabled={isSubmitting}
                    className={cn(
                      "flex-[2] py-5 rounded-[2rem] font-black uppercase tracking-widest text-[11px] transition-all shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3",
                      !evolutionNotes 
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                        : "bg-slate-900 text-white hover:bg-emerald-600 shadow-slate-200 ripple"
                    )}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : !evolutionNotes ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <ScrollText className="h-4 w-4" />
                    )}
                    {!evolutionNotes ? 'Faltan campos obligatorios' : 'Finalizar y Guardar Consulta'}
                  </button>
                </div>
              </div>
            </div>

            {/* Side Column: Cart/Summary */}
            <div className="w-full lg:w-96 shrink-0 space-y-6">
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-8 sticky top-8">
                <div>
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] mb-4">Medicación Recetada</h4>
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.drugId} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                            <Package className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-700 line-clamp-1">{item.drugName}</p>
                            <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{item.quantity} Uni.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              const qty = parseInt(String(item.quantity)) || 0;
                              if (qty <= 1) {
                                removeFromCart(item.drugId);
                              } else {
                                updateCartQuantity(item.drugId, -1);
                              }
                            }} 
                            className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            title={parseInt(String(item.quantity)) <= 1 ? "Quitar de la receta" : "Reducir cantidad"}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <button onClick={() => updateCartQuantity(item.drugId, 1)} className="p-1 hover:bg-white rounded-lg text-slate-400">
                            <Plus className="h-3 w-3" />
                          </button>
                          <button onClick={() => removeFromCart(item.drugId)} className="p-1 hover:bg-white rounded-lg text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {cart.length === 0 && (
                      <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                        <ShoppingCart className="h-6 w-6 text-slate-100 mx-auto mb-2" />
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Sin medicamentos</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                   <div className="flex items-center gap-4 text-emerald-500 bg-emerald-50 p-4 rounded-2xl mb-4">
                     <Check className="h-5 w-5" />
                     <p className="text-[10px] font-black uppercase tracking-widest leading-snug">
                       El pedido se enviará a farmacia al guardar la consulta.
                     </p>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Selector for Prescriptions */}
      {showInventory && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Agregar Medicación</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Consulta stock en tiempo real</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInventory(false)}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all shadow-sm border border-slate-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
               {/* 
                  We passed a simplified version of Inventory or just 
                  let the doctor use the internal "cart" 
               */}
               <Inventory 
                  externalCart={cart} 
                  setExternalCart={setCart} 
                  isSelectionMode={true} 
               />
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-3">
                  {cart.slice(0, 5).map((item, i) => (
                    <div key={i} className="w-10 h-10 rounded-xl bg-slate-100 border-2 border-white flex items-center justify-center text-blue-600 shadow-sm">
                      <Package className="h-4 w-4" />
                    </div>
                  ))}
                  {cart.length > 5 && (
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border-2 border-white flex items-center justify-center text-white text-[10px] font-black">
                      +{cart.length - 5}
                    </div>
                  )}
                </div>
                <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                  {cart.length === 0 ? 'No hay items seleccionados' : `${cart.length} medicamentos en el pedido`}
                </p>
              </div>
              <button 
                onClick={() => setShowInventory(false)}
                className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200"
              >
                Confirmar Selección
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
