import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, writeBatch, doc, getDocs, documentId, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order, Medicine } from '../types';
import { useAuth } from './AuthProvider';
import { CheckCircle, Clock, MapPin, User, Pill, ArrowRight, Loader2, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../lib/utils';

export default function OrdersList() {
  const { profile, activeRole } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isPharmacy = activeRole === 'pharmacy';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'admission'; // Admission usually doesn't see orders but let's keep it consistent
  const isDoctor = activeRole === 'doctor';

  useEffect(() => {
    let q;
    const ordersCol = collection(db, 'orders');
    
    // Cost Optimization: We can refine this to fetch only what is strictly necessary.
    // However, since we want real-time updates for both, limit(100) is a safe balance.
    if (isDoctor && !isAdmin) {
      q = query(
        ordersCol,
        where('doctorId', '==', profile?.uid),
        orderBy('date', 'desc'),
        limit(100)
      );
    } else {
      q = query(
        ordersCol,
        orderBy('date', 'desc'),
        limit(150)
      );
    }
    
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), orderId: doc.id } as Order));
      setOrders(docs);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'orders'));

    return () => unsub();
  }, [isDoctor, isAdmin, profile?.uid]);

  const deliverOrder = async (order: Order) => {
    setProcessingId(order.orderId);
    try {
      const batch = writeBatch(db);
      
      const orderRef = doc(db, 'orders', order.orderId);
      batch.update(orderRef, { status: 'Entregado' });

      // Optimization: Fetch all necessary drug stocks in ONE query (Avoid N+1)
      const drugIds = order.items.map(item => item.drugId);
      const drugsSnap = await getDocs(query(collection(db, 'inventory'), where(documentId(), 'in', drugIds)));
      const drugDataMap = new Map(drugsSnap.docs.map(d => [d.id, { ref: d.ref, ...d.data() }]));

      // Iterate through all items in the prescription
      for (const item of order.items) {
        const drugInfo = drugDataMap.get(item.drugId);
        
        if (!drugInfo) {
          console.warn(`Medicine ${item.drugName} no longer exists in inventory.`);
          continue;
        }

        const currentStock = String((drugInfo as any).stock || '');
        const orderQty = String(item.quantity || '');

        const numStock = parseInt(currentStock.replace(/[^0-9]/g, ''));
        const numQty = parseInt(orderQty.replace(/[^0-9]/g, ''));

        if (!isNaN(numStock) && !isNaN(numQty) && currentStock.match(/^[0-9]+$/) && orderQty.match(/^[0-9]+$/)) {
          if (numStock < numQty) {
            throw new Error(`Stock insuficiente para ${item.drugName}. Solicitado: ${item.quantity}, Disponible: ${currentStock}`);
          }
          batch.update(drugInfo.ref, { stock: String(numStock - numQty) });
        }
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders/inventory');
      alert('Error: ' + (error instanceof Error ? error.message : 'No se pudo procesar'));
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.status === 'Pendiente');
  const deliveredOrders = orders.filter(o => o.status === 'Entregado');

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <Clock className="text-amber-500 h-5 w-5" />
              Cola de Despacho
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Pedidos en espera de validación</p>
          </div>
          <span className="self-start sm:self-center rounded-lg bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-700 border border-amber-100 shadow-sm">
            {pendingOrders.length} Pendientes
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 sm:p-16 text-center">
            <ShoppingBag className="mx-auto h-12 w-12 text-slate-200 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sin actividad pendiente</p>
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {pendingOrders.map((order) => (
              <div
                key={order.orderId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md border-t-4 border-t-amber-400"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                      {format(new Date(order.date), 'HH:mm', { locale: es })}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded">FOLIO: {order.orderId.slice(-6).toUpperCase()}</span>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex flex-col gap-2 mb-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-600" />
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">Paciente: {order.patientName || 'No asignado'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-slate-400" />
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">DNI: {order.patientDni || '---'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded bg-blue-50 flex items-center justify-center border border-blue-100">
                        <User className="h-3 w-3 text-blue-500" />
                      </div>
                      <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">Médico: {order.doctorName}</p>
                    </div>
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 px-1">Prescripción</h3>
                    <div className="space-y-2">
                       {order.items.map((item, idx) => (
                         <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <span className="text-[11px] font-bold text-slate-700">{item.drugName}</span>
                           <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 border border-slate-200 rounded">x{item.quantity}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-8 pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Solicitante</p>
                        <p className="text-xs font-bold text-slate-700">{order.doctorName}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
                        <MapPin className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Ubicación Física</p>
                        <p className="text-xs font-bold text-emerald-700">{order.location}</p>
                      </div>
                    </div>
                  </div>

                  {isPharmacy ? (
                    <button
                      disabled={processingId === order.orderId}
                      onClick={() => deliverOrder(order)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-50 shadow-lg shadow-slate-200"
                    >
                      {processingId === order.orderId ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4 text-blue-400" />
                          PROCESAR DESPACHO
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-100">
                      <Clock className="h-3 w-3" />
                      En Espera de Farmacia
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <CheckCircle className="text-emerald-500 h-5 w-5" />
            Historial de Entregas
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Registros de pedidos finalizados</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            {/* Desktop View Table */}
            <table className="w-full text-left text-sm text-slate-600 hidden sm:table">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-100">
                  <th className="px-6 py-4">Prescripción / Folio</th>
                  <th className="px-6 py-4">Paciente</th>
                  <th className="px-6 py-4">Fecha/Hora</th>
                  <th className="px-6 py-4 text-right">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deliveredOrders.slice(0, 10).map((order) => (
                  <tr key={order.orderId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex flex-wrap gap-1 mb-1">
                         {order.items.map((item, idx) => (
                           <span key={idx} className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                             {item.drugName} (x{item.quantity})
                           </span>
                         ))}
                       </div>
                       <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">FOLIO: {order.orderId}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-700">{order.patientName || '---'}</p>
                      <p className="text-[9px] font-medium text-slate-400">DNI: {order.patientDni || '---'}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {format(new Date(order.date), "dd/MM/yyyy HH:mm", { locale: es })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                        Entregado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile View Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
               {deliveredOrders.slice(0, 5).map((order) => (
                 <div key={order.orderId} className="p-4 bg-white">
                   <div className="flex justify-between items-start mb-2">
                     <div>
                        <p className="text-xs font-black text-slate-800">{order.patientName || 'Paciente Anónimo'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">DNI: {order.patientDni || '---'}</p>
                     </div>
                     <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">ENTREGADO</span>
                   </div>
                   <div className="flex flex-wrap gap-1 mb-3">
                     {order.items.map((item, idx) => (
                       <span key={idx} className="text-[8px] font-bold bg-slate-50 text-slate-500 px-1 py-0.5 rounded border border-slate-100">
                         {item.drugName} (x{item.quantity})
                       </span>
                     ))}
                   </div>
                   <p className="text-[8px] font-mono text-slate-300 uppercase">FOLIO: {order.orderId.slice(-8)} • {format(new Date(order.date), "dd/MM HH:mm")}</p>
                 </div>
               ))}
            </div>

            {deliveredOrders.length === 0 && (
              <div className="py-12 text-center text-slate-300 font-medium">Historial vacío.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
