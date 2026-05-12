import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, setDoc, serverTimestamp, writeBatch, doc, orderBy, where, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medicine, Order, OrderItem, Patient } from '../types';
import { useAuth } from './AuthProvider';
import { 
  Search, 
  Plus, 
  Trash2, 
  Edit2, 
  Package, 
  AlertTriangle, 
  Filter, 
  ChevronRight,
  ShoppingCart,
  Check,
  X,
  Loader2,
  Calendar,
  Layers,
  ArrowUpDown,
  User
} from 'lucide-react';
import { cn } from '../lib/utils';

interface InventoryProps {
  externalCart?: OrderItem[];
  setExternalCart?: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  isSelectionMode?: boolean;
}

export default function Inventory({ externalCart, setExternalCart, isSelectionMode }: InventoryProps) {
  const { profile, activeRole } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Niño' | 'Adulto'>('All');
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderQuantity, setOrderQuantity] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Local state for when no external cart is provided
  const [localCart, setLocalCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Unified cart access
  const cart = externalCart || localCart;
  const setCart = setExternalCart || setLocalCart;

  // Stock Subdivision Helpers
  const [stockBoxes, setStockBoxes] = useState('');
  const [stockBlisters, setStockBlisters] = useState('');
  const [stockUnits, setStockUnits] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [medToDelete, setMedToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (editingMed) {
      const s = editingMed.stock || '';
      // Matches patterns like "7C", "7 Cajas", "3B", "3 Blisters", "10U", "10 Unidades"
      const bMatch = s.match(/(\d+)\s*C/i);
      const blMatch = s.match(/(\d+)\s*B/i);
      const uMatch = s.match(/(\d+)\s*U/i);
      
      setStockBoxes(bMatch ? bMatch[1] : '');
      setStockBlisters(blMatch ? blMatch[1] : '');
      setStockUnits(uMatch ? uMatch[1] : '');
    }
  }, [editingMed]);

  useEffect(() => {
    // Cost Optimization: Limit initial fetch and order by drug name
    const qInv = query(collection(db, 'inventory'), orderBy('drug', 'asc'), limit(300));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      setMedicines(snapshot.docs.map(doc => doc.data() as Medicine));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'inventory');
    });

    return () => unsubInv();
  }, []);

  useEffect(() => {
    if (isCartOpen) {
      const q = query(collection(db, 'patients'), orderBy('name'), limit(100));
      const unsub = onSnapshot(q, (snap) => {
        setPatients(snap.docs.map(d => d.data() as Patient));
      });
      return () => unsub();
    }
  }, [isCartOpen]);

  const handleUpdateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMed) return;
    setIsSubmitting(true);
    try {
      const drugId = isAddingNew ? editingMed.drugId.trim() : editingMed.drugId;
      
      if (isAddingNew && !drugId) {
        throw new Error('ID de Medicamento es requerido');
      }

      const medicineRef = doc(db, 'inventory', drugId);

      // Compose stock string if any helper is filled
      let composedStock = editingMed.stock;
      if (stockBoxes || stockBlisters || stockUnits) {
        const parts = [];
        if (stockBoxes) parts.push(`${stockBoxes}C`);
        if (stockBlisters) parts.push(`${stockBlisters}B`);
        if (stockUnits) parts.push(`${stockUnits}U`);
        composedStock = parts.join(' + ');
      }

      // Clean up optional fields
      const updateData = {
        drugId: drugId,
        drug: editingMed.drug || '',
        brandName: editingMed.brandName || '',
        stock: composedStock || '0',
        expirationDate: editingMed.expirationDate || '',
        location: editingMed.location || '',
        category: editingMed.category || 'Adulto',
        presentation: editingMed.presentation || '',
        therapeuticAction: editingMed.therapeuticAction || '',
        dosage: editingMed.dosage || '',
        laboratory: editingMed.laboratory || ''
      };
      
      const batch = writeBatch(db);
      if (isAddingNew) {
        batch.set(medicineRef, updateData);
      } else {
        batch.update(medicineRef, updateData);
      }
      
      await batch.commit();
      setIsEditModalOpen(false);
      setEditingMed(null);
      setIsAddingNew(false);
    } catch (err) {
      handleFirestoreError(err, isAddingNew ? OperationType.CREATE : OperationType.UPDATE, 'inventory');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMedicines = medicines.filter(m => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (m.drug?.toLowerCase().includes(searchLower)) || 
                         (m.brandName?.toLowerCase().includes(searchLower)) ||
                         m.drugId.toLowerCase().includes(searchLower) ||
                         (m.therapeuticAction?.toLowerCase().includes(searchLower)) ||
                         m.laboratory.toLowerCase().includes(searchLower);
    const matchesCategory = categoryFilter === 'All' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (med: Medicine) => {
    setCart(current => {
      const existing = current.find(item => item.drugId === med.drugId);
      if (existing) {
        return current.map(item => 
          item.drugId === med.drugId 
            ? { ...item, quantity: String(parseInt(String(item.quantity || 0)) + 1) } 
            : item
        );
      }
      return [...current, {
        drugId: med.drugId,
        drugName: med.brandName ? `${med.drug} (${med.brandName})` : med.drug,
        quantity: '1'
      }];
    });
  };

  const removeFromCart = (drugId: string) => {
    setCart(current => current.filter(item => item.drugId !== drugId));
  };

  const updateCartQuantity = (drugId: string, delta: number) => {
    setCart(current => current.map(item => {
      if (item.drugId === drugId) {
        const qtyNum = parseInt(String(item.quantity).replace(/[^0-9]/g, '')) || 0;
        const next = Math.max(1, qtyNum + delta);
        return { ...item, quantity: String(next) };
      }
      return item;
    }));
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !profile) return;
    
    if (!selectedPatientId) {
      alert('Por favor selecciona un paciente para este pedido.');
      return;
    }

    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient) return;

    setIsSubmitting(true);
    try {
      const orderRef = doc(collection(db, 'orders'));
      const orderData: Order = {
        orderId: orderRef.id,
        date: new Date().toISOString(),
        doctorId: profile.uid,
        doctorName: profile.name,
        patientId: patient.id,
        patientName: patient.name,
        patientDni: patient.dni,
        status: 'Pendiente',
        location: profile.role === 'doctor' ? 'Consultorio' : 'Farmacia',
        items: cart
      };

      await setDoc(orderRef, orderData);
      setCart([]);
      setIsCartOpen(false);
      setSelectedPatientId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMedicine = async () => {
    if (!medToDelete) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'inventory', medToDelete));
      await batch.commit();
      setIsDeleteModalOpen(false);
      setMedToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'inventory');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSKU = filteredMedicines.length;
  // Stock status logic for strings
  const lowStockCount = filteredMedicines.filter(m => {
    const s = String(m.stock || '');
    return s !== '0' && s !== '' && (parseInt(s) <= 10 || s.length < 5); // Rough heuristic for codes
  }).length;
  const outOfStockCount = filteredMedicines.filter(m => {
    const s = String(m.stock || '');
    return s === '0' || s === '';
  }).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Actualizando existencias...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Search and Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 flex gap-4 w-full">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar por droga, marca, ID o laboratorio..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {(activeRole === 'pharmacy' || activeRole === 'admin') && (
            <button 
              onClick={() => {
                setEditingMed({
                  drugId: '',
                  drug: '',
                  brandName: '',
                  stock: '',
                  category: 'Adulto',
                  laboratory: '',
                  expirationDate: '',
                  location: '',
                  dosage: '',
                  presentation: '',
                  therapeuticAction: ''
                });
                setIsAddingNew(true);
                setIsEditModalOpen(true);
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Carga de Stock
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setCategoryFilter('All')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              categoryFilter === 'All' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Todos
          </button>
          <button 
            onClick={() => setCategoryFilter('Adulto')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              categoryFilter === 'Adulto' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Adulto
          </button>
          <button 
            onClick={() => setCategoryFilter('Niño')}
            className={cn(
              "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              categoryFilter === 'Niño' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Pediátrico
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total SKU</p>
          <p className="text-3xl font-black text-slate-900">{totalSKU}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Bajo</p>
          <p className="text-3xl font-black text-orange-500">{lowStockCount}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agotados</p>
          <p className="text-3xl font-black text-red-500">{outOfStockCount}</p>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Medicamento / Acción</th>
                <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-24">Stock</th>
                <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">Vencimiento</th>
                <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-24">Tipo</th>
                <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">Ubicación</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMedicines.map((med) => (
                <tr key={med.drugId} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                        <Package className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {med.drug} 
                          {med.brandName && <span className="text-blue-500 ml-1">({med.brandName})</span>}
                          {med.dosage && <span className="text-slate-400 font-medium ml-1">[{med.dosage}]</span>}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          #{med.drugId} • {med.therapeuticAction || 'Sin Acción'} • {med.presentation}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <div className={cn(
                      "inline-flex flex-col items-center justify-center px-4 py-1.5 rounded-xl border",
                      (med.stock === '0' || !med.stock) ? "bg-red-50 text-red-600 border-red-100" : 
                      "bg-blue-50 text-blue-600 border-blue-100"
                    )}>
                      <span className="text-xs font-black">{med.stock || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold tracking-tight">{med.expirationDate || '---'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-1 rounded-lg uppercase tracking-widest",
                      med.category === 'Niño' ? "bg-pink-100 text-pink-600" : "bg-slate-100 text-slate-600"
                    )}>
                      {med.category === 'Niño' ? 'Pediátrico' : 'Adulto'}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Layers className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold tracking-tight italic">{med.location || 'Vacío'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1 italic">Añadir a</span>
                        <button 
                          onClick={() => addToCart(med)}
                          disabled={med.stock === '0' || !med.stock}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-2",
                            cart.find(c => c.drugId === med.drugId) 
                              ? "bg-blue-600 text-white hover:bg-blue-700" 
                              : "bg-slate-900 text-white hover:bg-blue-600"
                          )}
                        >
                          {cart.find(c => c.drugId === med.drugId) ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {cart.find(c => c.drugId === med.drugId) ? 'Agregado' : 'Pedido'}
                        </button>
                      </div>
                      {(activeRole === 'pharmacy' || activeRole === 'admin' || activeRole === 'doctor') && (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => { setEditingMed(med); setIsEditModalOpen(true); }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Editar Medicamento"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => { setMedToDelete(med.drugId); setIsDeleteModalOpen(true); }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar Medicamento del Stock"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Inventory List */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredMedicines.map((med) => (
            <div key={med.drugId} className="p-4 sm:p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">
                      {med.drug} 
                      {med.brandName && <span className="text-blue-500 ml-1 text-[10px]">({med.brandName})</span>}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter line-clamp-1">
                      #{med.drugId} • {med.dosage}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-black border",
                  (med.stock === '0' || !med.stock) ? "bg-red-50 text-red-600 border-red-100" : "bg-blue-50 text-blue-600 border-blue-100"
                )}>
                  Stock: {med.stock || '-'}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="space-y-1">
                   <p className="text-[9px] font-bold text-slate-400 uppercase">Exp: {med.expirationDate || '---'}</p>
                   <p className="text-[9px] font-bold text-slate-400 uppercase">Loc: {med.location || 'N/A'}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => addToCart(med)}
                    disabled={med.stock === '0' || !med.stock}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm",
                      cart.find(c => c.drugId === med.drugId) 
                        ? "bg-blue-600 text-white" 
                        : "bg-slate-900 text-white"
                    )}
                  >
                    {cart.find(c => c.drugId === med.drugId) ? 'Agregado' : '+ Pedido'}
                  </button>
                  <button 
                    onClick={() => { setEditingMed(med); setIsEditModalOpen(true); }}
                    className="p-2 text-slate-400 bg-slate-50 border border-slate-100 rounded-xl"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredMedicines.length === 0 && (
          <div className="p-20 text-center">
            <Package className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No se encontraron medicamentos</p>
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && !isSelectionMode && (
        <button 
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-8 right-8 z-50 bg-blue-600 text-white p-4 rounded-3xl shadow-2xl shadow-blue-200 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 group"
        >
          <div className="relative">
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -top-2 -right-2 bg-red-500 text-[8px] font-black w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
              {cart.length}
            </span>
          </div>
          <div className="pr-2 flex flex-col items-start leading-tight">
            <span className="text-[10px] font-black uppercase tracking-widest">Pedido en Curso</span>
            <span className="text-xs font-bold text-blue-50 hover:text-white transition-colors">Revisar Prescripción</span>
          </div>
          <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <ChevronRight className="h-4 w-4" />
          </div>
        </button>
      )}

      {/* Cart Modal */}
      {isCartOpen && !isSelectionMode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Prescripción Múltiple</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Revisa y ajusta las cantidades</p>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Patient Selection in Cart */}
              <div className="bg-slate-900 p-6 rounded-[2rem] mb-4 space-y-4 shadow-xl">
                 <div className="flex items-center gap-3 mb-2">
                    <User className="h-4 w-4 text-blue-400" />
                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Asignar Paciente al Pedido</h4>
                 </div>
                 
                 <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-focus-within:text-blue-400" />
                    <input 
                      type="text"
                      placeholder="Buscar paciente por nombre o DNI..."
                      className="w-full bg-white/5 border-none rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-500/50 transition-all"
                      value={patientSearchTerm}
                      onChange={(e) => setPatientSearchTerm(e.target.value)}
                    />
                 </div>

                 <select 
                    className="w-full bg-white/10 border-none rounded-xl py-3 px-4 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                 >
                    <option value="" className="text-slate-900">-- Seleccionar Paciente --</option>
                    {patients
                      .filter(p => p.name.toLowerCase().includes(patientSearchTerm.toLowerCase()) || p.dni.includes(patientSearchTerm))
                      .map(p => (
                        <option key={p.id} value={p.id} className="text-slate-900 italic font-bold">
                          {p.name} (DNI: {p.dni})
                        </option>
                      ))
                    }
                 </select>
                 
                 {selectedPatientId && (
                   <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 animate-in fade-in slide-in-from-top-2">
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Paciente Seleccionado</p>
                        <p className="text-[11px] font-bold text-white">{patients.find(p => p.id === selectedPatientId)?.name}</p>
                      </div>
                   </div>
                 )}
              </div>

              {cart.map((item) => (
                <div key={item.drugId} className="bg-white border border-slate-100 rounded-3xl p-4 flex items-center justify-between group hover:border-blue-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 line-clamp-1">{item.drugName}</p>
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">#{item.drugId}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100">
                      <button 
                        onClick={() => {
                          const qty = parseInt(String(item.quantity)) || 0;
                          if (qty <= 1) {
                            removeFromCart(item.drugId);
                          } else {
                            updateCartQuantity(item.drugId, -1);
                          }
                        }}
                        className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-red-500 shadow-sm shadow-transparent hover:shadow-slate-200"
                        title={parseInt(String(item.quantity)) <= 1 ? "Quitar de la lista" : "Reducir cantidad"}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <span className="w-10 text-center text-xs font-black text-slate-700">{item.quantity}</span>
                      <button 
                        onClick={() => updateCartQuantity(item.drugId, 1)}
                        className="p-2 hover:bg-white rounded-lg transition-all text-slate-400 hover:text-blue-600 shadow-sm shadow-transparent hover:shadow-slate-200"
                        title="Aumentar cantidad"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.drugId)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={handlePlaceOrder}
                disabled={isSubmitting || cart.length === 0}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                {isSubmitting ? 'Procesando...' : 'Confirmar Prescripción Completa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Medicine Modal */}
      {isEditModalOpen && editingMed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <form onSubmit={handleUpdateMedicine} className="p-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    {isAddingNew ? 'Cargar Nuevo Stock' : 'Editar Medicamento'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {isAddingNew ? 'Ingresa los detalles del nuevo lote' : `ID: #${editingMed.drugId}`}
                  </p>
                </div>
                <button type="button" onClick={() => { setIsEditModalOpen(false); setIsAddingNew(false); }} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div className="space-y-4">
                  {isAddingNew && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">ID Medicamento (Único)</label>
                      <input 
                        type="text" 
                        placeholder="Ej: 13BX88"
                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                        value={editingMed.drugId}
                        onChange={e => setEditingMed({...editingMed, drugId: e.target.value})}
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Droga</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.drug}
                      onChange={e => setEditingMed({...editingMed, drug: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Stock / Cantidad (Manual)</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.stock}
                      onChange={e => setEditingMed({...editingMed, stock: e.target.value})}
                      placeholder="Ej: 13x14C o 100"
                      required
                    />
                  </div>

                  <div className="bg-slate-50 p-4 rounded-3xl border border-dashed border-slate-200">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Constructor de Stock (Opcional)</p>
                    <div className="grid grid-cols-3 gap-2">
                       <div>
                         <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Cajas</label>
                         <input 
                           type="text" 
                           placeholder="C"
                           className="w-full px-2 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                           value={stockBoxes}
                           onChange={e => setStockBoxes(e.target.value)}
                         />
                       </div>
                       <div>
                         <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Blisters</label>
                         <input 
                           type="text" 
                           placeholder="B"
                           className="w-full px-2 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                           value={stockBlisters}
                           onChange={e => setStockBlisters(e.target.value)}
                         />
                       </div>
                       <div>
                         <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Unid.</label>
                         <input 
                           type="text" 
                           placeholder="U"
                           className="w-full px-2 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                           value={stockUnits}
                           onChange={e => setStockUnits(e.target.value)}
                         />
                       </div>
                    </div>
                    <p className="text-[8px] text-slate-400 mt-2 italic">* Si completas estos campos, sobrescribirán el stock manual al guardar.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Vencimiento</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.expirationDate || ''}
                      onChange={e => setEditingMed({...editingMed, expirationDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Categoría</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.category}
                      onChange={e => setEditingMed({...editingMed, category: e.target.value as any})}
                    >
                      <option value="Adulto">Adulto</option>
                      <option value="Niño">Pediátrico</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Nombre Comercial</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.brandName || ''}
                      onChange={e => setEditingMed({...editingMed, brandName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Ubicación / Caja</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.location || ''}
                      onChange={e => setEditingMed({...editingMed, location: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Laboratorio</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.laboratory || ''}
                      onChange={e => setEditingMed({...editingMed, laboratory: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Presentación</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                      value={editingMed.presentation || ''}
                      onChange={e => setEditingMed({...editingMed, presentation: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setIsAddingNew(false); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] py-4 bg-blue-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {isSubmitting ? 'Guardando...' : (isAddingNew ? 'Cargar Medicamento' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Modal */}
      {isOrderModalOpen && selectedMed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Nueva Prescripción</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                    {selectedMed.drug} {selectedMed.brandName ? `(${selectedMed.brandName})` : ''}
                  </p>
                </div>
                <button onClick={() => setIsOrderModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{selectedMed.drug} {selectedMed.dosage}</p>
                    {selectedMed.brandName && <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">{selectedMed.brandName}</p>}
                    <p className="text-[10px] font-bold text-slate-400">{selectedMed.presentation} • {selectedMed.laboratory}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Stock Disponible</p>
                    <p className="text-sm font-black text-slate-700">{selectedMed.stock}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Ubicación</p>
                    <p className="text-sm font-black text-slate-700">{selectedMed.location || '---'}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Acción Ter.</p>
                    <p className="text-[10px] font-bold text-slate-700 leading-tight">{selectedMed.therapeuticAction || 'General'}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Vencimiento</p>
                    <p className="text-[10px] font-bold text-slate-700">{selectedMed.expirationDate || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cantidad Necesaria</label>
                  <span className="text-xs font-bold text-slate-800">{orderQuantity}</span>
                </div>
                <input 
                  type="text" 
                  placeholder="Ej: 10 o 5x5"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button 
                onClick={handlePlaceOrder}
                disabled={isSubmitting || orderQuantity <= 0}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                {isSubmitting ? 'Procesando...' : 'Confirmar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="p-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-lg">
                  <Trash2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Eliminar Medicamento</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Acción Irreversible</p>
                </div>
              </div>
              
              <p className="text-sm text-slate-500 leading-relaxed mb-10 font-bold">
                ¿Estás seguro de que deseas eliminar este medicamento del stock permanente? Esta acción no se puede deshacer.
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => { setIsDeleteModalOpen(false); setMedToDelete(null); }}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteMedicine}
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-200 disabled:opacity-50"
                >
                  {isSubmitting ? 'Eliminando...' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
