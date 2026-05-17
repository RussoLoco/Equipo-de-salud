import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PatientVisit, MedicalEvolution, Medicine, OrderItem, Order } from '../types';
import { useAuth } from './AuthProvider';
import { User, Activity, Weight, Ruler, Thermometer, Clock, ArrowRight, ClipboardList, BookOpen, ScrollText, Check, Loader2, Search, X, ShoppingCart, Plus, Trash2, Package, History, AlertCircle, ChevronDown, ChevronUp, Calendar, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Inventory from './Inventory';
import PatientFiles from './PatientFiles';

export default function MedicalConsultation() {
  const { profile } = useAuth();
  const [pendingVisits, setPendingVisits] = useState<PatientVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<PatientVisit | null>(null);
  const [peekingPatient, setPeekingPatient] = useState<{ id: string, name: string, dni: string } | null>(null);
  const [peekingHistory, setPeekingHistory] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingService, setSubmittingService] = useState<string | null>(null);

  // Consultation State
  const [antecedents, setAntecedents] = useState('');
  const [evolutionNotes, setEvolutionNotes] = useState('');
  
  // Permanent History State
  const [permanentHistory, setPermanentHistory] = useState('');
  const [isEditingPermanent, setIsEditingPermanent] = useState(false);
  
  // Evolutionary History State
  const [patientHistory, setPatientHistory] = useState<PatientVisit[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  
  // Scripting (RECETA) State
  const [showInventory, setShowInventory] = useState(false);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Waitlist UI State
  const [isPediatricCollapsed, setIsPediatricCollapsed] = useState(false);
  const [isAdultCollapsed, setIsAdultCollapsed] = useState(false);
  const [isBiometryCollapsed, setIsBiometryCollapsed] = useState(true);

  // Biometrics Edit State
  const [isEditingBiometrics, setIsEditingBiometrics] = useState(false);
  const [biometricsForm, setBiometricsForm] = useState({
    weight: '',
    height: '',
    temperature: '',
    bloodPressure: '',
    heartRate: '',
    o2Saturation: ''
  });

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
    
    let sub: any;

    const fetchVisits = async () => {
      const allowedRoles = profile?.role === 'nutritionist' ? ['nutrición'] :
                           profile?.role === 'ecografista' ? ['ecografía'] :
                           profile?.role === 'psiquiatra' ? ['psiquiatría'] :
                           profile?.role === 'odontologo' ? ['odontología'] :
                           ['clínico', 'pediatría'];

      const { data } = await supabase.from('patient_visits')
        .select('*')
        .in('status', ['espera', 'atendiendo', 'atendiendo_nutri', 'atendiendo_especialista'])
        .gte('date', timeLimit);

      if (data) {
        const docs = (data as PatientVisit[])
          .filter(v => (v.serviceType ? allowedRoles.includes(v.serviceType) : true));
        // Ordenamos por fecha de llegada
        const sorted = docs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setPendingVisits(sorted);
      }
      setLoading(false);
    };

    fetchVisits();

    sub = supabase.channel('public:patient_visits:medical')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_visits' }, () => {
        fetchVisits();
      }).subscribe();

    return () => {
      if (sub) supabase.removeChannel(sub);
    };
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
      console.warn(`Esta consulta ya está siendo atendida por el Dr/a. ${visit.attendingDoctorName || 'otro profesional'}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.from('patient_visits').select('*').eq('id', visit.id).single();
      if (error) throw error;
      
      const currentData = data as PatientVisit;
      if (currentData.status === 'atendiendo' && currentData.attendingDoctorId !== profile.uid) {
        throw new Error(`Esta consulta ya está siendo atendida por el Dr/a. ${currentData.attendingDoctorName || 'otro profesional'}.`);
      }

      const visitUpdate = {
        status: 'atendiendo',
        attendingDoctorId: profile.uid,
        attendingDoctorName: profile.name,
        updatedAt: new Date().toISOString()
      };

      const { error: updateError } = await supabase.from('patient_visits').update(visitUpdate).eq('id', visit.id);
      if (updateError) throw updateError;

      setSelectedVisit({ ...visit, ...visitUpdate } as PatientVisit);
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitBiometricsEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !profile) return;
    try {
      setIsSubmitting(true);
      
      const newVitals = {
        ...(selectedVisit.vitals || { date: new Date().toISOString() }),
        weight: biometricsForm.weight,
        height: biometricsForm.height,
        temperature: biometricsForm.temperature,
        bloodPressure: biometricsForm.bloodPressure,
        heartRate: biometricsForm.heartRate,
        o2Saturation: biometricsForm.o2Saturation,
      };

      await supabase.from('patients').update({
        vitals: newVitals,
        updatedAt: new Date().toISOString()
      }).eq('id', selectedVisit.patientId);

      await supabase.from('patient_visits').update({ 
        vitals: newVitals, 
        updatedAt: new Date().toISOString() 
      }).eq('patientId', selectedVisit.patientId);

      setSelectedVisit({ ...selectedVisit, vitals: newVitals as any });
      setIsEditingBiometrics(false);
    } catch (error) {
      console.error(error);
      console.warn("Error actualizando biometría, revisa permisos o conexión.");
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
        attendingDoctorName: null,
        updatedAt: new Date().toISOString()
      };

      await supabase.from('patient_visits').update(visitUpdate).eq('id', selectedVisit.id);

      setSelectedVisit(null);
      setAntecedents('');
      setEvolutionNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (selectedVisit) {
      // Fetch permanent clinical history from patients collection
      supabase.from('patients').select('*').eq('id', selectedVisit.patientId).single().then(({ data }) => {
        if (data) {
          setPermanentHistory(data.clinicalHistory || '');
        }
      });

      let subHistory: any;

      const fetchHistory = async () => {
        const { data } = await supabase.from('patient_visits')
          .select('*')
          .eq('patientId', selectedVisit.patientId)
          .order('date', { ascending: false })
          .limit(50);
        
        if (data) {
          setPatientHistory((data as PatientVisit[]).filter(v => v.id !== selectedVisit.id));
        }
      };

      fetchHistory();

      subHistory = supabase.channel(`public:patient_visits:${selectedVisit.patientId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_visits', filter: `patientId=eq.${selectedVisit.patientId}` }, () => fetchHistory())
        .subscribe();

      return () => {
        if (subHistory) supabase.removeChannel(subHistory);
      };
    } else {
      setPatientHistory([]);
      setShowFullHistory(false);
    }
  }, [selectedVisit]);
  
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (peekingPatient) {
      const fetchPeeking = async () => {
        const { data } = await supabase.from('patient_visits')
          .select('*')
          .eq('patientId', peekingPatient.id)
          .order('date', { ascending: false })
          .limit(20);
        
        if (data) {
          setPeekingHistory((data as PatientVisit[]).filter(v => v.status === 'atendido'));
        }
      };

      fetchPeeking();
    } else {
      setPeekingHistory([]);
    }
    return () => unsubscribe?.();
  }, [peekingPatient]);

  const handleUpdatePermanentHistory = async () => {
    if (!selectedVisit) return;
    setIsSubmitting(true);
    try {
      await supabase.from('patients').update({
        clinicalHistory: permanentHistory
      }).eq('id', selectedVisit.patientId);
      setIsEditingPermanent(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReferPatient = async (service: PatientVisit['serviceType']) => {
    setSubmittingService(service);
    // We now use handleCompleteConsultation(service) to ensure notes and orders are saved
    await handleCompleteConsultation(service);
  };

  const handleCompleteConsultation = async (referralService?: PatientVisit['serviceType']) => {
    if (!selectedVisit || !profile) return;
    if (!evolutionNotes && !referralService) {
      console.warn('Debes ingresar la nota de evolución médica antes de finalizar.');
      return;
    }

    setIsSubmitting(true);
    if (!referralService) setSubmittingService(null);
    try {
      const evolution: MedicalEvolution & { serviceType?: string } = {
        date: new Date().toISOString(),
        antecedents,
        notes: evolutionNotes || 'Derivación sin notas adicionales.',
        doctorName: profile.name,
        doctorId: profile.uid,
        doctorPhoto: profile.photoURL,
        serviceType: selectedVisit.serviceType || 'clínico'
      };

      const visitUpdate = {
        status: 'atendido',
        evolution: evolution as any,
        updatedAt: new Date().toISOString()
      };

      // Create Order if cart has items
      let orderId: string | null = null;
      if (cart.length > 0) {
        orderId = crypto.randomUUID();
        const isInterconsultation = !!referralService && (referralService === 'odontología' || referralService === 'psiquiatría');
        const orderData: Order = {
          orderId,
          date: new Date().toISOString(),
          doctorId: profile.uid,
          doctorName: profile.name,
          patientId: selectedVisit.patientId,
          patientName: selectedVisit.patientName,
          patientDni: selectedVisit.patientDni,
          items: cart,
          status: isInterconsultation ? 'En_Interconsulta' : 'Pendiente',
          location: 'Consultorio'
        };
        await supabase.from('orders').insert(orderData as any);
      }

      // Update current visit
      await supabase.from('patient_visits').update(visitUpdate).eq('id', selectedVisit.id);

      // If it's a referral, create a NEW visit for the next service
      if (referralService) {
        const newVisitId = crypto.randomUUID();
        const newVisitData: PatientVisit = {
          id: newVisitId,
          patientId: selectedVisit.patientId,
          patientName: selectedVisit.patientName,
          patientDni: selectedVisit.patientDni,
          age: selectedVisit.age || '',
          location: selectedVisit.location || '',
          category: selectedVisit.category,
          date: new Date().toISOString(),
          status: 'espera',
          serviceType: referralService,
          vitals: selectedVisit.vitals, // Copy vitals to the new visit
          ...(orderId && (referralService === 'odontología' || referralService === 'psiquiatría') ? { interconsultationOrderId: orderId } : {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await supabase.from('patient_visits').insert(newVisitData as any);
      }

      if (referralService) {
        console.warn(`Consulta guardada y paciente derivado a ${getServiceLabel(referralService)} correctamente.`);
      } else {
        console.warn('Consulta finalizada y guardada correctamente.');
      }

      setSelectedVisit(null);
      setAntecedents('');
      setEvolutionNotes('');
      setCart([]);
      setShowReferralModal(false);
    } catch (err) {
      console.warn(`Error al procesar la consulta: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
      setSubmittingService(null);
    }
  };

  const removeFromCart = (drugId: string) => {
    setCart(cart.filter(item => item.drugId !== drugId));
  };

  const updateCartQuantity = (drugId: string, value: string) => {
    setCart(cart.map(item => {
      if (item.drugId === drugId) {
        return { ...item, quantity: value };
      }
      return item;
    }));
  };

  const adultVisits = pendingVisits.filter(v => v.category === 'Adulto');
  const childVisits = pendingVisits.filter(v => v.category === 'Niño');

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20">
      <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
      <p className="text-sm font-bold text-slate-400">Cargando sala de espera...</p>
    </div>
  );

  const renderVisitCard = (visit: PatientVisit, queueIndex: number) => {
    const isAttendedByOther = (visit.status === 'atendiendo' && visit.attendingDoctorId !== profile?.uid) || visit.status === 'atendiendo_nutri';
    const isAttendedByMe = visit.status === 'atendiendo' && visit.attendingDoctorId === profile?.uid;
    const turnNumber = queueIndex + 1;

    return (
      <div 
        key={visit.id}
        onClick={() => !isAttendedByOther && !isSubmitting && claimVisit(visit)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            !isAttendedByOther && !isSubmitting && claimVisit(visit);
          }
        }}
        className={cn(
          "group relative bg-white border p-8 rounded-[2.5rem] text-left transition-all space-y-6 overflow-hidden",
          isAttendedByOther ? "opacity-60 border-amber-200 bg-amber-50/20 cursor-not-allowed" : "border-slate-200 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100 cursor-pointer",
          isAttendedByMe && "border-emerald-200 bg-emerald-50/20 shadow-lg shadow-emerald-50"
        )}
      >
        {isAttendedByOther ? (
          <div className="absolute top-0 right-0 flex items-center">
            <div className={cn(
              "px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-2xl",
              visit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
            )}>
              {visit.category}
            </div>
            <div className="bg-amber-500 text-white px-4 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-2xl">
              {visit.status === 'atendiendo_nutri' ? 'En Nutrición' : 'En Atención'}
            </div>
          </div>
        ) : (
          <div className="absolute top-0 right-0 flex items-center">
            <div className={cn(
              "px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-2xl",
              visit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
            )}>
              {visit.category}
            </div>
            <div className="bg-slate-900 text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-2xl">
              Turno #{turnNumber}
            </div>
          </div>
        )}

        <div className="flex justify-between items-start">
          <div className={cn(
            "w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-transform",
            isAttendedByOther ? "bg-amber-100 text-amber-600" : "bg-blue-50 text-blue-600 group-hover:scale-110"
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest border border-slate-100"
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
              Dr/a. {visit.attendingDoctorName}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-slate-500">
            <Weight className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-bold">{visit.vitals.weight || '-'}kg</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-xs font-bold">{visit.vitals.bloodPressure || '-'}</span>
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
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-32">
      {!selectedVisit ? (
        <div className="space-y-12">
          {/* Patients in Waitlist Section */}
          <div className="flex flex-col gap-10">
            {/* Child Queue Section */}
            <div className="space-y-6">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsPediatricCollapsed(!isPediatricCollapsed)}
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 group-hover:text-blue-600 transition-colors">
                    <div className="p-2 bg-blue-100 rounded-xl"><Activity className="h-5 w-5 text-blue-600" /></div>
                    Sala de Espera: Pediátrica
                    <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-transform", isPediatricCollapsed && "rotate-180")} />
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pacientes niños que completaron biometría</p>
                </div>
                <div className="px-4 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-100 group-hover:bg-blue-700 transition-colors">
                  {childVisits.length} Niños
                </div>
              </div>

              {!isPediatricCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
                  {childVisits.map((visit, idx) => renderVisitCard(visit, idx))}
                  {childVisits.length === 0 && (
                    <div className="col-span-full py-16 text-center bg-blue-50/30 border-2 border-dashed border-blue-100 rounded-[3rem]">
                      <p className="text-xs font-bold text-blue-300 uppercase tracking-widest">No hay niños en espera</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Adult Queue Section */}
            <div className="space-y-6">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsAdultCollapsed(!isAdultCollapsed)}
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 group-hover:text-slate-700 transition-colors">
                     <div className="p-2 bg-slate-100 rounded-xl"><User className="h-5 w-5 text-slate-600" /></div>
                     Sala de Espera: Adultos
                     <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-transform", isAdultCollapsed && "rotate-180")} />
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pacientes adultos recibidos de admisión</p>
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
            {/* Consultation Form */}
            <div className="flex-1 space-y-8 min-w-0">
              {/* Header Card */}
              <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-white/10 rounded-[2rem] flex items-center justify-center text-white backdrop-blur-lg">
                    <User className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tight">{selectedVisit.patientName}</h2>
                    <div className="flex flex-wrap items-center gap-4 mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DNI: {selectedVisit.patientDni}</span>
                      <span className="w-1 h-1 bg-white/20 rounded-full" />
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest",
                        selectedVisit.category === 'Niño' ? "bg-amber-400 text-amber-900" : "bg-emerald-400 text-emerald-900"
                      )}>
                        {selectedVisit.category}
                      </span>
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
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 shadow-sm">
                <div 
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => setIsBiometryCollapsed(!isBiometryCollapsed)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                      <Activity className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest group-hover:text-blue-600 transition-colors">
                        Datos Biométricos
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        Signos vitales de la admisión
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(profile?.role === 'doctor' || profile?.role === 'admin') && selectedVisit.category?.toLowerCase() === 'adulto' && !isEditingBiometrics && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBiometricsForm({
                            weight: selectedVisit.vitals?.weight || '',
                            height: selectedVisit.vitals?.height || '',
                            temperature: selectedVisit.vitals?.temperature || '',
                            bloodPressure: selectedVisit.vitals?.bloodPressure || '',
                            heartRate: selectedVisit.vitals?.heartRate || '',
                            o2Saturation: selectedVisit.vitals?.o2Saturation || ''
                          });
                          setIsEditingBiometrics(true);
                          setIsBiometryCollapsed(false);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        Editar
                      </button>
                    )}
                    <div className="w-10 h-10 bg-slate-50 group-hover:bg-blue-50 rounded-xl flex items-center justify-center transition-colors">
                      <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-transform", isBiometryCollapsed && "rotate-180")} />
                    </div>
                  </div>
                </div>

                {!isBiometryCollapsed && (
                  <div className="mt-6 flex flex-col gap-3 animate-in slide-in-from-top-4 fade-in duration-300 border-t border-slate-100 pt-6">
                    {isEditingBiometrics ? (
                      <form onSubmit={submitBiometricsEdit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Peso (kg)</label>
                            <input 
                              type="number" 
                              step="0.1"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.weight} 
                              onChange={e => setBiometricsForm({...biometricsForm, weight: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Altura (cm)</label>
                            <input 
                              type="number" 
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.height} 
                              onChange={e => setBiometricsForm({...biometricsForm, height: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Temperatura (°C)</label>
                            <input 
                              type="number" 
                              step="0.1"
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.temperature} 
                              onChange={e => setBiometricsForm({...biometricsForm, temperature: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Tensión Arterial</label>
                            <input 
                              type="text" 
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.bloodPressure} 
                              onChange={e => setBiometricsForm({...biometricsForm, bloodPressure: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Frec. Cardíaca</label>
                            <input 
                              type="number" 
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.heartRate} 
                              onChange={e => setBiometricsForm({...biometricsForm, heartRate: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">SpO2 (%)</label>
                            <input 
                              type="number" 
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              value={biometricsForm.o2Saturation} 
                              onChange={e => setBiometricsForm({...biometricsForm, o2Saturation: e.target.value})} 
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-3">
                          <button 
                            type="button" 
                            onClick={() => setIsEditingBiometrics(false)} 
                            className="px-5 py-2.5 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                          >
                            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                              <Weight className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Corporal</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.weight || '-'} <span className="text-[10px] text-slate-400">kg</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                              <Ruler className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Talla / Estatura</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.height || '-'} <span className="text-[10px] text-slate-400">cm</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                              <Thermometer className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temperatura</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.temperature || '-'} <span className="text-[10px] text-slate-400">°C</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                              <Activity className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presión Arterial</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.bloodPressure || '-'}</span>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                              <Activity className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frec. Cardiaca</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.heartRate || '-'} <span className="text-[10px] text-slate-400">bpm</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600">
                              <Activity className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SpO2</span>
                          </div>
                          <span className="text-lg font-black text-slate-800">{selectedVisit.vitals?.o2Saturation || '-'} <span className="text-[10px] text-slate-400">%</span></span>
                        </div>
                      </>
                    )}
                  </div>
                )}
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

              {/* Evolutionary Clinical History (Past Consultations) */}
              <div className="bg-blue-50/30 border border-blue-100 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-blue-800 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Consultas Anteriores (Historia Evolutiva)
                  </h3>
                  <button 
                    onClick={() => setShowFullHistory(!showFullHistory)}
                    className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                  >
                    {showFullHistory ? 'Ocultar' : 'Ver Todas'}
                    {showFullHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>

                {patientHistory.length === 0 ? (
                  <p className="text-[10px] font-bold text-slate-400 italic">No se encontraron consultas previas para este paciente.</p>
                ) : (
                  <div className="space-y-3">
                    {patientHistory.slice(0, showFullHistory ? patientHistory.length : 1).map((visit) => (
                      <div key={visit.id} className="bg-white border border-blue-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                        <div className="p-5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                              <Calendar className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-black text-slate-800">
                                  {format(new Date(visit.date), 'EEEE d MMMM, yyyy', { locale: es })}
                                </p>
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-blue-100">
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
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">
                                  {visit.evolution?.doctorName ? `Dr/a. ${visit.evolution.doctorName.split(' ')[0]}` : 'Sin dato'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="hidden sm:flex items-center gap-3">
                              <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                                <Weight className="h-3 w-3 text-blue-400" /> {visit.vitals.weight}kg
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                                <Activity className="h-3 w-3 text-purple-400" /> {visit.vitals.bloodPressure}
                              </div>
                            </div>
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded-full">
                              Completada
                            </span>
                          </div>
                        </div>
                        
                        <div className="px-8 pb-6 pt-2 border-t border-blue-50">
                          <div className="space-y-4">
                            {visit.evolution?.antecedents && (
                              <div>
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1 block">Contexto de la visita</span>
                                <p className="text-[11px] text-slate-500 italic font-medium leading-relaxed">
                                  {visit.evolution.antecedents}
                                </p>
                              </div>
                            )}
                            <div>
                              <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.2em] mb-1 block">Nota de Evolución</span>
                              <p className="text-xs text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">
                                {visit.evolution?.notes || 'Sin notas registradas.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!showFullHistory && patientHistory.length > 1 && (
                      <button 
                        onClick={() => setShowFullHistory(true)}
                        className="w-full py-3 bg-white border border-slate-100 rounded-2xl text-[9px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                      >
                        Mostrar {patientHistory.length - 1} consultas anteriores
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Patient Files */}
              {selectedVisit && (
                <div className="bg-white border border-slate-200 rounded-[3rem] p-8 pb-10 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-50" />
                  <PatientFiles patientId={selectedVisit.patientId} />
                </div>
              )}

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
                    className="flex-1 py-5 bg-white border border-slate-200 text-slate-600 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center gap-3 group shadow-sm active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
                    Medicamentos
                  </button>
                  <button 
                    onClick={() => setShowReferralModal(true)}
                    className="flex-1 py-5 bg-blue-50/50 border border-blue-100 text-blue-600 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:bg-blue-100 transition-all flex items-center justify-center gap-3 group shadow-sm shadow-blue-50 active:scale-[0.98]"
                  >
                    <ArrowRight className="h-4 w-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
                    Interconsulta
                  </button>
                  <button 
                    onClick={() => handleCompleteConsultation()}
                    disabled={isSubmitting}
                    className={cn(
                      "flex-[2] py-5 rounded-3xl font-black uppercase tracking-widest text-[11px] transition-all shadow-2xl disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]",
                      !evolutionNotes 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200" 
                        : "bg-slate-900 text-white hover:bg-emerald-600 shadow-slate-200"
                    )}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : !evolutionNotes ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {!evolutionNotes ? 'Falta nota de evolución' : 'Finalizar Atenciones'}
                  </button>
                </div>
              </div>
            </div>

            {/* Side Column: Cart/Summary */}
            <div className="w-full xl:w-96 shrink-0 space-y-6">
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-8 sticky top-8">
                <div>
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] mb-4">Medicación Recetada</h4>
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                    {cart.map(item => (
                      <div key={item.drugId} className="flex items-start justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 group">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 shrink-0 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                            <Package className="h-4 w-4 shrink-0" />
                          </div>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-[10px] font-bold text-slate-700 whitespace-normal break-words leading-tight">{item.drugName}</p>
                            <div className="flex flex-col gap-1 mt-1">
                              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{item.quantity} Uni.</p>
                              {item.laboratory && <span className="text-[8px] font-bold text-slate-400/80 whitespace-normal break-words leading-snug">LAB: {item.laboratory}</span>}
                              {item.location && (
                                <span className="text-[7px] font-black w-fit text-blue-400 uppercase tracking-widest bg-blue-50 px-1 rounded flex items-center gap-0.5 mt-0.5">
                                  <MapPin className="h-2 w-2 shrink-0" /> {item.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2 mt-1">
                          <button 
                            onClick={() => {
                              const qtyNum = parseInt(String(item.quantity).replace(/[^0-9]/g, '')) || 0;
                              if (qtyNum <= 1) {
                                removeFromCart(item.drugId);
                              } else {
                                updateCartQuantity(item.drugId, String(qtyNum - 1));
                              }
                            }} 
                            className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            title="Reducir cantidad"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <input 
                            type="text"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.drugId, e.target.value)}
                            className="w-16 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-center text-slate-700 py-1 focus:ring-2 focus:ring-blue-100"
                          />
                          <button 
                            onClick={() => {
                              const qtyNum = parseInt(String(item.quantity).replace(/[^0-9]/g, '')) || 0;
                              updateCartQuantity(item.drugId, String(qtyNum + 1));
                            }} 
                            className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button onClick={() => removeFromCart(item.drugId)} className="p-1 hover:bg-white rounded-lg text-red-500 ml-1">
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

      {/* Referral Modal */}
      {showReferralModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh] p-10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                 <ArrowRight className="h-6 w-6" />
               </div>
               <div>
                 <h3 className="text-xl font-black text-slate-900 tracking-tight">Derivar Paciente</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Interconsulta Especializada</p>
               </div>
            </div>

            <div className="space-y-3">
               {[
                 { id: 'ecografía', label: 'Ecografía' },
                 { id: 'psiquiatría', label: 'Psiquiatría' },
                 { id: 'odontología', label: 'Odontología' },
                 { id: 'nutrición', label: 'Nutrición' },
                 { id: 'clínico', label: 'Clínica Médica' },
                 { id: 'pediatría', label: 'Pediatría' }
               ].filter(service => {
                 if (selectedVisit.category === 'Adulto' && service.id === 'pediatría') return false;
                 if (selectedVisit.category === 'Niño' && service.id === 'clínico') return false;
                 return true;
               }).map(service => (
                 <button 
                   key={service.id}
                   type="button"
                   disabled={isSubmitting}
                   onClick={() => handleReferPatient(service.id as any)}
                   className={cn(
                     "w-full p-5 text-left bg-white hover:bg-blue-50 border-2 rounded-2xl flex items-center justify-between group transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg active:scale-95 active:shadow-none",
                     submittingService === service.id ? "border-blue-400 bg-blue-50 cursor-wait" : "border-slate-100 hover:border-blue-300",
                     isSubmitting && submittingService !== service.id && "opacity-50 cursor-not-allowed hover:-translate-y-0 hover:shadow-none bg-slate-50 border-slate-100"
                   )}
                 >
                   <span className={cn(
                     "text-[13px] font-black uppercase tracking-widest transition-colors",
                     submittingService === service.id ? "text-blue-600" : "text-slate-600 group-hover:text-blue-600"
                   )}>
                     {service.label}
                   </span>
                   {submittingService === service.id ? (
                     <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                   ) : (
                     <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-2 transition-all duration-300" />
                   )}
                 </button>
               ))}
            </div>

            <button 
              type="button"
              onClick={() => setShowReferralModal(false)}
              className="w-full mt-8 py-4 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors"
            >
              Cancelar Derivación
            </button>
          </div>
        </div>
      )}

      {/* Inventory Selector for Prescriptions */}
      {showInventory && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 lg:p-12 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-7xl h-[calc(100vh-2rem)] lg:h-[90vh] rounded-[2rem] lg:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
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
            
            <div className="flex-1 min-h-0 bg-slate-50/30 p-4 lg:p-8 flex flex-col">
               <Inventory 
                  externalCart={cart} 
                  setExternalCart={setCart} 
                  isSelectionMode={true} 
                  onConfirm={() => setShowInventory(false)}
               />
            </div>
          </div>
        </div>
      )}

      {/* Peek History Modal */}
      {peekingPatient && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 lg:p-12 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-7xl h-full lg:h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{peekingPatient.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Vista Rápida de Historial - DNI {peekingPatient.dni}</p>
                </div>
              </div>
              <button 
                onClick={() => setPeekingPatient(null)}
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all shadow-sm border border-slate-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
              {peekingHistory.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center text-slate-100 mb-4 shadow-sm">
                    <BookOpen className="h-10 w-10" />
                  </div>
                  <p className="text-sm font-bold text-slate-300">No hay consultas anteriores registradas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {peekingHistory.map((visit) => (
                    <div key={visit.id} className="border border-slate-100 rounded-3xl p-8 bg-white shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                             <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-slate-800">
                                {format(new Date(visit.date), 'EEEE d MMMM, yyyy', { locale: es })}
                              </p>
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-blue-100">
                                {getServiceLabel(visit.serviceType)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {visit.evolution?.doctorPhoto ? (
                                <img 
                                  src={visit.evolution.doctorPhoto} 
                                  alt={visit.evolution.doctorName}
                                  className="w-5 h-5 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
                                  <User className="h-3 w-3 text-slate-400" />
                                </div>
                              )}
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                                Atendido por {visit.evolution?.doctorName}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                             <Weight className="h-3.5 w-3.5 text-blue-400" /> {visit.vitals.weight}kg
                           </div>
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                             <Activity className="h-3.5 w-3.5 text-purple-400" /> {visit.vitals.bloodPressure}
                           </div>
                        </div>
                      </div>
                      <div className="space-y-6 pl-14 relative before:absolute before:left-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                        {visit.evolution?.antecedents && (
                          <div>
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2 block">Contexto de la visita</span>
                            <p className="text-xs text-slate-500 italic leading-relaxed">{visit.evolution.antecedents}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-[9px] font-black text-blue-300 uppercase tracking-[0.2em] mb-2 block">Nota de Evolución</span>
                          <p className="text-sm text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">{visit.evolution?.notes}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 bg-white">
              <button 
                onClick={() => setPeekingPatient(null)}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.25em] hover:bg-blue-600 transition-all shadow-xl shadow-slate-100"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
