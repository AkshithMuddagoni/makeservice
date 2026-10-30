import type {
  ProviderAssetOwnership,
  ProviderAssetRoadUse,
  ProviderBusinessType,
  ProviderOnboardingDocument,
  ProviderServiceRegistration,
} from "./types";

export type OnboardingField = {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  placeholder?: string;
  options?: string[];
  unit?: string;
  required?: boolean;
  hint?: string;
};

export type ServiceOnboardingDefinition = {
  label: string;
  tasks: string[];
  assetTypes: string[];
  fields: OnboardingField[];
};

export const SERVICE_ONBOARDING: Record<string, ServiceOnboardingDefinition> = {
  borewell: {
    label: "Borewell services",
    tasks: [
      "New borewell drilling",
      "Deepening / re-boring",
      "Flushing / cleaning",
      "Camera inspection",
      "Pump installation / removal / repair",
      "Water-yield assessment",
      "Site / groundwater survey",
      "Borewell recharge / maintenance",
    ],
    assetTypes: ["Drilling rig", "Air compressor", "Borewell camera", "Pump service equipment", "Survey equipment"],
    fields: [
      { key: "rigType", label: "Rig type", kind: "select", options: ["Rotary", "DTH", "Combination rotary / DTH", "Not applicable — service equipment only"], required: true },
      { key: "maxDepthFt", label: "Maximum stated drilling depth", kind: "number", unit: "ft", placeholder: "1200", hint: "Enter the manufacturer's or verified operating capacity, not a guaranteed borewell depth." },
      { key: "maxDiameterIn", label: "Maximum drilling diameter", kind: "number", unit: "in", placeholder: "12" },
      { key: "waltaStatus", label: "WALTA Form 16 status", kind: "select", options: ["Current Form 16 available", "Renewal due / needs review", "Not registered yet"], required: true, hint: "The full registration number and certificate must be verified through secure production document handling." },
      { key: "waltaExpiry", label: "WALTA registration expiry", kind: "text", placeholder: "DD-MM-YYYY", hint: "Check the current Form 16 certificate. Telangana rules provide a two-year renewal cycle." },
    ],
  },
  jcb: {
    label: "JCB and excavation",
    tasks: [
      "Foundation / basement excavation",
      "Trenching and drainage",
      "Site clearing and vegetation removal",
      "Land levelling and grading",
      "Pond / canal excavation",
      "Loading and shifting soil",
      "Backfilling and compaction",
      "Breaker / demolition attachment work",
      "Auger / post-hole drilling",
    ],
    assetTypes: ["Backhoe loader", "Wheeled excavator", "Crawler excavator", "Skid-steer loader", "Wheel loader"],
    fields: [
      { key: "machineClass", label: "Machine class", kind: "select", options: ["Backhoe loader", "Wheeled excavator", "Crawler excavator", "Skid-steer", "Wheel loader", "Other"], required: true },
      { key: "bucketCapacity", label: "Bucket capacity", kind: "text", placeholder: "0.3 m³ / 1 m³" },
      { key: "digDepth", label: "Maximum dig depth", kind: "text", placeholder: "e.g. 4.5 m" },
      { key: "attachments", label: "Attachments available", kind: "text", placeholder: "Bucket, breaker, auger, fork, grapple…" },
    ],
  },
  crane: {
    label: "Crane hire and lifting",
    tasks: [
      "Loading and unloading",
      "Construction material lifting",
      "Tank / generator / machinery placement",
      "Roof / terrace equipment placement",
      "Steel and structural lifting",
      "Pick-and-carry movement",
    ],
    assetTypes: ["Truck-mounted mobile crane", "Pick-and-carry crane", "Rough-terrain crane", "Crawler crane", "Hydra crane"],
    fields: [
      { key: "craneType", label: "Crane type", kind: "select", options: ["Truck-mounted mobile", "Pick-and-carry", "Rough terrain", "Crawler", "Hydra", "Other"], required: true },
      { key: "safeWorkingLoad", label: "Rated safe working load (SWL)", kind: "number", unit: "tonnes", placeholder: "25", required: true, hint: "Use the rating on the manufacturer's load chart; lifting capacity changes with boom length and radius." },
      { key: "boomLength", label: "Maximum boom length", kind: "text", placeholder: "e.g. 30 m" },
      { key: "liftingGear", label: "Lifting gear supplied", kind: "text", placeholder: "Slings, shackles, spreader beam, hooks…" },
    ],
  },
  tractor: {
    label: "Tractor and field services",
    tasks: [
      "Ploughing",
      "Rotavator work",
      "Cultivator / harrowing",
      "Seeding / sowing",
      "Inter-cultivation / weeding",
      "Land levelling",
      "Trailer hauling",
      "Other farm field preparation",
    ],
    assetTypes: ["Agricultural tractor", "Agricultural trailer", "Rotavator", "Cultivator", "Plough", "Other implement"],
    fields: [
      { key: "horsePower", label: "Tractor horsepower", kind: "number", unit: "HP", placeholder: "45" },
      { key: "implements", label: "Implements available", kind: "text", placeholder: "Rotavator, plough, cultivator, trailer…" },
      { key: "trailerUse", label: "Trailer use", kind: "select", options: ["No trailer", "Agricultural use only", "Commercial goods hauling", "Both — subject to applicable permits"], required: true },
    ],
  },
  tanker: {
    label: "Water tanker services",
    tasks: [
      "Construction / curing water",
      "Agricultural / irrigation water",
      "Domestic non-potable water",
      "Potable / drinking water (extra quality checks apply)",
    ],
    assetTypes: ["Water tanker truck", "Tractor tanker", "Trailer-mounted water tank"],
    fields: [
      { key: "capacityLitres", label: "Tank capacity", kind: "number", unit: "litres", placeholder: "5000", required: true },
      { key: "waterType", label: "Water supplied", kind: "select", options: ["Non-potable / construction water", "Agricultural water", "Potable / drinking water"], required: true, hint: "Do not advertise water as potable unless the source and current quality evidence support that claim." },
      { key: "sourceType", label: "Water source", kind: "select", options: ["Authorised public supply", "Permitted borewell / private source", "Other documented source"], required: true },
      { key: "tankerMaterial", label: "Tank material / hygiene", kind: "text", placeholder: "Food-grade / stainless steel / other; cleaning schedule" },
    ],
  },
  tipper: {
    label: "Tipper and goods transport",
    tasks: [
      "Excavated soil movement",
      "Gravel / aggregate transport",
      "Construction material transport",
      "Construction debris removal",
      "Sand transport (valid source and transit documents required for every applicable load)",
    ],
    assetTypes: ["Tipper truck", "Dumper", "Goods carriage truck", "Tractor with goods trailer"],
    fields: [
      { key: "payloadTonnes", label: "Permitted payload", kind: "number", unit: "tonnes", placeholder: "16", required: true, hint: "Use the legal payload shown in the vehicle documents, not an estimated load." },
      { key: "axles", label: "Axle configuration", kind: "text", placeholder: "6-wheel / 10-wheel / multi-axle" },
      { key: "materials", label: "Materials you carry", kind: "text", placeholder: "Soil, aggregate, sand, debris…" },
      { key: "covering", label: "Load covering", kind: "select", options: ["Tarpaulin / secured cover available", "Not available"], required: true },
    ],
  },
  agri: {
    label: "Agriculture equipment",
    tasks: [
      "Combine harvester",
      "Reaper / thresher",
      "Power spraying",
      "Seed drill / planter",
      "Baler / mulcher",
      "Straw management",
      "Other mechanised farm work",
    ],
    assetTypes: ["Combine harvester", "Reaper", "Thresher", "Power sprayer", "Seed drill", "Baler", "Mulcher", "Other farm machine"],
    fields: [
      { key: "implementType", label: "Main implement / machine type", kind: "text", placeholder: "Combine harvester / seed drill…" },
      { key: "workingWidth", label: "Working width / rated output", kind: "text", placeholder: "e.g. 2.5 m / 1.2 acres per hour" },
      { key: "tractorRequired", label: "Requires a tractor?", kind: "select", options: ["Self-propelled", "Tractor mounted / pulled", "Both"], required: true },
    ],
  },
  construction: {
    label: "Construction equipment",
    tasks: [
      "Concrete mixing",
      "Concrete pumping",
      "Compaction / road roller",
      "Power generation",
      "Material hoisting",
      "Scaffolding / access equipment rental",
      "Other construction site equipment",
    ],
    assetTypes: ["Concrete mixer", "Concrete pump", "Compactor / roller", "Generator", "Material hoist", "Scaffolding system", "Other site equipment"],
    fields: [
      { key: "equipmentType", label: "Equipment type", kind: "select", options: ["Concrete mixer", "Concrete pump", "Compactor / roller", "Generator", "Material hoist", "Scaffolding", "Other"], required: true },
      { key: "ratedCapacity", label: "Rated capacity / output", kind: "text", placeholder: "e.g. 6 m³/hour / 125 kVA" },
      { key: "inspectionStatus", label: "Inspection / maintenance status", kind: "select", options: ["Current inspection / maintenance record available", "Needs inspection / documents"], required: true },
    ],
  },
  rental: {
    label: "Equipment rental",
    tasks: [
      "Rental with operator",
      "Rental without operator (where lawful and safe)",
      "Daily rental",
      "Weekly / monthly rental",
      "Attachment / accessory rental",
    ],
    assetTypes: ["Excavator / JCB", "Crane", "Tractor", "Generator", "Compactor", "Concrete equipment", "Other construction machine"],
    fields: [
      { key: "rentalMode", label: "Rental mode", kind: "select", options: ["With trained operator", "Without operator", "Both, depending on equipment"], required: true },
      { key: "minimumPeriod", label: "Minimum rental period", kind: "select", options: ["4 hours", "8 hours", "1 day", "1 week", "1 month"], required: true },
      { key: "delivery", label: "Equipment delivery", kind: "select", options: ["Provider delivers", "Customer collects", "Both"], required: true },
    ],
  },
  other: {
    label: "Other site services",
    tasks: ["Other equipment or site service — describe for manual review"],
    assetTypes: ["Other equipment"],
    fields: [
      { key: "customService", label: "Describe the service", kind: "text", placeholder: "What work does your equipment perform?", required: true },
      { key: "customAsset", label: "Describe the equipment", kind: "text", placeholder: "Make, model, capacity and intended use", required: true },
    ],
  },
};

export type DocumentRequirement = {
  key: string;
  label: string;
  description: string;
  requiredForApproval: boolean;
  secureOnly?: boolean;
  jobSpecific?: boolean;
};

export type OnboardingServiceInput = Pick<ProviderServiceRegistration, "serviceId" | "selectedTasks">;

export type OnboardingAssetInput = {
  serviceIds: string[];
  ownership: ProviderAssetOwnership;
  roadUse: ProviderAssetRoadUse;
  vehicleClass: string;
  assetType: string;
  waterType?: string;
};

export function getProviderDocumentRequirements(input: {
  businessType: ProviderBusinessType;
  gstStatus: "REGISTERED" | "NOT_REGISTERED" | "NOT_SURE";
  authorisedRepresentative: boolean;
  services: OnboardingServiceInput[];
  assets: OnboardingAssetInput[];
}): DocumentRequirement[] {
  const docs = new Map<string, DocumentRequirement>();

  const add = (item: DocumentRequirement) => docs.set(item.key, item);

  add({
    key: "OWNER_IDENTITY_KYC",
    label: "Owner / authorised representative identity KYC",
    description: "Verify identity through a secure KYC provider. Do not collect or store full identity numbers in the browser.",
    requiredForApproval: true,
    secureOnly: true,
  });
  add({
    key: "PAN_KYC",
    label: "PAN verification",
    description: "PAN of the proprietor or relevant legal entity, verified securely for tax and payout compliance.",
    requiredForApproval: true,
    secureOnly: true,
  });
  add({
    key: "BUSINESS_ADDRESS_PROOF",
    label: "Business / operating address proof",
    description: "A recent acceptable proof such as utility bill, lease, municipal/trade record or other evidence accepted by Fieldly review.",
    requiredForApproval: true,
  });
  add({
    key: "BUSINESS_EXISTENCE_PROOF",
    label: "Business existence proof",
    description: "At least one suitable proof for the declared business type. Requirements depend on the entity and its registration status.",
    requiredForApproval: true,
  });

  if (input.businessType === "PARTNERSHIP") {
    add({ key: "PARTNERSHIP_DEED", label: "Partnership deed", description: "Current deed and any amendments relevant to ownership/signing authority.", requiredForApproval: true });
    add({ key: "SIGNATORY_AUTHORITY", label: "Partner authorisation", description: "Evidence that the person opening the Fieldly account may act for the partnership.", requiredForApproval: true });
  }
  if (input.businessType === "LLP") {
    add({ key: "LLP_INCORPORATION", label: "LLP incorporation / agreement", description: "LLP incorporation certificate and LLP agreement or appropriate MCA evidence.", requiredForApproval: true });
    add({ key: "SIGNATORY_AUTHORITY", label: "Designated partner authorisation", description: "Evidence of authority to manage this marketplace account.", requiredForApproval: true });
  }
  if (input.businessType === "PRIVATE_LIMITED" || input.businessType === "PUBLIC_LIMITED") {
    add({ key: "COMPANY_INCORPORATION", label: "Certificate of incorporation / CIN", description: "Company incorporation and current company identity evidence.", requiredForApproval: true });
    add({ key: "BOARD_AUTHORITY", label: "Board / authorised signatory resolution", description: "Evidence authorising the person to operate the Fieldly account.", requiredForApproval: true });
  }
  if (input.authorisedRepresentative) {
    add({ key: "OWNER_AUTHORIZATION", label: "Owner authorisation letter", description: "Signed authorisation from the owner / entity for the person managing this account.", requiredForApproval: true });
  }
  if (input.gstStatus === "REGISTERED") {
    add({ key: "GST_CERTIFICATE", label: "GST registration certificate", description: "GSTIN and legal name must match the declared entity; verify through the GST system.", requiredForApproval: true });
  }
  add({
    key: "LOCAL_TRADE_LICENSE",
    label: "Local trade / establishment licence (where applicable)",
    description: "Only where required by the local municipality, panchayat, Shops and Establishments rules, business premises or activity. Not a universal document for every individual machine owner.",
    requiredForApproval: false,
  });
  add({
    key: "UDYAM_CERTIFICATE",
    label: "Udyam / MSME certificate (optional)",
    description: "Optional supporting business credential; not a universal condition for listing or a separate certificate per service.",
    requiredForApproval: false,
  });

  if (input.assets.length > 0) {
    add({ key: "ASSET_OWNERSHIP_PROOF", label: "Machine ownership proof", description: "RC, purchase invoice, asset register or another ownership record appropriate to the equipment.", requiredForApproval: true });
  }
  if (input.assets.some((asset) => asset.ownership !== "OWNED")) {
    add({ key: "ASSET_OWNER_NOC", label: "Lease / owner consent / NOC", description: "Required where the listed machine belongs to a third party or is leased; confirm that the provider may offer it for hire.", requiredForApproval: true });
  }

  const roadAssets = input.assets.filter((asset) => asset.roadUse === "PUBLIC_ROAD" || asset.roadUse === "COMMERCIAL_TRANSPORT");
  if (roadAssets.length > 0) {
    add({ key: "VEHICLE_RC", label: "Vehicle registration certificate (RC)", description: "For road-registered motor vehicles and applicable construction equipment vehicles. Verify vehicle class, registered owner and validity.", requiredForApproval: true });
    add({ key: "THIRD_PARTY_INSURANCE", label: "Valid third-party motor insurance", description: "Required for motor vehicles used in public places; check vehicle number, insurer and policy dates.", requiredForApproval: true });
    add({ key: "PUC_CERTIFICATE", label: "Pollution Under Control (PUC)", description: "Upload where required for this vehicle/fuel type and vehicle age.", requiredForApproval: false });
  }
  const transportAssets = input.assets.filter((asset) => asset.roadUse === "COMMERCIAL_TRANSPORT" || asset.vehicleClass === "TRANSPORT");
  if (transportAssets.length > 0) {
    add({ key: "FITNESS_CERTIFICATE", label: "Fitness certificate", description: "For transport vehicles where the Motor Vehicles Act / rules require a current fitness certificate.", requiredForApproval: true });
    add({ key: "TRANSPORT_PERMIT", label: "Goods carriage / applicable transport permit", description: "Only where the vehicle's actual use and class require a permit. Do not demand this for every off-road excavator or farm tractor.", requiredForApproval: true });
    add({ key: "ROAD_TAX_RECEIPT", label: "Road tax / green tax receipt", description: "Where applicable to the vehicle and permit category.", requiredForApproval: false });
  }

  if (input.assets.some((asset) => asset.serviceIds.includes("borewell") && /drilling rig/i.test(asset.assetType))) {
    add({ key: "WALTA_FORM16", label: "WALTA drilling rig registration — Form 16", description: "For a drilling rig operated in Telangana. Match the certificate to this rig / vehicle and check its renewal date.", requiredForApproval: true });
  }
  if (input.services.some((service) => service.serviceId === "borewell" && service.selectedTasks.some((task) => /new borewell drilling|deepening/i.test(task)))) {
    add({ key: "WALTA_ACKNOWLEDGEMENT", label: "WALTA drilling compliance declaration", description: "Confirm that the rig used for drilling/deepening is registered and that job-specific site permissions/feasibility/insurance will be checked before drilling.", requiredForApproval: true, secureOnly: true });
    add({ key: "SITE_PERMISSION_JOB", label: "Site permission / feasibility / proposed-well insurance", description: "Job-specific. Collect and verify against the customer's proposed borewell and land before the work starts; do not treat a rig registration as site permission.", requiredForApproval: false, jobSpecific: true });
  }

  if (input.services.some((service) => service.serviceId === "crane")) {
    add({ key: "CRANE_LOAD_CHART", label: "Crane load chart / rated capacity", description: "The operator and Fieldly reviewer need the manufacturer's load chart for the machine configuration.", requiredForApproval: true });
    add({ key: "CRANE_INSPECTION", label: "Crane / lifting equipment inspection record", description: "Current inspection and maintenance evidence for the crane and lifting accessories. Exact statutory inspection requirements depend on the site and work; safety review is mandatory for Fieldly approval.", requiredForApproval: true });
    add({ key: "CRANE_OPERATOR_COMPETENCE", label: "Operator / rigger competence evidence", description: "Training, experience and role details for the people carrying out lifting operations.", requiredForApproval: true });
  }

  if (input.services.some((service) => service.serviceId === "tanker")) {
    add({ key: "WATER_SOURCE_EVIDENCE", label: "Water source / lawful abstraction evidence", description: "Evidence appropriate to the source and locality. A provider must not claim a lawful source without supporting records.", requiredForApproval: true });
  }
  if (input.services.some((service) => service.serviceId === "tanker" && service.selectedTasks.some((task) => /potable/i.test(task)))) {
    add({ key: "POTABLE_WATER_QUALITY", label: "Potable water quality evidence", description: "Recent test from a competent laboratory and hygienic tanker/handling evidence before the provider may advertise drinking water.", requiredForApproval: true });
    add({ key: "POTABLE_WATER_FBO_LICENSE", label: "FSSAI registration / licence (where the activity is a food business)", description: "FSSAI licensing applies to Food Business Operators. Fieldly must classify the exact potable / packaged water supply activity before making this mandatory for a bulk tanker-only provider.", requiredForApproval: false });
  }

  if (input.assets.some((asset) => asset.roadUse === "PUBLIC_ROAD" || asset.roadUse === "COMMERCIAL_TRANSPORT")) {
    add({ key: "OPERATOR_DL", label: "Driving licence for road-driving operators", description: "Verify each driver’s current licence and the correct vehicle class. The driver record and complete licence details belong in the secure production operator onboarding flow.", requiredForApproval: true, secureOnly: true });
  }
  if (input.services.length > 0) {
    add({ key: "OPERATOR_ROSTER", label: "Operator / driver roster", description: "In production, add each operator against the machine they operate: legal name, contact, role, experience, competence/training and driving licence where relevant. This is a Fieldly safety and accountability check; statutory requirements vary by equipment and worksite.", requiredForApproval: true, secureOnly: true });
  }

  add({
    key: "JOB_LEVEL_MINERAL_TRANSIT",
    label: "Mineral / sand transit documents (job-specific)",
    description: "Not a permanent provider licence. Require the applicable source, transit pass / e-way / mineral document for every regulated load before dispatch.",
    requiredForApproval: false,
    jobSpecific: true,
  });
  return [...docs.values()];
}

export function isProviderServiceSelectable(serviceId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SERVICE_ONBOARDING, serviceId);
}

export function isValidProviderOnboardingService(service: OnboardingServiceInput): boolean {
  const definition = SERVICE_ONBOARDING[service.serviceId];
  if (!definition) return false;
  if (service.selectedTasks.length === 0) return false;
  return service.selectedTasks.every((task) => definition.tasks.includes(task));
}

export function safeRegistrationSuffix(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!normalized) return undefined;
  return normalized.slice(-4);
}

export function safeSerialSuffix(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!normalized) return undefined;
  return normalized.slice(-4);
}

export const BUSINESS_TYPE_LABELS: Record<ProviderBusinessType, string> = {
  INDIVIDUAL: "Individual owner",
  PROPRIETORSHIP: "Sole proprietorship",
  PARTNERSHIP: "Partnership firm",
  LLP: "Limited Liability Partnership (LLP)",
  PRIVATE_LIMITED: "Private limited company",
  PUBLIC_LIMITED: "Public limited company",
  OTHER: "Other legal structure",
};

export const OWNERSHIP_LABELS: Record<ProviderAssetOwnership, string> = {
  OWNED: "Owned by this business",
  LEASED: "Leased / finance arrangement",
  THIRD_PARTY: "Owned by another person / business",
};

export const ROAD_USE_LABELS: Record<ProviderAssetRoadUse, string> = {
  PUBLIC_ROAD: "Self-propelled on public roads",
  COMMERCIAL_TRANSPORT: "Commercial goods / passenger transport",
  TRAILER_MOVED: "Moved between sites on a trailer / low-bed",
  OFF_ROAD: "Off-road / private site only",
  NOT_APPLICABLE: "Not a vehicle (stationary equipment)",
};

export function selectedDocumentRecords(requirements: DocumentRequirement[], selectedKeys: string[]): ProviderOnboardingDocument[] {
  return requirements.map((requirement) => ({
    key: requirement.key,
    label: requirement.label,
    selectedInPreview: selectedKeys.includes(requirement.key),
    requiredForApproval: requirement.requiredForApproval,
    jobSpecific: Boolean(requirement.jobSpecific),
  }));
}
