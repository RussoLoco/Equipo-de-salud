export type UserRole = 'doctor' | 'pharmacy' | 'admin' | 'admission' | 'nurse' | 'nutritionist';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  isPending?: boolean;
}

export interface Medicine {
  drugId: string;       // Número o ID
  drug: string;         // Droga
  brandName: string;    // Nombre comercial
  presentation: string; // Presentación
  therapeuticAction?: string; // Acción terapéutica
  dosage?: string;      // Dosis
  stock: string;        // Cantidad (puede ser código como 13x14C)
  expirationDate?: string; // Vencimiento
  laboratory: string;   // Laboratorio
  location: string;     // Caja
  category: 'Niño' | 'Adulto'; // Tipo
  uploadId?: string;
}

export interface Patient {
  dni: string;
  name: string;
  id: string;
  createdAt: string;
  age?: string;
  location?: string;
  phone?: string;
  category?: 'Adulto' | 'Niño';
  clinicalHistory?: string; // Nuevo: Historia clínica permanente
}

export interface Vitals {
  date: string;
  weight: string;
  height: string;
  temperature: string;
  bloodPressure: string;
  recordedBy: string; // Admisión UID
}

export interface MedicalEvolution {
  date: string;
  antecedents: string;
  notes: string;
  doctorName: string;
  doctorId: string;
}

export interface PatientVisit {
  id: string;
  patientId: string;
  patientName: string;
  patientDni: string;
  age?: string;
  location?: string;
  date: string;
  status: 'espera' | 'atendiendo' | 'atendido';
  vitals: Vitals;
  evolution?: MedicalEvolution;
  orderIds?: string[]; // IDs de pedidos vinculados
  attendingDoctorId?: string;
  attendingDoctorName?: string;
}

export interface UploadRecord {
  id: string;
  filename: string;
  timestamp: string;
  itemCount: number;
}

export interface OrderItem {
  drugId: string;
  drugName: string;
  quantity: string;
}

export interface Order {
  orderId: string;
  date: string;
  doctorId: string;
  doctorName: string;
  patientId?: string;   // Nuevo: ID del paciente
  patientName?: string; // Nuevo: Nombre del paciente
  patientDni?: string;  // Nuevo: DNI del paciente
  items: OrderItem[];
  status: 'Pendiente' | 'Entregado';
  location: string;
}
