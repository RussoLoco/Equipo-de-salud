// App Entry Point - Fixed Hook Errors
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import Inventory from './components/Inventory';
import OrdersList from './components/OrdersList';
import AdminPanel from './components/AdminPanel';
import Patients from './components/Patients';
import MedicalConsultation from './components/MedicalConsultation';
import NutritionistConsultation from './components/NutritionistConsultation';
import SpecialistConsultation from './components/SpecialistConsultation';
import AdminHistory from './components/AdminHistory';
import { 
  Pill, 
  ShoppingBag, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  User, 
  ChevronDown,
  ShieldAlert,
  Stethoscope,
  Briefcase,
  Users,
  ClipboardList,
  History,
  Activity,
  MessageCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

function AppContent() {
  const { profile, activeRole, isSuperAdmin, toggleAdminView, signOut, openProfileEdit } = useAuth();
  
  // Navigation Configuration - Icons and Labels
  const NAV_ITEMS = [
    { id: 'history', label: 'Historial Admin', roles: ['admin'], type: 'core', icon: History },
    { id: 'admin', label: 'Panel de Control', roles: ['admin'], type: 'core', icon: Settings },
    { id: 'patients', label: activeRole === 'nurse' ? 'Biometría' : activeRole === 'nutritionist' ? 'Control Nutricional' : 'Admisión Pacientes', roles: ['admission', 'nurse', 'nutritionist', 'admin'], type: 'operational', icon: activeRole === 'nurse' ? ClipboardList : Users },
    { id: 'consultation', label: 'Consulta Médica', roles: ['doctor', 'admin'], type: 'operational', icon: Stethoscope },
    { id: 'specialist', label: 'Especialidades', roles: ['ecografista', 'psiquiatra', 'odontologo'], type: 'operational', icon: Activity },
    { id: 'inventory', label: 'Existencias', roles: ['pharmacy', 'admin'], type: 'operational', icon: ShoppingBag },
    { id: 'orders', label: activeRole === 'pharmacy' ? 'Cola de Dispensación' : 'Mis Pedidos', roles: ['pharmacy', 'admin'], type: 'operational', icon: Pill }
  ] as const;

  type TabId = typeof NAV_ITEMS[number]['id'];
  const [activeTab, setActiveTab] = useState<TabId>('inventory');

  // Initial tab and sync logic simplified
  useEffect(() => {
    const roleDefaults: Record<string, TabId> = {
      admission: 'patients',
      nurse: 'patients',
      nutritionist: 'patients',
      doctor: 'consultation',
      pharmacy: 'inventory',
      ecografista: 'specialist',
      psiquiatra: 'specialist',
      odontologo: 'specialist',
      admin: 'admin'
    };

    if (activeRole && roleDefaults[activeRole]) {
      setActiveTab(roleDefaults[activeRole]);
    }
  }, [activeRole]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOperationalOpen, setIsOperationalOpen] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  if (!profile) return null;

  // If user is pending, show access restricted message
  if (profile.isPending && profile.role === 'PENDIENTE') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-[2rem] flex items-center justify-center text-amber-600 mb-6 border border-amber-200 shadow-xl shadow-amber-100">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Acceso Restringido</h1>
        <p className="text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">Tu solicitud de rol ha sido enviada al Administrador. Serás notificado cuando tu cuenta sea activada.</p>
        <button 
          onClick={signOut}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesion
        </button>
      </div>
    );
  }

  const isPharmacyView = activeRole === 'pharmacy';
  const isAdmin = profile.role === 'admin' || isSuperAdmin;
  const isAdmission = activeRole === 'admission';
  const isNurse = activeRole === 'nurse';
  const isDoctor = activeRole === 'doctor';
  const isNutritionist = activeRole === 'nutritionist';
  const isSpecialist = activeRole === 'ecografista' || activeRole === 'psiquiatra' || activeRole === 'odontologo';
  
  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 lg:hidden"
          >
            <LayoutDashboard className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setActiveTab('inventory')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <div className="absolute w-4 h-1 bg-white rounded-full"></div>
                <div className="absolute h-4 w-1 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none uppercase">Equipo De <span className="text-blue-600">Salud</span></h1>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 capitalize tracking-widest mt-0.5">Fundación Valores</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-end hidden xs:flex">
             <p className="text-[10px] font-black text-slate-800 tracking-[0.1em] uppercase leading-none mb-1">Unidad de Salud</p>
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Servidor Activo</span>
             </div>
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={cn(
                "flex items-center gap-3 p-1.5 pr-4 rounded-2xl border transition-all shadow-sm active:scale-95",
                showProfileMenu ? "border-blue-200 bg-blue-50 ring-4 ring-blue-50" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
              )}
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 overflow-hidden">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-[10px] font-black text-slate-700 leading-tight uppercase">{profile.name} {profile.lastName}</p>
                <p className="text-[9px] font-bold text-blue-500 uppercase tracking-tighter">{activeRole}</p>
              </div>
              <ChevronDown className={cn("h-3 w-3 text-slate-400 transition-transform", showProfileMenu && "rotate-180")} />
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl border border-slate-200 p-3 z-20 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-4 mb-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Perfil de Usuario</p>
                    <p className="text-xs font-bold text-slate-800 truncate">{profile.name} {profile.lastName}</p>
                    <p className="text-xs text-slate-500">{profile.email}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{profile.phone || 'Sin teléfono'}</p>
                  </div>

                  {isSuperAdmin && (
                    <div className="mb-3 px-1">
                      <p className="px-3 py-1 text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-50/50 rounded-lg mb-2">Control Maestro Admin</p>
                      <div className="grid grid-cols-3 gap-1">
                        <button 
                          onClick={() => { toggleAdminView('admission'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'admission' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Users className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Admisión</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('nurse'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'nurse' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <ClipboardList className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Nurse</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('doctor'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'doctor' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Stethoscope className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Médico</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('pharmacy'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'pharmacy' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Briefcase className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Farmacia</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('nutritionist'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'nutritionist' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <History className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Nutrición</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('ecografista'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'ecografista' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Activity className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Eco</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('psiquiatra'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'psiquiatra' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Users className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Psiq</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('odontologo'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'odontologo' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Stethoscope className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Odonto</span>
                        </button>
                        <button 
                          onClick={() => { toggleAdminView('admin'); setShowProfileMenu(false); }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all",
                            activeRole === 'admin' ? "bg-white text-blue-600 shadow-sm border border-blue-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <ShieldAlert className="h-4 w-4" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Admin</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {profile.role === 'admin' && (
                    <button 
                      onClick={() => { setActiveTab('admin'); setShowProfileMenu(false); }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all mb-1 hover:bg-slate-50",
                        activeTab === 'admin' ? "text-blue-600 bg-blue-50/50 shadow-sm" : "text-slate-600"
                      )}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Panel Administrativo
                    </button>
                  )}

                  <button 
                    onClick={() => { openProfileEdit(); setShowProfileMenu(false); }}
                    className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all uppercase tracking-widest mb-1"
                  >
                    <User className="h-4 w-4" />
                    Editar Perfil
                  </button>

                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-red-500 hover:bg-red-50 transition-all uppercase tracking-widest mt-1 border border-transparent hover:border-red-100"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar Sesion
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden lg:flex-row">
        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Side Navigation */}
        <aside className={cn(
          "fixed inset-y-0 left-0 w-80 bg-white border-r border-slate-200 p-8 flex flex-col gap-10 overflow-y-auto transition-transform duration-300 ease-in-out z-[70] lg:relative lg:translate-x-0 lg:z-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Status Check */}
          <div className="bg-slate-900 rounded-3xl p-5 shadow-xl shadow-slate-200 hidden lg:block">
             <div className="flex items-center justify-between mb-4">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                </div>
                <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/10">Online</span>
             </div>
             <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1">Módulo Activo</p>
             <p className="text-xs font-bold text-slate-400 truncate">
               {activeRole === 'pharmacy' ? 'Dispensación Farmacéutica' : 
                activeRole === 'admin' ? 'Infraestructura Admin' : 
                activeRole === 'admission' ? 'Gestión de Pacientes' :
                activeRole === 'nurse' ? 'Antropometría y Enfermería' :
                activeRole === 'nutritionist' ? 'Evaluación Nutricional' :
                activeRole === 'ecografista' ? 'Gabinete de Ecografía' :
                activeRole === 'psiquiatra' ? 'Consultorio Psiquiatra' :
                activeRole === 'odontologo' ? 'Consultorio Odontológico' :
                'Atención Médica'}
             </p>
          </div>

          <nav className="space-y-1">
            <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">Menú Principal</p>
            
            {activeRole === 'admin' ? (
              <div className="space-y-4">
                {/* Core Items for Admin */}
                <div className="space-y-1">
                  {NAV_ITEMS.filter(item => (item.roles as readonly string[]).includes('admin') && item.type === 'core').map(item => (
                    <button 
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-4 w-full p-4 rounded-2xl font-bold transition-all text-sm group",
                        activeTab === item.id 
                          ? "bg-slate-100 text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 transition-colors",
                        activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                      )} />
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Collapsible Operational Items */}
                <div className="space-y-1">
                  <button 
                    onClick={() => setIsOperationalOpen(!isOperationalOpen)}
                    className="flex items-center justify-between w-full p-4 rounded-2xl font-bold text-sm text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest text-[10px]"
                  >
                    Vistas Operativas
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOperationalOpen && "rotate-180")} />
                  </button>
                  
                  {isOperationalOpen && (
                    <div className="space-y-1 ml-4 border-l border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200">
                      {NAV_ITEMS.filter(item => (item.roles as readonly string[]).includes('admin') && item.type === 'operational').map(item => (
                        <button 
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-4 w-full p-3 rounded-xl font-bold transition-all text-xs group",
                            activeTab === item.id 
                              ? "text-blue-600 bg-blue-50" 
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <item.icon className={cn(
                            "h-4 w-4 transition-colors",
                            activeTab === item.id ? "text-blue-600" : "text-slate-300"
                          )} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Non-Admin Menu */
              NAV_ITEMS.filter(item => (item.roles as readonly string[]).includes(activeRole || '')).map(item => (
                <button 
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-4 w-full p-4 rounded-2xl font-bold transition-all text-sm group",
                    activeTab === item.id 
                      ? "bg-slate-100 text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-colors",
                    activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                  )} />
                  {item.label}
                </button>
              ))
            )}
          </nav>

          <div className="mt-auto space-y-4">
            <div className="bg-blue-600 rounded-3xl p-6 text-white overflow-hidden relative shadow-xl shadow-blue-100">
               <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
               <p className="text-[9px] font-black uppercase tracking-widest opacity-80 mb-3">Ayuda & Soporte</p>
               <p className="text-xs font-bold leading-relaxed">¿Necesitas asistencia técnica con la plataforma?</p>
               <button 
                onClick={() => setShowSupportModal(true)}
                className="mt-4 w-full py-2 bg-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
               >
                Contactar IT
               </button>
            </div>
            
            <div className="pt-4 border-t border-slate-50 opacity-40">
              <p className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Versión Estable 2.4.0
              </p>
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 p-4 sm:p-10 overflow-y-auto">
            <div className="max-w-7xl mx-auto space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Profile Bar (Quick Action) */}
              {!isSpecialist && !isNutritionist && (
                <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-200 pb-8 sm:pb-10 gap-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {activeTab === 'inventory' ? 'Inventario Central' : 
                       activeTab === 'history' ? 'Consolidado Histórico' :
                       activeTab === 'orders' ? (isPharmacyView ? 'Cola de Dispensación' : 'Mis Prescripciones') : 
                       activeTab === 'patients' ? 'Historias Clínicas' :
                       activeTab === 'consultation' ? 'Atención Evolutiva' :
                       'Panel de Control Maestro'}
                    </h2>
                    <p className="text-slate-400 text-sm font-bold mt-2 uppercase tracking-widest">
                       {activeTab === 'inventory' ? 'Consulta de stock critico y regular' : 
                       activeTab === 'history' ? 'Control de recetas, pacientes y reportes de salida' :
                       activeTab === 'orders' ? 'Gestión de vales y entregas pendientes' : 
                       activeTab === 'patients' ? 'Registro y seguimiento de pacientes' :
                       activeTab === 'consultation' ? 'Registro de evolución médica y recetas' :
                       'Mantenimiento de infraestructura y usuarios'}
                    </p>
                  </div>
                </div>
              )}

              <div className="pb-20">
                {activeTab === 'inventory' && (activeRole === 'admin' || isPharmacyView) && <Inventory />}
                {activeTab === 'history' && activeRole === 'admin' && <AdminHistory />}
                {activeTab === 'orders' && (activeRole === 'admin' || isPharmacyView) && <OrdersList />}
                {activeTab === 'admin' && isAdmin && activeRole === 'admin' && <AdminPanel />}
                {activeTab === 'patients' && (isAdmission || isNurse || (activeRole === 'admin' && activeTab === 'patients')) && <Patients />}
                {activeTab === 'patients' && isNutritionist && <NutritionistConsultation />}
                {activeTab === 'consultation' && (isDoctor || activeRole === 'admin') && <MedicalConsultation />}
                {activeTab === 'specialist' && (isSpecialist || activeRole === 'admin') && <SpecialistConsultation forcedRole={activeRole} />}
              </div>
            </div>
          </div>

          {/* Bottom Status Bar */}
          <footer className="h-16 bg-white border-t border-slate-100 flex items-center justify-between px-10 shrink-0">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-3 h-3 bg-emerald-400 rounded-full blur-sm opacity-50 animate-pulse"></div>
                <div className="relative w-2 h-2 bg-emerald-500 rounded-full border border-white shadow-sm"></div>
              </div>
              <div className="flex flex-col">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] leading-none mb-1.5">Engineering by</p>
                <p className="text-[13px] font-black text-slate-900 tracking-tight leading-none uppercase italic">
                  S&S <span className="text-blue-600 font-black">Developments</span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-10">
              <p className="hidden md:block text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] opacity-40">
                © {new Date().getFullYear()} Fundación Valores • Gestión Integral de Salud
              </p>
            </div>
          </footer>
        </main>
      </div>

      <AnimatePresence>
        {showSupportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupportModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <button 
                  onClick={() => setShowSupportModal(false)}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col items-center text-center space-y-8">
                <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center text-blue-600 shadow-inner">
                  <MessageCircle className="h-10 w-10" />
                </div>

                <div className="space-y-4">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                    Disculpa los Inconvenientes,<br />
                    Estamos para ayudarte
                  </h3>
                  <div className="h-1 w-12 bg-blue-600 mx-auto rounded-full" />
                  <p className="text-slate-500 font-medium leading-relaxed italic text-sm px-4">
                    "Podes contactarnos por el WhatsApp del Equipo de Salud"
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 w-full">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Mesa de Ayuda Directa</p>
                  <div className="flex flex-col gap-1 items-center">
                    <p className="text-sm font-black text-slate-800 tracking-tight">Atte David Soria</p>
                    <p className="text-sm font-black text-slate-800 tracking-tight">& Agustin Soria</p>
                  </div>
                </div>

                <div className="pt-8 w-full flex flex-col gap-3">
                  <a 
                    href="https://wa.me/5491112223334" // Placeholder for their WhatsApp
                    target="_blank"
                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 group"
                  >
                    <MessageCircle className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    Iniciar Chat WhatsApp
                  </a>
                  <button 
                    onClick={() => setShowSupportModal(false)}
                    className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                  >
                    Cerrar Ventana
                  </button>
                </div>
              </div>

              {/* Aesthetic background elements */}
              <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50" />
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-50" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

