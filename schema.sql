-- Eliminar tablas si ya existen para un reinicio limpio (opcional)
-- DROP TABLE IF EXISTS users, medicines, patients, patient_files, patient_visits, upload_records, orders;

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    "lastName" TEXT,
    "photoURL" TEXT,
    role TEXT,
    phone TEXT,
    "isPending" BOOLEAN DEFAULT true,
    "profileCompleted" BOOLEAN DEFAULT false,
    "lastActiveAt" TEXT,
    status TEXT
);

-- MEDICINES TABLE
CREATE TABLE IF NOT EXISTS public.medicines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "drugId" TEXT,
    drug TEXT,
    "brandName" TEXT,
    presentation TEXT,
    "therapeuticAction" TEXT,
    dosage TEXT,
    stock TEXT,
    "expirationDate" TEXT,
    laboratory TEXT,
    location TEXT,
    category TEXT,
    "uploadId" TEXT
);

-- PATIENTS TABLE
CREATE TABLE IF NOT EXISTS public.patients (
    id TEXT PRIMARY KEY,
    dni TEXT,
    name TEXT,
    "createdAt" TEXT,
    age TEXT,
    location TEXT,
    phone TEXT,
    category TEXT,
    "clinicalHistory" TEXT,
    "guardianName" TEXT,
    "guardianRelation" TEXT
);

-- PATIENT FILES TABLE
CREATE TABLE IF NOT EXISTS public.patient_files (
    id TEXT PRIMARY KEY,
    "patientId" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileUrl" TEXT,
    "uploadedBy" TEXT,
    "uploaderName" TEXT,
    "uploaderRole" TEXT,
    "uploadDate" TEXT,
    size INTEGER
);

-- PATIENT VISITS TABLE
CREATE TABLE IF NOT EXISTS public.patient_visits (
    id TEXT PRIMARY KEY,
    "patientId" TEXT,
    "patientName" TEXT,
    "patientDni" TEXT,
    age TEXT,
    location TEXT,
    category TEXT,
    date TEXT,
    status TEXT,
    "serviceType" TEXT,
    vitals JSONB,
    evolution JSONB,
    "orderIds" JSONB,
    "interconsultationOrderId" TEXT,
    "attendingDoctorId" TEXT,
    "attendingDoctorName" TEXT,
    "updatedAt" TEXT,
    "createdAt" TEXT
);

-- UPLOAD RECORDS TABLE
CREATE TABLE IF NOT EXISTS public.upload_records (
    id TEXT PRIMARY KEY,
    filename TEXT,
    timestamp TEXT,
    "itemCount" INTEGER
);

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    "orderId" TEXT PRIMARY KEY,
    date TEXT,
    "doctorId" TEXT,
    "doctorName" TEXT,
    "patientId" TEXT,
    "patientName" TEXT,
    "patientDni" TEXT,
    items JSONB,
    status TEXT,
    location TEXT,
    "deliveredAt" TEXT,
    "updatedAt" TEXT
);

-- SEGURIDAD: Desactivar momentáneamente Row Level Security, 
-- O añadir políticas para que se puedan leer/escribir libremente (como estaba en tu Firebase con las reglas abiertas)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Permitir todo a roles autenticados (Emulando tus viejas reglas de Firestore para hacer la app funcionar)
CREATE POLICY "Permitir todo en users" ON public.users FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en medicines" ON public.medicines FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en patients" ON public.patients FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en patient_files" ON public.patient_files FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en patient_visits" ON public.patient_visits FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en upload_records" ON public.upload_records FOR ALL TO authenticated USING (true);
CREATE POLICY "Permitir todo en orders" ON public.orders FOR ALL TO authenticated USING (true);

-- Habilitar actualizaciones en tiempo real (para web sockets)
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.patient_visits;
alter publication supabase_realtime add table public.orders;
