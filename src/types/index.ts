export type ClinicType = 'odonto' | 'medico' | 'estetica' | 'vet' | 'fisio' | 'psico' | 'nutri' | 'fono' | 'to'
export type UserRole = 'recepcao' | 'auxiliar' | 'dentista' | 'medico' | 'profissional' | 'admin' | 'superadmin'
export type AppointmentStatus = 'agendado' | 'confirmado' | 'concluido' | 'cancelado' | 'faltou' | 'bloqueado'
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'convenio' | 'outro'

export type ClinicStatus = 'active' | 'inactive' | 'suspended' | 'pending' | 'trial'
export type ClinicPlan = 'essencial' | 'avancado' | 'completo' | 'completo_plus' | 'basico' | 'plus'

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
  max_users: number | null
  is_multi_specialty: boolean
  specialties: ClinicType[]
  is_active: boolean
  status: ClinicStatus
  created_at: string
  trial_ends_at: string | null
  gcal_connected: boolean
  billing_phone: string | null
  billing_due_day: number | null
  billing_paid: boolean
  billing_overdue_since: string | null
  next_billing_date: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
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
  specialty_type: ClinicType | null
  display_name: string
  username: string
  is_active: boolean
  is_superadmin: boolean
  email: string | null
  cpf: string | null
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

export interface Procedure {
  id: string
  clinic_id: string
  name: string
  price: number
  is_free: boolean
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  clinic_id: string
  patient_id: string | null
  professional_id: string | null
  procedure_name: string | null
  procedure_id: string | null
  procedure_price: number | null
  status: AppointmentStatus
  scheduled_at: string
  duration_minutes: number
  notes: string | null
  created_at: string
  gcal_event_id: string | null
  patients?: Pick<Patient, 'id' | 'name' | 'phone'>
  clinic_users?: Pick<ClinicUser, 'id' | 'display_name'>
  professionals?: Pick<Professional, 'id' | 'name'>
  procedures?: Pick<Procedure, 'id' | 'name' | 'price'>
}

export interface MedicalRecord {
  id: string
  clinic_id: string
  patient_id: string
  // Namespaced por área (Bloco B) — ex: {"odonto": {"a-queixa": "..."}}.
  // Cada profissional lê/escreve só o namespace da própria área; ver
  // TabFicha.tsx e a migration 20260806_medical_records_namespace_by_area.
  // Partial porque só as áreas que já atenderam esse paciente têm namespace.
  anamnesis: Partial<Record<ClinicType, Record<string, string>>>
  clinical_exam: Partial<Record<ClinicType, Record<string, string>>>
  treatment_plan: string | null
  contract_text: string | null
  odontogram: Record<string, string | { status: string; surfaces?: Record<string, string> }>
  vaccinations: unknown[]
  aesthetic_protocols: unknown[]
  body_protocols: unknown[]
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
  // FK opcional pro profissional que escreveu (Bloco B) — author_name
  // continua sendo o nome gravado no momento (imutabilidade CFM), este
  // campo é só pra filtro "minhas evoluções" e não deve alterar o texto.
  professional_id: string | null
  entry_text: string
  entry_type: string
  photo_url: string | null
  photo_urls: string[]
  created_at: string
}

export interface FinancialRecord {
  id: string
  clinic_id: string
  patient_id: string | null
  appointment_id: string | null
  procedure_id: string | null
  total_amount: number | null
  discount_percent: number | null
  payment_method: string | null
  installments: unknown[] | null
  notes: string | null
  created_at: string
  type: 'receita' | 'despesa'
  category: string | null
  patients?: Pick<Patient, 'id' | 'name'> | null
  appointments?: Pick<Appointment, 'id' | 'scheduled_at' | 'procedure_name'> | null
}

export interface Professional {
  id: string
  clinic_id: string | null
  name: string
  specialty: string | null
  specialty_type: ClinicType | null
  google_calendar_id: string | null
  clinic_user_id: string | null
  // null = herda a duração padrão da área (specialty_type) — Bloco D.
  default_duration_minutes: number | null
  created_at: string
}

export interface CommissionRecipient {
  id: string
  clinic_id: string
  name: string
  role_label: string | null
  professional_id: string | null
  clinic_user_id: string | null
  is_active: boolean
  created_at: string
}

export interface CommissionRule {
  id: string
  clinic_id: string
  recipient_id: string
  procedure_id: string | null
  percent: number
  is_active: boolean
  created_at: string
  commission_recipients?: Pick<CommissionRecipient, 'id' | 'name' | 'role_label'>
  procedures?: Pick<Procedure, 'id' | 'name'>
}

export interface CommissionEntry {
  id: string
  clinic_id: string
  financial_record_id: string
  recipient_id: string
  recipient_name: string
  percent: number
  amount: number
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
  maxUsers: number | null
  founderIsProfessional: boolean | null
  founderHasTeam: boolean | null
  isMultiSpecialty: boolean
  specialties: ClinicType[]
  status: ClinicStatus
  trialEndsAt: string | null
  gcalConnected: boolean
  billingPaid: boolean
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null
  billingOverdueSince: string | null
  nextBillingDate: string | null
  monthlyRevenueGoal: number | null
  onboardingDismissed: string[]
  onboardingModalSeen: boolean
}

export interface AuthUser {
  id: string
  // PK de clinic_users (não confundir com `id`, que é o auth.users.id) —
  // usado pra achar o `professionals` vinculado a este login (Bloco B/F:
  // resolver a ficha e a sub-área do profissional logado).
  clinicUserId: string | null
  role: UserRole
  specialtyType: ClinicType | null
  displayName: string
  isSuperAdmin: boolean
}
