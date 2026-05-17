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
import ConnectedUsers from './components/ConnectedUsers';
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
    { id: 'orders', label: activeRole === 'pharmacy' ? 'Cola de Dispensación' : 'Mis Pedidos', roles: ['admin', 'pharmacy', 'doctor'], type: 'operational', icon: Pill }
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showVersesOverlay, setShowVersesOverlay] = useState(false);

  if (!profile) return null;

  // If user is pending, show access restricted message
  if (profile.isPending && profile.role === 'PENDIENTE' || profile.role === 'receso' || activeRole === 'receso') {
    const isReceso = profile.role === 'receso' || activeRole === 'receso';
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className={cn("w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 border shadow-xl", isReceso ? "bg-blue-100 text-blue-600 border-blue-200 shadow-blue-100" : "bg-amber-100 text-amber-600 border-amber-200 shadow-amber-100")}>
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          {isReceso ? 'Receso Temporal' : 'Acceso Restringido'}
        </h1>
        <p className="text-slate-500 font-medium max-w-sm mb-8 leading-relaxed">
          {isReceso 
            ? 'Muchas gracias Por Estar en el Equipo de Salud Temporalmente estas en un receso y cuando sea el momento se te asignara tu respectivo rol, Ten paciencia.'
            : 'Tu solicitud de rol ha sido enviada al Administrador. Serás notificado cuando tu cuenta sea activada.'}
        </p>
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
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hidden lg:block"
          >
            <LayoutDashboard className="h-5 w-5" />
          </button>
          <button className="flex items-center gap-2 group cursor-pointer text-left" onClick={() => setShowMapModal(true)}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <div className="absolute w-4 h-1 bg-white rounded-full"></div>
                <div className="absolute h-4 w-1 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none uppercase">Equipo De <span className="text-blue-600">Salud</span></h1>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 capitalize tracking-widest mt-0.5">Fundación Valores Para Mi Ciudad</p>
            </div>
          </button>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-end hidden xs:flex">
             <p className="text-[10px] font-black text-slate-800 tracking-[0.1em] uppercase leading-none mb-1">Unidad de Salud</p>
             <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Servidor Activo</span>
             </div>
          </div>

          <ConnectedUsers />

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
          "fixed inset-y-0 left-0 bg-white border-r border-slate-200 py-8 flex flex-col gap-10 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out z-[70] lg:relative lg:translate-x-0 lg:z-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          isSidebarCollapsed ? "w-80 px-8 lg:w-[5.5rem] lg:px-4 lg:items-center" : "w-80 px-8"
        )}>
          {/* Status Check */}
          <div className={cn("bg-slate-900 rounded-3xl p-5 shadow-xl shadow-slate-200 hidden lg:block transition-all w-full", isSidebarCollapsed && "lg:p-3 lg:rounded-2xl")}>
             <div className={cn("flex items-center", isSidebarCollapsed ? "lg:justify-center mb-0" : "justify-between mb-4")}>
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]"></div>
                </div>
                <span className={cn("text-[8px] font-black text-blue-400 uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/10", isSidebarCollapsed && "lg:hidden")}>Online</span>
             </div>
             <div className={cn(isSidebarCollapsed && "lg:hidden")}>
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
          </div>

          <nav className="space-y-1 w-full">
            <p className={cn("px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4 text-center lg:text-left", isSidebarCollapsed && "lg:hidden")}>Menú Principal</p>
            
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
                        "flex items-center w-full rounded-2xl font-bold transition-all text-sm group relative",
                        isSidebarCollapsed ? "lg:p-3 lg:justify-center p-4 gap-4" : "p-4 gap-4",
                        activeTab === item.id 
                          ? "bg-slate-100 text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:bg-slate-50"
                      )}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 transition-colors shrink-0",
                        activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                      )} />
                      <span className={cn(isSidebarCollapsed && "lg:hidden")}>{item.label}</span>
                    </button>
                  ))}
                </div>

                {/* Collapsible Operational Items */}
                <div className="space-y-1">
                  <button 
                    onClick={() => setIsOperationalOpen(!isOperationalOpen)}
                    className={cn(
                      "flex items-center w-full rounded-2xl font-bold text-sm text-slate-400 hover:bg-slate-50 transition-all uppercase tracking-widest text-[10px]",
                      isSidebarCollapsed ? "lg:p-3 lg:justify-center p-4 justify-between" : "p-4 justify-between"
                    )}
                    title={isSidebarCollapsed ? "Vistas Operativas" : undefined}
                  >
                    <span className={cn(isSidebarCollapsed && "lg:hidden")}>Vistas Operativas</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform shrink-0", isOperationalOpen && "rotate-180", isSidebarCollapsed && "lg:hidden")} />
                    {isSidebarCollapsed && <LayoutDashboard className="h-4 w-4 hidden lg:block shrink-0" />}
                  </button>
                  
                  {isOperationalOpen && (
                    <div className={cn("space-y-1 border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200", isSidebarCollapsed ? "lg:border-none lg:ml-0 ml-4 border-l" : "ml-4 border-l")}>
                      {NAV_ITEMS.filter(item => (item.roles as readonly string[]).includes('admin') && item.type === 'operational').map(item => (
                        <button 
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                          }}
                          className={cn(
                            "flex items-center w-full rounded-xl font-bold transition-all text-xs group relative",
                            isSidebarCollapsed ? "lg:p-3 lg:justify-center p-3 gap-4" : "p-3 gap-4",
                            activeTab === item.id 
                              ? "text-blue-600 bg-blue-50" 
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                          title={isSidebarCollapsed ? item.label : undefined}
                        >
                          <item.icon className={cn(
                            "h-4 w-4 transition-colors shrink-0",
                            activeTab === item.id ? "text-blue-600" : "text-slate-300"
                          )} />
                          <span className={cn(isSidebarCollapsed && "lg:hidden")}>{item.label}</span>
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
                    "flex items-center w-full rounded-2xl font-bold transition-all text-sm group relative",
                    isSidebarCollapsed ? "lg:p-3 lg:justify-center p-4 gap-4" : "p-4 gap-4",
                    activeTab === item.id 
                      ? "bg-slate-100 text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <item.icon className={cn(
                    "h-5 w-5 transition-colors shrink-0",
                    activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                  )} />
                  <span className={cn(isSidebarCollapsed && "lg:hidden")}>{item.label}</span>
                </button>
              ))
            )}
          </nav>

          <div className="mt-auto space-y-4 w-full">
            <div 
              className={cn("bg-blue-600 rounded-3xl text-white overflow-hidden relative shadow-xl shadow-blue-100 transition-all cursor-pointer", isSidebarCollapsed ? "lg:p-3 lg:rounded-2xl lg:flex lg:justify-center lg:items-center p-6" : "p-6")}
              onClick={() => isSidebarCollapsed && setShowSupportModal(true)}
              title={isSidebarCollapsed ? "Ayuda & Soporte" : undefined}
            >
               <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
               <div className={cn(isSidebarCollapsed && "lg:hidden")}>
                 <p className="text-[9px] font-black uppercase tracking-widest opacity-80 mb-3">Ayuda & Soporte</p>
                 <p className="text-xs font-bold leading-relaxed">¿Necesitas asistencia técnica con la plataforma?</p>
                 <button 
                  onClick={(e) => { e.stopPropagation(); setShowSupportModal(true); }}
                  className="mt-4 w-full py-2 bg-white text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors relative z-10"
                 >
                  Contactar IT
                 </button>
               </div>
               {isSidebarCollapsed && (
                 <MessageCircle className="h-6 w-6 text-white hidden lg:block shrink-0" />
               )}
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
              onClick={() => setShowUpcomingModal(true)}
              className={cn("border-t border-slate-100 flex items-center gap-3.5 group cursor-pointer hover:bg-slate-50 p-3 -mx-3 rounded-2xl transition-all duration-300 ease-out", isSidebarCollapsed ? "lg:justify-center lg:-mx-0 lg:p-2 lg:mt-2 lg:pt-2 mt-4 pt-4" : "mt-4 pt-4")}
              title={isSidebarCollapsed ? "Engineering by S&S" : undefined}
            >
              <div className="relative w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] flex items-center justify-center shrink-0 overflow-hidden group-hover:border-blue-200 group-hover:shadow-[0_4px_12px_-4px_rgba(59,130,246,0.2)] transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative flex flex-col items-center justify-center leading-none">
                  <span className="text-[11px] font-black text-slate-300 group-hover:text-blue-500 transition-colors duration-300 tracking-[-0.05em]">S&S</span>
                </div>
              </div>
              
              <div className={cn("flex flex-col flex-1", isSidebarCollapsed && "lg:hidden")}>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] leading-none mb-1.5 group-hover:text-blue-500 transition-colors duration-300">Engineering by</p>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-black text-slate-800 tracking-tight leading-none uppercase italic group-hover:text-slate-900 transition-colors duration-300">
                    S&S <span className="text-blue-600 font-black">Developments</span>
                  </p>
                  <svg className="w-3.5 h-3.5 text-blue-500 transform -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </motion.div>
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
                       activeTab === 'patients' ? 'Turnos y Datos Esenciales' :
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
                {activeTab === 'orders' && (activeRole === 'admin' || activeRole === 'pharmacy' || activeRole === 'doctor') && <OrdersList />}
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
                        
            <div className="flex items-center gap-10">
              <p className="hidden md:block text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] opacity-40">
                © {new Date().getFullYear()} Fundación Valores Para Mi Ciudad • Gestión Integral de Salud
              </p>
            </div>
            
            <button
              onClick={() => setShowVersesOverlay(true)}
              className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] relative overflow-hidden group px-4 py-2 rounded-xl transition-all hover:text-slate-800"
            >
              <span className="relative z-10 flex items-center gap-2">
                El Propósito
                <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
              </span>
              <div className="absolute inset-0 bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
            </button>
          </footer>
        </main>
      </div>

      <AnimatePresence>
        {showVersesOverlay && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-50 overflow-hidden font-sans">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-0 pointer-events-none"
            >
              {[
                { url: '/1.jpg', className: 'top-[-5%] md:top-[5%] left-[-10%] md:left-[5%] w-40 md:w-48 rotate-[-15deg] md:rotate-[-6deg]' },
                { url: '/2.jpg', className: 'hidden md:block top-[15%] left-[25%] lg:left-[22%] w-40 rotate-[4deg]' },
                { url: '/3.jpg', className: 'hidden md:block top-[8%] right-[10%] lg:right-[20%] w-48 md:w-56 rotate-[-3deg]' },
                { url: '/4.jpg', className: 'hidden lg:block bottom-[10%] left-[8%] w-60 rotate-[5deg]' },
                { url: '/5.jpg', className: 'hidden md:block bottom-[25%] left-[10%] lg:left-[28%] w-36 lg:w-44 rotate-[-8deg]' },
                { url: '/6.jpg', className: 'hidden xl:block top-[40%] left-[2%] w-44 rotate-[12deg]' },
                { url: '/7.jpg', className: 'hidden md:block top-[35%] right-[2%] lg:right-[5%] w-48 lg:w-52 rotate-[-5deg]' },
                { url: '/8.jpg', className: 'hidden md:block bottom-[15%] right-[15%] lg:right-[22%] w-44 md:w-48 rotate-[6deg]' },
                { url: '/9.jpg', className: 'bottom-[-10%] md:bottom-[5%] right-[-5%] md:right-[3%] w-48 md:w-40 rotate-[-15deg] md:rotate-[-10deg]' },
              ].map((img, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -30 }}
                  transition={{ duration: 0.8, delay: i * 0.1, type: "spring", bounce: 0.3 }}
                  className={`absolute p-2 bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 ${img.className}`}
                >
                  <img src={img.url} alt={`Imagen ${i + 1}`} className="rounded-xl w-full h-full object-cover aspect-[4/3] shadow-inner" />
                </motion.div>
              ))}
            </motion.div>

            <div className="absolute inset-0 z-0 bg-slate-100/40 backdrop-blur-[1px] pointer-events-none md:hidden transition-all"></div>

            <motion.div 
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="z-10 relative flex flex-col items-center w-full max-w-lg p-6"
            >
              <div className="w-full rounded-[2.5rem] bg-white/85 backdrop-blur-xl p-12 shadow-2xl shadow-slate-300/60 border border-white text-center">
                <div className="absolute top-0 right-0 p-6 z-20">
                  <button 
                    onClick={() => setShowVersesOverlay(false)}
                    className="p-3 bg-white/50 hover:bg-white text-slate-400 hover:text-slate-900 rounded-2xl transition-all shadow-sm"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <h2 className="text-sm font-black text-blue-600 tracking-[0.2em] uppercase mb-8">Mateo 25:34-40</h2>
                
                <div className="space-y-6 text-sm sm:text-base md:text-lg font-medium text-slate-700 leading-relaxed">
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    “Vengan ustedes, a quienes mi Padre ha bendecido; reciban su herencia, el reino preparado para ustedes desde la creación del mundo. Porque tuve hambre, y ustedes me dieron de comer; tuve sed, y me dieron de beber; fui forastero, y me dieron alojamiento; necesité ropa, y me vistieron; estuve enfermo, y me atendieron; estuve en la cárcel, y me visitaron.”
                  </motion.p>
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    Y le contestarán los justos: “Señor, ¿cuándo te vimos hambriento y te alimentamos, o sediento y te dimos de beber? ¿Cuándo te vimos como forastero y te dimos alojamiento, o necesitado de ropa y te vestimos? ¿Cuándo te vimos enfermo o en la cárcel y te visitamos?”
                  </motion.p>
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="font-bold text-slate-900"
                  >
                    El Rey les responderá: “Les aseguro que todo lo que hicieron por uno de mis hermanos, aun por el más pequeño, lo hicieron por mí.”
                  </motion.p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {showUpcomingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpcomingModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl overflow-hidden text-center"
            >
              <div className="absolute top-0 right-0 p-6">
                <button 
                  onClick={() => setShowUpcomingModal(false)}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="w-20 h-20 bg-blue-50/50 rounded-[2rem] flex items-center justify-center text-blue-500 mx-auto mb-8 relative">
                <div className="absolute inset-0 bg-blue-400 rounded-[2rem] blur-xl opacity-20"></div>
                <svg className="w-8 h-8 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>

              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mb-4">
                Próximamente
              </h2>
              
              <div className="h-1 w-12 bg-blue-600 mx-auto rounded-full mb-6" />

              <p className="text-slate-500 font-medium leading-relaxed mb-10">
                Muy pronto podrás conocer más sobre nuestro trabajo y soluciones tecnológicas.
              </p>

              <button 
                onClick={() => setShowUpcomingModal(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                    href="https://chat.whatsapp.com/KGoCfY3w8xYIc2w9WTE53C"
                    target="_blank"
                    rel="noopener noreferrer"
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

        {showMapModal && (
          <div className="fixed z-[100] inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMapModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-[3rem] p-4 sm:p-6 shadow-2xl overflow-hidden flex flex-col items-center"
            >
              <div className="absolute top-0 right-0 p-6 z-10">
                <button 
                  onClick={() => setShowMapModal(false)}
                  className="p-3 bg-white/80 backdrop-blur-md text-slate-800 hover:text-slate-900 hover:bg-white rounded-2xl shadow-sm border border-slate-200 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="w-full aspect-video relative rounded-[2rem] overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                <img 
                  src="/mapa.jpg?v=3" 
                  alt="Taruca Pampa 2026 - Equipo de Salud" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/1200x800/e2e8f0/64748b?text=Sube+la+imagen+en+la+carpeta+public+con+el+nombre+mapa.jpg';
                  }}
                />
              </div>
              <div className="mt-6 w-full flex items-center justify-between px-4">
                 <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Taruca Pampa 2026</h3>
                    <p className="text-sm font-bold text-slate-400">Equipo de Salud - Fundación Valores Para Mi Ciudad</p>
                 </div>
                 <button 
                    onClick={() => setShowMapModal(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cerrar
                  </button>
              </div>
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

