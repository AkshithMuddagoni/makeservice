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


export type ProviderBusinessType =
  | "INDIVIDUAL"
  | "PROPRIETORSHIP"
  | "PARTNERSHIP"
  | "LLP"
  | "PRIVATE_LIMITED"
  | "PUBLIC_LIMITED"
  | "OTHER";

export type ProviderBusinessProfile = {
  legalName: string;
  tradeName: string;
  businessType: ProviderBusinessType;
  address: string;
  district: string;
  pincode: string;
  state: string;
  gstStatus: "REGISTERED" | "NOT_REGISTERED" | "NOT_SURE";
  udyamProvided: boolean;
  authorisedRepresentative: boolean;
  declarationAcceptedAt: number;
};

export type ProviderAssetOwnership = "OWNED" | "LEASED" | "THIRD_PARTY";
export type ProviderAssetRoadUse =
  | "PUBLIC_ROAD"
  | "COMMERCIAL_TRANSPORT"
  | "TRAILER_MOVED"
  | "OFF_ROAD"
  | "NOT_APPLICABLE";

export type ProviderVerificationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_INFORMATION"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type ProviderServiceRegistration = {
  serviceId: string;
  selectedTasks: string[];
  specifications: Record<string, string>;
  status: ProviderVerificationStatus;
  selectedDocumentKeys: string[];
  submittedAt?: number;
  reviewerNote?: string;
};

export type ProviderAsset = {
  id: string;
  serviceIds: string[];
  assetType: string;
  make: string;
  model: string;
  yearOfManufacture?: number;
  ownership: ProviderAssetOwnership;
  roadUse: ProviderAssetRoadUse;
  vehicleClass: string;
  registrationLast4?: string;
  serialLast4?: string;
  specifications: Record<string, string>;
  selectedDocumentKeys: string[];
  status: ProviderVerificationStatus;
};

export type ProviderOnboardingDocument = {
  key: string;
  label: string;
  selectedInPreview: boolean;
  requiredForApproval: boolean;
  jobSpecific: boolean;
};

export type ProviderOnboardingProfile = {
  business: ProviderBusinessProfile;
  services: ProviderServiceRegistration[];
  assets: ProviderAsset[];
  documents: ProviderOnboardingDocument[];
  businessStatus: ProviderVerificationStatus;
  payoutStatus: "NOT_STARTED" | "KYC_REQUIRED" | "UNDER_REVIEW" | "ACTIVE" | "REJECTED";
  accountCreatedAt: number;
};

export type Provider = {
  onboarding?: ProviderOnboardingProfile;
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
  quoteNote?: string
  quoteIncludes?: string[]
  quoteEtaMin?: number
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
