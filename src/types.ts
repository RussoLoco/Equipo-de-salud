export type UserRole = 'doctor' | 'pharmacy' | 'admin' | 'admission' | 'nurse' | 'nutritionist' | 'ecografista' | 'psiquiatra' | 'odontologo' | 'receso';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  lastName?: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  isPending?: boolean;
  profileCompleted?: boolean;
  lastActiveAt?: string;
  status?: 'online' | 'offline';
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
  guardianName?: string;    // Nuevo: Nombre del responsable (Niño)
  guardianRelation?: 'Madre' | 'Padre' | 'Familiar'; // Nuevo: Parentesco
}

export interface Vitals {
  date: string;
  weight: string;
  height: string;
  temperature: string;
  bloodPressure: string;
  heartRate: string;
  o2Saturation: string;
  recordedBy: string; // Admisión UID
}

export interface MedicalEvolution {
  date: string;
  antecedents: string;
  notes: string;
  doctorName: string;
  doctorId: string;
  doctorPhoto?: string;
}

export interface PatientFile {
  id: string;
  patientId: string;
  fileName: string;
  fileType: string;
  fileUrl: string; // From Firebase Storage
  uploadedBy: string; // UID of uploader
  uploaderName: string;
  uploaderRole: string;
  uploadDate: string;
  size?: number;
}

export interface PatientVisit {
  id: string;
  patientId: string;
  patientName: string;
  patientDni: string;
  age?: string;
  location?: string;
  category?: 'Adulto' | 'Niño';
  date: string;
  status: 'checkin' | 'espera' | 'atendiendo' | 'atendiendo_nutri' | 'atendiendo_especialista' | 'atendido';
  serviceType?: 'pediatría' | 'clínico' | 'ecografía' | 'psiquiatría' | 'odontología' | 'nutrición';
  vitals: Vitals;
  evolution?: MedicalEvolution;
  orderIds?: string[]; // IDs de pedidos vinculados
  interconsultationOrderId?: string; // Pedido iniciado que espera resolución de especialista
  attendingDoctorId?: string;
  attendingDoctorName?: string;
  updatedAt?: string;
  createdAt?: string;
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
  location?: string;
  laboratory?: string;
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
  status: 'Pendiente' | 'Entregado' | 'En_Interconsulta';
  location: string;
  deliveredAt?: string; // Nuevo: Fecha de entrega
  updatedAt?: string;
}
