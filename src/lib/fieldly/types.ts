export type Lang = "en" | "te" | "hi";

export type BookingStatus =
  | "CONFIRMED"
  | "ON_THE_WAY"
  | "ARRIVED"
  | "SERVICE_STARTED"
  | "SERVICE_COMPLETED"
  | "PAID"
  | "DISPUTED"
  | "CANCELLED";

export type Site = {
  label: string
  area: string
  city: string
  state: string
  district?: string
  pincode?: string
  address?: string
  landmark?: string
  lat: number
  lng: number
};

export type FieldDef =
  | {
      key: string
      label: string
      type: "select"
      options: string[]
      required?: boolean
      hint?: string
      showWhen?: { key: string; values: string[] }
    }
  | {
      key: string
      label: string
      type: "number"
      unit?: string
      required?: boolean
      placeholder?: string
      hint?: string
      showWhen?: { key: string; values: string[] }
    }
  | {
      key: string
      label: string
      type: "text"
      required?: boolean
      placeholder?: string
      hint?: string
      showWhen?: { key: string; values: string[] }
    };

export type ServiceIconName =
  | "drill"
  | "shovel"
  | "crane"
  | "tractor"
  | "tanker"
  | "tipper"
  | "agri"
  | "construction"
  | "rental"
  | "other";

export type ServiceDef = {
  id: string
  name: string
  blurb: string
  icon: ServiceIconName
  fromLabel: string
  radiusKm: number
  includes: string[]
  fields: FieldDef[]
};

export type Rate = { rate: number; unit: string };

export type Review = {
  name: string
  stars: number
  text: string
  ago: string
};

export type Provider = {
  id: string
  phone: string
  name: string
  city: string
  area: string
  state: string
  lat: number
  lng: number
  services: string[]
  equipment: string
  machines: string[]
  years: number
  jobs: number
  rating: number
  reviewCount: number
  replyMin: number
  rates: Record<string, Rate>
  verified: {
    identity: boolean
    equipment: boolean
    insurance: boolean
    walta: string | null
  }
  approved: boolean
  online: boolean
  bio: string
  languages: string[]
  reviews: Review[]
};

export type Draft = {
  serviceId: string
  requirements: Record<string, string>
  whenLabel: string
  notes: string
  siteImages?: string[]
};

export type Session = {
  phone: string
  name: string
  role: "customer" | "provider"
  providerId?: string
};

export type CustomerProfile = { phone: string; name: string };

export type ChatMessage = {
  id: string
  from: "customer" | "provider" | "system"
  text: string
  at: number
};

export type JobRequest = {
  id: string
  serviceId: string
  site: Site
  requirements: Record<string, string>
  whenLabel: string
  notes: string
  customerPhone: string
  customerName: string
  status: "open" | "booked" | "cancelled"
  createdAt: number
  targetedProviderIds: string[]
  declinedProviderIds?: string[]
  siteImages?: string[]
  messages: ChatMessage[]
};

export type Quote = {
  id: string
  requestId: string
  providerId: string
  amount: number
  summary: string
  etaMin: number
  note: string
  includes: string[]
  status: "pending" | "accepted" | "declined"
  createdAt: number
};

export type Audit = {
  at: number
  actor: string
  from: BookingStatus | "NONE"
  to: BookingStatus
  note?: string
};

export type Booking = {
  id: string
  code: string
  requestId: string
  quoteId: string
  providerId: string
  serviceId: string
  site: Site
  requirements: Record<string, string>
  whenLabel: string
  notes: string
  customerPhone: string
  customerName: string
  amount: number
  summary: string
  terms: string
  termsAcceptedAt?: number
  siteImages?: string[]
  status: BookingStatus
  startCode: string | null
  codeHash: string | null
  codeExpiresAt: number | null
  codeAttempts: number
  audit: Audit[]
  messages: ChatMessage[]
  payment?: { method: string; ref: string; at: number }
  review?: { stars: number; text: string; at: number }
  disputeReason?: string
  cancelReason?: string
  timestamps: Partial<Record<BookingStatus, number>>
};

export type Result = { ok: true; id?: string } | { ok: false; error: string };
