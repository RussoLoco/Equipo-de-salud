import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, writeBatch, doc, getDocs, documentId, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order, Medicine } from '../types';
import { useAuth } from './AuthProvider';
import { CheckCircle, Clock, MapPin, User, Pill, ArrowRight, Loader2, ShoppingBag, ClipboardList, History } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../lib/utils';

export default function OrdersList() {
  const { profile, activeRole } = useAuth();
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isPharmacy = activeRole === 'pharmacy';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'admission'; 
  const isDoctor = activeRole === 'doctor';

  useEffect(() => {
    setLoading(true);
    const ordersCol = collection(db, 'orders');
    
    // 1. Real-time Listener ONLY for PENDING orders (The active queue)
    let pendingQuery;
    if (isDoctor && !isAdmin) {
      pendingQuery = query(
        ordersCol,
        where('status', '==', 'Pendiente'),
        where('doctorId', '==', profile?.uid),
        orderBy('date', 'desc'),
        limit(50)
      );
    } else {
      pendingQuery = query(
        ordersCol,
        where('status', '==', 'Pendiente'),
        orderBy('date', 'desc'),
        limit(100)
      );
    }
    
    const unsubPending = onSnapshot(pendingQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data() as Order, orderId: doc.id }));
      // Extra safety: sort by date locally too
      setPendingOrders(docs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'orders_pending'));

    // 2. One-time fetch for DELIVERED orders (Historical - No real-time needed)
    const fetchHistory = async () => {
      let historyQuery;
      if (isDoctor && !isAdmin) {
        historyQuery = query(
          ordersCol,
          where('status', '==', 'Entregado'),
          where('doctorId', '==', profile?.uid),
          orderBy('date', 'desc'),
          limit(20)
        );
      } else {
        historyQuery = query(
          ordersCol,
          where('status', '==', 'Entregado'),
          orderBy('date', 'desc'),
          limit(30)
        );
      }
      
      try {
        const snap = await getDocs(historyQuery);
        setDeliveredOrders(snap.docs.map(doc => ({ ...doc.data() as Order, orderId: doc.id })));
      } catch (err) {
        console.error("Error fetching order history:", err);
      }
    };

    fetchHistory();

    return () => unsubPending();
  }, [isDoctor, isAdmin, profile?.uid]);

  const deliverOrder = async (order: Order) => {
    setProcessingId(order.orderId);
    try {
      const batch = writeBatch(db);
      
      const orderRef = doc(db, 'orders', order.orderId);
      batch.update(orderRef, { 
        status: 'Entregado',
        deliveredAt: new Date().toISOString()
      });

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

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-center gap-3 mb-8 ml-2">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pedidos Pendientes</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cola de Farmacia</p>
          </div>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="rounded-[3rem] border-2 border-dashed border-slate-200 p-20 text-center bg-slate-50">
            <ShoppingBag className="mx-auto h-12 w-12 text-slate-200 mb-4" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sin pedidos pendientes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pendingOrders.map((order, index) => (
              <div
                key={order.orderId}
                className="group relative bg-white border border-slate-200 p-8 rounded-[2.5rem] hover:border-amber-300 hover:shadow-2xl hover:shadow-amber-100 transition-all space-y-6 overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-slate-900 text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-2xl">
                  Turno #{index + 1}
                </div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-[1.2rem] flex items-center justify-center text-blue-600">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 line-clamp-1">{order.patientName || 'Paciente Anónimo'}</h3>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DNI {order.patientDni || '---'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-300">{format(new Date(order.date), 'HH:mm')}</span>
                    <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase mt-1">Ref: {order.orderId.slice(-6)}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="h-3 w-3 text-slate-400" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Médico: {order.doctorName}</p>
                  </div>
                  
                  <div className="space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl group-hover:bg-amber-50/50 transition-colors">
                        <span className="text-xs font-bold text-slate-700">{item.drugName}</span>
                        <span className="text-[10px] font-black bg-white px-2 py-1 border border-slate-100 rounded-lg shadow-sm group-hover:border-amber-200">
                          x{item.quantity}
                        </span>
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
                          TERMINAR Y ENTREGAR PEDIDO
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
