export type ClinicType = 'odonto' | 'medico' | 'estetica' | 'vet' | 'fisio' | 'psico' | 'nutri'
export type UserRole = 'recepcao' | 'dentista' | 'medico' | 'admin' | 'superadmin'
export type AppointmentStatus = 'agendado' | 'confirmado' | 'concluido' | 'cancelado' | 'faltou'
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'convenio' | 'outro'

export type ClinicStatus = 'active' | 'inactive' | 'suspended' | 'pending'
export type ClinicPlan = 'basico' | 'plus'

export interface Clinic {
  id: string
  name: string
  slug: string
  clinic_type: ClinicType
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  primary_color: string | null
  plan: string | null
  max_patients: number | null
  is_active: boolean
  status: ClinicStatus
  created_at: string
  trial_ends_at: string | null
  gcal_connected: boolean
}

export interface SystemAlert {
  id: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  is_active: boolean
  starts_at: string
  ends_at: string | null
  created_by: string | null
  created_at: string
}

export interface ClinicUser {
  id: string
  clinic_id: string
  user_id: string
  role: UserRole
  display_name: string
  username: string
  is_active: boolean
  is_superadmin: boolean
  email: string | null
  created_at: string
  clinics?: Clinic
}

export interface Patient {
  id: string
  clinic_id: string
  name: string
  phone: string | null
  email: string | null
  cpf: string | null
  rg: string | null
  birth_date: string | null
  gender: string | null
  address: string | null
  occupation: string | null
  emergency_contact: string | null
  referred_by: string | null
  registration_status: 'pending' | 'approved' | 'rejected' | null
  self_registered: boolean | null
  // vet fields
  pet_name: string | null
  pet_species: string | null
  pet_breed: string | null
  pet_weight: number | null
  pet_age: string | null
  pet_coat: string | null
  pet_neutered: boolean | null
  notes: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  clinic_id: string
  patient_id: string
  professional_id: string | null
  procedure_name: string | null
  status: AppointmentStatus
  scheduled_at: string
  duration_minutes: number
  notes: string | null
  created_at: string
  gcal_event_id: string | null
  patients?: Pick<Patient, 'id' | 'name' | 'phone'>
  clinic_users?: Pick<ClinicUser, 'id' | 'display_name'>
}

export interface MedicalRecord {
  id: string
  clinic_id: string
  patient_id: string
  anamnesis: Record<string, string>
  clinical_exam: Record<string, string>
  treatment_plan: string | null
  contract_text: string | null
  odontogram: Record<string, string>
  vaccinations: unknown[]
  aesthetic_protocols: unknown[]
  photos: string[]
  created_at: string
  updated_at: string
}

export interface RecordEntry {
  id: string
  clinic_id: string
  patient_id: string
  record_id: string
  author_name: string | null
  entry_text: string
  entry_type: string
  photo_url: string | null
  created_at: string
}

export interface FinancialRecord {
  id: string
  clinic_id: string
  patient_id: string | null
  total_amount: number | null
  discount_percent: number | null
  payment_method: string | null
  installments: unknown[] | null
  notes: string | null
  created_at: string
  type: 'receita' | 'despesa'
  category: string | null
  patients?: Pick<Patient, 'id' | 'name'> | null
}

export interface Professional {
  id: string
  clinic_id: string | null
  name: string
  specialty: string | null
  google_calendar_id: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  clinic_id: string | null
  user_id: string | null
  action: string
  module: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// N8N types (read-only)
export interface N8nChat {
  phone: string
  conversation_id: string
  contexto: string | null
  memoria_contexto: string | null
  nome: string | null
  procedimento: string | null
  status: string | null
  data_agendamento: string | null
  created_at: string | null
  ai_service: string | null
  prontuario: string | null
}

export interface N8nChatMessage {
  id: number
  created_at: string | null
  phone: string | null
  conversation_id: string | null
  bot_message: string | null
  user_message: string | null
  active: boolean | null
}

export interface N8nChatHistory {
  id: number
  session_id: string
  message: {
    type: 'human' | 'ai'
    data: { content: string }
  }
}

export interface StockItem {
  id: string
  clinic_id: string
  name: string
  category: string | null
  unit: string
  quantity: number
  min_quantity: number
  cost_price: number | null
  supplier: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StockMovement {
  id: string
  clinic_id: string
  item_id: string
  type: 'entrada' | 'saida' | 'ajuste'
  quantity: number
  reason: string | null
  user_name: string | null
  created_at: string
  stock_items?: Pick<StockItem, 'id' | 'name' | 'unit'>
}

export type DocumentTemplateType = 'receita_comum' | 'receita_especial' | 'declaracao_comparecimento' | 'atestado'

export interface ClinicDocumentTemplate {
  id: string
  clinic_id: string
  type: DocumentTemplateType
  pdf_url: string
  created_at: string
  updated_at: string
}

// Auth store types
export interface AuthClinic {
  id: string
  name: string
  type: ClinicType
  logo: string
  address: string
  phone: string
  color: string
  slug: string
  plan: ClinicPlan
  status: ClinicStatus
  trialEndsAt: string | null
  gcalConnected: boolean
}

export interface AuthUser {
  id: string
  role: UserRole
  displayName: string
  isSuperAdmin: boolean
}
