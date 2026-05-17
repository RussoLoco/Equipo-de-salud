import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PatientVisit, MedicalEvolution, UserRole, OrderItem, Order } from '../types';
import { useAuth } from './AuthProvider';
import { User, Activity, Weight, Ruler, Thermometer, Clock, ArrowRight, ClipboardList, BookOpen, ScrollText, Check, Loader2, History, X, ChevronDown, ChevronUp, Calendar, FileText, ShoppingCart, Package, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Inventory from './Inventory';
import PatientFiles from './PatientFiles';

const ROLE_TO_SERVICE: Record<string, string> = {
  'ecografista': 'ecografía',
  'psiquiatra': 'psiquiatría',
  'odontologo': 'odontología'
};

const SERVICE_LABEL: Record<string, string> = {
  'ecografía': 'Ecografía',
  'psiquiatría': 'Psiquiatría',
  'odontología': 'Odontología'
};

interface SpecialistConsultationProps {
  forcedRole?: string;
}

export default function SpecialistConsultation({ forcedRole }: SpecialistConsultationProps) {
  const { profile } = useAuth();
  const [pendingVisits, setPendingVisits] = useState<PatientVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<PatientVisit | null>(null);
  const [peekingPatient, setPeekingPatient] = useState<{ id: string, name: string, dni: string } | null>(null);
  const [peekingHistory, setPeekingHistory] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Specialist State
  const [evolutionNotes, setEvolutionNotes] = useState('');
  const [findings, setFindings] = useState('');
  
  // Permanent History State
  const [permanentHistory, setPermanentHistory] = useState('');
  
  // Evolutionary History State
  const [patientHistory, setPatientHistory] = useState<PatientVisit[]>([]);

  // Scripting (RECETA) State
  const [showInventory, setShowInventory] = useState(false);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [existingOrderItemsState, setExistingOrderItemsState] = useState<OrderItem[]>([]);

  useEffect(() => {
    if (selectedVisit && selectedVisit.interconsultationOrderId) {
      const fetchOrder = async () => {
        try {
          const { data, error } = await supabase.from('orders').select('*').eq('orderId', selectedVisit.interconsultationOrderId).single();
          if (data && !error) {
            setExistingOrderItemsState(data.items || []);
          } else {
            setExistingOrderItemsState([]);
          }
        } catch (err) {
          console.error("Error fetching interconsultation order", err);
          setExistingOrderItemsState([]);
        }
      };
      fetchOrder();
    } else {
      setExistingOrderItemsState([]);
    }
  }, [selectedVisit]);

  // Waitlist UI State
  const [isPediatricCollapsed, setIsPediatricCollapsed] = useState(false);
  const [isAdultCollapsed, setIsAdultCollapsed] = useState(false);
  const [isBiometryCollapsed, setIsBiometryCollapsed] = useState(true);

  const userRole = forcedRole || profile?.role || '';
  const myService = ROLE_TO_SERVICE[userRole];

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
    if (!myService) {
      if (profile) setLoading(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeLimit = today.toISOString();
    
    let sub: any;

    const fetchVisits = async () => {
      const { data } = await supabase.from('patient_visits')
        .select('*')
        .in('status', ['espera', 'atendiendo_especialista'])
        .eq('serviceType', myService)
        .gte('date', timeLimit);

      if (data) {
        const sorted = (data as PatientVisit[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setPendingVisits(sorted);
      }
      setLoading(false);
    }

    fetchVisits();

    sub = supabase.channel('public:patient_visits:specialist')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_visits' }, () => {
        fetchVisits();
      }).subscribe();

    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, [myService]);

  const claimVisit = async (visit: PatientVisit) => {
    if (!profile) return;

    if (visit.status === 'atendiendo_especialista' && visit.attendingDoctorId === profile.uid) {
      setSelectedVisit(visit);
      return;
    }

    if (visit.status === 'atendiendo_especialista' && visit.attendingDoctorId !== profile.uid) {
      console.warn(`Esta consulta ya está siendo atendida por otro especialista.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.from('patient_visits').select('*').eq('id', visit.id).single();
      if (error) throw error;
      
      const currentData = data as PatientVisit;
      if (currentData.status === 'atendiendo_especialista' && currentData.attendingDoctorId !== profile.uid) {
        throw new Error(`Esta consulta ya está siendo atendida por otro especialista.`);
      }

      const visitUpdate = {
        status: 'atendiendo_especialista',
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

  const releaseVisit = async () => {
    if (!selectedVisit || !profile) {
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
      setFindings('');
      setEvolutionNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (selectedVisit) {
      supabase.from('patients').select('*').eq('id', selectedVisit.patientId).single().then(({ data }) => {
        if (data) {
          setPermanentHistory(data.clinicalHistory || '');
        }
      });

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

      let sub = supabase.channel(`public:patient_visits:${selectedVisit.patientId}-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_visits', filter: `patientId=eq.${selectedVisit.patientId}` }, () => fetchHistory())
        .subscribe();

      return () => {
         if (sub) supabase.removeChannel(sub);
      };
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

  const handleCompleteConsultation = async () => {
    if (!selectedVisit || !profile) return;
    if (!evolutionNotes) {
      console.warn('Debes ingresar la nota de evolución.');
      return;
    }

    setIsSubmitting(true);
    try {
      const evolution: MedicalEvolution & { serviceType?: string } = {
        date: new Date().toISOString(),
        antecedents: findings, // Hallazgos / Informe
        notes: evolutionNotes,
        doctorName: profile.name,
        doctorId: profile.uid,
        doctorPhoto: profile.photoURL,
        serviceType: myService || 'especialidad'
      };

      const visitUpdate = {
        status: 'atendido',
        evolution: evolution as any,
        updatedAt: new Date().toISOString()
      };

      let activeOrderId = selectedVisit.interconsultationOrderId;
      let existingOrderItems: OrderItem[] = [];
      let previousDoctorName = '';

      if (activeOrderId) {
        const { data } = await supabase.from('orders').select('*').eq('orderId', activeOrderId).single();
        if (data) {
          const orderData = data as Order;
          existingOrderItems = orderData.items || [];
          previousDoctorName = orderData.doctorName;
        } else {
          activeOrderId = undefined;
        }
      }

      const combinedItems = [...existingOrderItems, ...cart];

      if (combinedItems.length > 0) {
        if (activeOrderId) {
          // Update the existing order to add the new cart items and change status to Pendiente
          await supabase.from('orders').update({
            items: combinedItems as any,
            status: 'Pendiente',
            doctorName: previousDoctorName && previousDoctorName !== profile.name 
                          ? `${previousDoctorName} / ${profile.name}` 
                          : profile.name,
            updatedAt: new Date().toISOString()
          }).eq('orderId', activeOrderId);
        } else {
          // Create new order as usual
          const newOrderId = crypto.randomUUID();
          const orderData: Order = {
            orderId: newOrderId,
            date: new Date().toISOString(),
            doctorId: profile.uid,
            doctorName: profile.name,
            patientId: selectedVisit.patientId,
            patientName: selectedVisit.patientName,
            patientDni: selectedVisit.patientDni,
            items: combinedItems,
            status: 'Pendiente',
            location: 'Consultorio'
          };
          await supabase.from('orders').insert(orderData as any);
        }
      }

      await supabase.from('patient_visits').update(visitUpdate).eq('id', selectedVisit.id);
      
      setSelectedVisit(null);
      setFindings('');
      setEvolutionNotes('');
      setCart([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
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
      <p className="text-sm font-bold text-slate-400">Cargando sala de espera de {SERVICE_LABEL[myService || ''] || 'especialidad'}...</p>
    </div>
  );

  const renderVisitCard = (visit: PatientVisit, queueIndex: number) => {
    const isAttendedByOther = (visit.status === 'atendiendo_especialista' || visit.status === 'atendiendo') && visit.attendingDoctorId !== profile?.uid;
    const isAttendedByMe = visit.status === 'atendiendo_especialista' && visit.attendingDoctorId === profile?.uid;
    const turnNumber = queueIndex + 1;

    return (
      <div 
        key={visit.id}
        onClick={() => !isAttendedByOther && !isSubmitting && claimVisit(visit)}
        className={cn(
          "group relative bg-white border p-8 rounded-[2.5rem] text-left transition-all space-y-6 overflow-hidden",
          isAttendedByOther ? "opacity-60 border-amber-200 bg-amber-50/20 cursor-not-allowed" : "border-slate-100 hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100 cursor-pointer",
          isAttendedByMe && "border-blue-200 bg-blue-50/10 shadow-lg shadow-blue-50"
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
            "w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-transform bg-blue-50/50 text-blue-600 group-hover:scale-110"
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
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all text-[9px] font-black uppercase tracking-widest border border-slate-100 shadow-sm"
            >
              <History className="h-3 w-3" />
              Ver Historial
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight">{visit.patientName}</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">DNI {visit.patientDni}</p>
          {isAttendedByOther && (
            <p className="text-[10px] font-bold text-amber-600 mt-2 flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl w-fit">
              <Activity className="h-3 w-3" />
              Atendido por {visit.attendingDoctorName || 'Colega'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-8 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 text-slate-500">
            <Weight className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-bold">{visit.vitals.weight || '-'}kg</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Ruler className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-bold">{visit.vitals.height || '-'}cm</span>
          </div>
        </div>

        <div className="flex items-center justify-between transition-transform pt-2">
          <span className={cn(
            "text-[10px] font-black uppercase tracking-widest",
            isAttendedByOther ? "text-amber-500" : "text-blue-600"
          )}>
            {isAttendedByOther ? 'Ocupado' : isAttendedByMe ? 'Continuar Atención' : 'Llamar a Sala'}
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
          <div className="flex flex-col gap-12">
            {/* Child Queue Section */}
            <div className="space-y-8">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsPediatricCollapsed(!isPediatricCollapsed)}
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shadow-sm">
                    <Activity className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 group-hover:text-emerald-600 transition-colors">
                      {SERVICE_LABEL[myService || ''] || 'Especialidad'}: Pediátrico
                      <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-emerald-500 transition-transform", isPediatricCollapsed && "rotate-180")} />
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Niños esperando atención especializada</p>
                  </div>
                </div>
                <div className="px-5 py-2.5 bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 flex items-center gap-2 group-hover:bg-emerald-600 transition-colors">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  {childVisits.length} Niños
                </div>
              </div>

              {!isPediatricCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 animate-in slide-in-from-top-4 fade-in duration-300">
                  {childVisits.map((visit, idx) => renderVisitCard(visit, idx))}
                  {childVisits.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-emerald-50/20 border-2 border-dashed border-emerald-100 rounded-[3rem]">
                      <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest">No hay niños en espera</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Adult Queue */}
            <div className="space-y-8">
              <div 
                className="flex items-center justify-between px-4 cursor-pointer group"
                onClick={() => setIsAdultCollapsed(!isAdultCollapsed)}
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center shadow-sm">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 group-hover:text-slate-700 transition-colors">
                       {SERVICE_LABEL[myService || ''] || 'Especialidad'}: Adultos
                       <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-transform", isAdultCollapsed && "rotate-180")} />
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Adultos esperando atención especializada</p>
                  </div>
                </div>
                <div className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 flex items-center gap-2 group-hover:bg-slate-800 transition-colors">
                  <span className="w-2 h-2 bg-slate-400 rounded-full" />
                  {adultVisits.length} Adultos
                </div>
              </div>

              {!isAdultCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 animate-in slide-in-from-top-4 fade-in duration-300">
                  {adultVisits.map((visit, idx) => renderVisitCard(visit, idx))}
                  {adultVisits.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem]">
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
              {/* Header */}
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
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Atención {SERVICE_LABEL[myService || ''] || 'Especializada'}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={releaseVisit}
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-md"
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
                  <div className="w-10 h-10 bg-slate-50 group-hover:bg-blue-50 rounded-xl flex items-center justify-center transition-colors">
                    <ChevronDown className={cn("h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-transform", isBiometryCollapsed && "rotate-180")} />
                  </div>
                </div>

                {!isBiometryCollapsed && (
                  <div className="mt-6 flex flex-col gap-3 animate-in slide-in-from-top-4 fade-in duration-300 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          <Weight className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Corporal</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.weight || '-'} <span className="text-[10px] text-slate-400">kg</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          <Ruler className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Talla / Estatura</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.height || '-'} <span className="text-[10px] text-slate-400">cm</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                          <Thermometer className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Temperatura</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.temperature || '-'} <span className="text-[10px] text-slate-400">°C</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presión Arterial</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.bloodPressure || '-'}</span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frec. Cardiaca</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.heartRate || '-'} <span className="text-[10px] text-slate-400">bpm</span></span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600">
                          <Activity className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SpO2</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{selectedVisit.vitals.o2Saturation || '-'} <span className="text-[10px] text-slate-400">%</span></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Permanent Context */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-[2.5rem] p-8 space-y-4">
                <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                   <FileText className="h-3.5 w-3.5" />
                   Antecedentes Clínicos Permanentes
                </h3>
                <div className="bg-white/60 p-6 rounded-3xl border border-white shadow-sm">
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

              {/* Consultation Inputs */}
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-blue-400 shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">Informe del Especialista</h4>
                  </div>
                  <div className="p-8 space-y-8">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-3 block ml-1">Hallazgos / Informe Técnico</label>
                      <textarea 
                        placeholder="Describe los hallazgos técnicos del estudio o interconsulta..."
                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-3xl text-sm font-bold text-slate-700 min-h-[120px] focus:ring-2 focus:ring-blue-100 transition-all italic"
                        value={findings}
                        onChange={(e) => setFindings(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.25em] mb-3 block ml-1 flex items-center justify-between">
                        <span>Evolución y Notas de Atención</span>
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Requerido</span>
                      </label>
                      <textarea 
                        placeholder="Describe el resultado de la consulta y pasos a seguir..."
                        className="w-full px-6 py-4 border-2 border-slate-100 bg-white rounded-3xl text-sm font-bold text-slate-800 min-h-[180px] focus:ring-4 focus:ring-blue-50 transition-all"
                        value={evolutionNotes}
                        onChange={(e) => setEvolutionNotes(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  {['psiquiatría', 'odontología', 'pediatría', 'clínico'].includes(myService) && (
                    <button 
                      onClick={() => setShowInventory(true)}
                      className="flex-1 py-5 bg-white border border-slate-200 text-slate-600 rounded-3xl font-black uppercase tracking-widest text-[11px] hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center gap-3 group shadow-sm active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
                      Medicamentos
                    </button>
                  )}
                  <button 
                    onClick={handleCompleteConsultation}
                    disabled={isSubmitting || !evolutionNotes}
                    className="flex-[2] py-5 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-widest text-[12px] hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScrollText className="h-5 w-5" />}
                    {isSubmitting ? 'GUARDANDO...' : 'FINALIZAR CONSULTA / INFORME'}
                  </button>
                </div>
              </div>
            </div>

            {/* Side Column: Cart/Summary */}
            <div className="w-full xl:w-96 shrink-0 space-y-6">
              {['psiquiatría', 'odontología', 'pediatría', 'clínico'].includes(myService) && (
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-8 sticky top-8 z-10">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] mb-4">Medicación Recetada</h4>
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                      {existingOrderItemsState.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Recetado por Médico Clínico</p>
                          <div className="space-y-2">
                            {existingOrderItemsState.map((item, idx) => (
                              <div key={idx} className="flex items-start p-3 bg-slate-100 rounded-2xl border border-slate-200">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className="w-8 h-8 shrink-0 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400">
                                    <Package className="h-4 w-4 shrink-0" />
                                  </div>
                                  <div className="flex-1 min-w-0 pr-2">
                                    <p className="text-[10px] font-bold text-slate-500 whitespace-normal break-words leading-tight">{item.drugName}</p>
                                    <div className="flex flex-col gap-1 mt-1">
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.quantity} Uni.</p>
                                      {item.laboratory && <span className="text-[8px] font-bold text-slate-400/80 whitespace-normal break-words leading-snug">LAB: {item.laboratory}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {cart.map(item => (
                        <div key={item.drugId} className="flex items-start justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 group">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 shrink-0 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                              <Package className="h-4 w-4 shrink-0" />
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-[10px] font-bold text-slate-700 whitespace-normal break-words leading-tight">{item.drugName}</p>
                              <div className="flex flex-col gap-1 mt-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.quantity} Uni.</p>
                                {item.laboratory && <span className="text-[8px] font-bold text-slate-400/80 whitespace-normal break-words leading-snug">LAB: {item.laboratory}</span>}
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
                              <X className="h-3 w-3" />
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
                            <button onClick={() => removeFromCart(item.drugId)} className="p-1 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors ml-1">
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
                </div>
              )}

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
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[7px] font-black uppercase tracking-widest rounded border border-blue-100">
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
                              {visit.evolution?.doctorName ? visit.evolution.doctorName.split(' ')[0] : 'Colega'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold line-clamp-3 leading-relaxed">
                          {visit.evolution?.notes}
                        </p>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
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
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-md border border-blue-100">
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
                {peekingHistory.length === 0 && (
                   <div className="py-20 text-center">
                     <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No hay historial de atenciones finalizadas.</p>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
