import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { submitCurrentProviderApplication } from "@/lib/fieldly/account.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/fieldly/bits";
import { ServiceIcon } from "@/components/fieldly/icons";
import { SERVICES } from "@/lib/fieldly/catalog";
import {
  BUSINESS_TYPE_LABELS,
  OWNERSHIP_LABELS,
  ROAD_USE_LABELS,
  SERVICE_ONBOARDING,
  getProviderDocumentRequirements,
} from "@/lib/fieldly/provider-onboarding";
import { useFieldly } from "@/lib/fieldly/store";
import type {
  Provider,
  ProviderAsset,
  ProviderAssetOwnership,
  ProviderAssetRoadUse,
  ProviderBusinessProfile,
  ProviderBusinessType,
  ProviderOnboardingDocument,
  ProviderOnboardingProfile,
  ProviderServiceRegistration,
  ProviderVerificationStatus,
} from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { z } from "zod";

export const Route = createFileRoute("/join")({ component: JoinPage });

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);
const initialService = "jcb";

type AssetDraft = {
  localId?: string;
  serviceIds: string[];
  assetType: string;
  make: string;
  model: string;
  year: string;
  ownership: ProviderAssetOwnership;
  roadUse: ProviderAssetRoadUse;
  vehicleClass: string;
  registration: string;
  serial: string;
  specifications: Record<string, string>;
};

const emptyAsset = (serviceId: string = initialService): AssetDraft => ({
  serviceIds: [serviceId],
  assetType: SERVICE_ONBOARDING[serviceId].assetTypes[0],
  make: "",
  model: "",
  year: "",
  ownership: "OWNED",
  roadUse: "NEEDS_REVIEW",
  vehicleClass: "OTHER",
  registration: "",
  serial: "",
  specifications: {},
});

const statusText: Record<ProviderVerificationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  NEEDS_INFORMATION: "More information required",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

function JoinPage() {
  const navigate = useNavigate();
  const site = useFieldly((s) => s.site);
  const addProvider = useFieldly((s) => s.addProvider);
  const signInProvider = useFieldly((s) => s.signInProvider);
  const activeProviderId = useFieldly((s) => s.session?.role === "provider" ? s.session.providerId : undefined);
  const existingProvider = useFieldly((s) => activeProviderId ? s.providerById(activeProviderId) : undefined);
  const existingBusiness = existingProvider?.onboarding?.business;
  const { data: authSession, isPending: authSessionPending } = authClient.useSession();

  const [step, setStep] = useState(existingProvider ? 2 : 1);
  const [ownerName, setOwnerName] = useState(existingBusiness?.ownerFullName ?? "");
  const [phone, setPhone] = useState(existingProvider?.phone ?? "");
  const [previewOtp, setPreviewOtp] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(Boolean(existingProvider));
  const verifiedPhone = authEnabled ? (authSession?.user?.phoneNumber ?? "") : phone;
  const verifiedPhoneDigits = verifiedPhone.startsWith("+91") ? verifiedPhone.slice(3) : verifiedPhone;
  const verifiedMobile = authEnabled
    ? Boolean(authSession?.user?.phoneNumberVerified && /^\\+91[6-9]\\d{9}$/.test(verifiedPhone))
    : phoneVerified;
  const [businessType, setBusinessType] = useState<ProviderBusinessType>(existingBusiness?.businessType ?? "PROPRIETORSHIP");
  const [legalName, setLegalName] = useState(existingBusiness?.legalName ?? "");
  const [tradeName, setTradeName] = useState(existingBusiness?.tradeName ?? "");
  const [businessAddress, setBusinessAddress] = useState(existingBusiness?.address ?? "");
  const [district, setDistrict] = useState(existingBusiness?.district ?? "");
  const [pincode, setPincode] = useState(existingBusiness?.pincode ?? "");
  const [gstStatus, setGstStatus] = useState<ProviderBusinessProfile["gstStatus"]>(existingBusiness?.gstStatus ?? "NOT_SURE");
  const [aggregateTurnoverBand, setAggregateTurnoverBand] = useState<ProviderBusinessProfile["aggregateTurnoverBand"]>(existingBusiness?.aggregateTurnoverBand ?? "NOT_SURE");
  const [authorisedRepresentative, setAuthorisedRepresentative] = useState(existingBusiness?.authorisedRepresentative ?? false);
  const [udyamProvided, setUdyamProvided] = useState(existingBusiness?.udyamProvided ?? false);
  const [years, setYears] = useState(String(existingProvider?.years ?? 1));
  const [languages, setLanguages] = useState(existingProvider?.languages.join(", ") ?? "Telugu, Hindi");
  const [bio, setBio] = useState(existingProvider?.bio ?? "");

  const [serviceTasks, setServiceTasks] = useState<Record<string, string[]>>(
    existingProvider?.onboarding
      ? Object.fromEntries(existingProvider.onboarding.services.map((service) => [service.serviceId, service.selectedTasks]))
      : { [initialService]: [SERVICE_ONBOARDING[initialService].tasks[0]] },
  );
  const [assets, setAssets] = useState<AssetDraft[]>(
    existingProvider?.onboarding
      ? existingProvider.onboarding.assets.map((asset) => ({
          localId: asset.id.startsWith(existingProvider.id + "_") ? asset.id.slice(existingProvider.id.length + 1) : asset.id,
          serviceIds: asset.serviceIds,
          assetType: asset.assetType,
          make: asset.make,
          model: asset.model,
          year: asset.yearOfManufacture ? String(asset.yearOfManufacture) : "",
          ownership: asset.ownership,
          roadUse: asset.roadUse,
          vehicleClass: asset.vehicleClass,
          registration: asset.registrationLast4 ?? "",
          serial: asset.serialLast4 ?? "",
          specifications: asset.specifications,
        }))
      : [],
  );
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(emptyAsset(existingProvider?.services[0] ?? initialService));
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<string[]>(
    existingProvider?.onboarding?.documents.filter((doc) => doc.selectedInPreview).map((doc) => doc.key) ?? [],
  );
  const [createdProviderId, setCreatedProviderId] = useState<string | null>(null);
  const [isProductionSubmitted, setIsProductionSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  const selectedServices = useMemo(
    () => Object.keys(serviceTasks).filter((id) => (serviceTasks[id] ?? []).length > 0),
    [serviceTasks],
  );

  const documentRequirements = useMemo(() => {
    const services = selectedServices.map((serviceId) => ({
      serviceId,
      selectedTasks: serviceTasks[serviceId] ?? [],
    }));
    const assetInputs = assets.map((asset) => ({
      serviceIds: asset.serviceIds,
      ownership: asset.ownership,
      roadUse: asset.roadUse,
      vehicleClass: asset.vehicleClass,
      assetType: asset.assetType,
    }));
    if (assetDraft.make.trim() && assetDraft.model.trim()) {
      assetInputs.push({
        serviceIds: assetDraft.serviceIds,
        ownership: assetDraft.ownership,
        roadUse: assetDraft.roadUse,
        vehicleClass: assetDraft.vehicleClass,
        assetType: assetDraft.assetType,
      });
    }
    return getProviderDocumentRequirements({
      businessType,
      state: site?.state || "Telangana",
      gstStatus,
      authorisedRepresentative,
      services,
      assets: assetInputs,
    });
  }, [
    assets,
    assetDraft,
    authorisedRepresentative,
    businessType,
    gstStatus,
    selectedServices,
    serviceTasks,
    site?.state,
  ]);

  const completedAssets = assets.filter((asset) => asset.make.trim() && asset.model.trim());

  function updateServiceTask(serviceId: string, task: string, checked: boolean) {
    setServiceTasks((current) => {
      const selected = current[serviceId] ?? [];
      const next = checked
        ? [...selected, task]
        : selected.filter((item) => item !== task);
      return { ...current, [serviceId]: next };
    });
  }

  function toggleService(serviceId: string) {
    const next = { ...serviceTasks };
    if (next[serviceId]) {
      delete next[serviceId];
    } else {
      next[serviceId] = [];
    }
    const nextServices = Object.keys(next);
    setServiceTasks(next);
    setAssets((current) => current.map((asset) => ({
      ...asset,
      serviceIds: asset.serviceIds.filter((id) => nextServices.includes(id)),
    })).filter((asset) => asset.serviceIds.length > 0));
    setAssetDraft((current) => {
      const linked = current.serviceIds.filter((id) => nextServices.includes(id));
      const serviceIds = linked.length ? linked : [nextServices[0] ?? initialService];
      const availableTypes = Array.from(new Set(serviceIds.flatMap((id) => SERVICE_ONBOARDING[id]?.assetTypes ?? [])));
      return {
        ...current,
        serviceIds,
        assetType: availableTypes.includes(current.assetType) ? current.assetType : availableTypes[0] ?? current.assetType,
      };
    });
  }

  function toggleAssetService(serviceId: string, checked: boolean) {
    setAssetDraft((current) => ({
      ...current,
      serviceIds: checked
        ? [...current.serviceIds, serviceId]
        : current.serviceIds.filter((id) => id !== serviceId),
    }));
  }

  function updateAsset<K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) {
    setAssetDraft((current) => ({ ...current, [key]: value }));
  }

  function addAsset() {
    if (!assetDraft.make.trim() || !assetDraft.model.trim()) {
      toast.error("Enter the make and model of this machine.");
      return;
    }
    if (!assetDraft.serviceIds.length || assetDraft.serviceIds.some((id) => !selectedServices.includes(id))) {
      toast.error("Link this machine to at least one selected service.");
      return;
    }
    if (assetDraft.roadUse === "NEEDS_REVIEW" && !assetDraft.vehicleClass) {
      toast.error("Select the vehicle class or leave it for manual classification review.");
      return;
    }
    for (const serviceId of assetDraft.serviceIds) {
      const definition = SERVICE_ONBOARDING[serviceId];
      for (const field of definition.fields.filter((item) => item.required)) {
        if (field.key === "waltaStatus" && !(serviceTasks.borewell ?? []).some((task) => /new borewell drilling|deepening/i.test(task))) {
          continue;
        }
        if (!(assetDraft.specifications[field.key] ?? "").trim()) {
          toast.error("Complete “" + field.label + "” for this machine.");
          return;
        }
      }
    }
    if (assetDraft.roadUse === "PUBLIC_ROAD" || assetDraft.roadUse === "COMMERCIAL_TRANSPORT") {
      if (assetDraft.registration.length < 4) {
        toast.error("Enter the last four characters of the vehicle registration number.");
        return;
      }
    }
    const normalized = assetDraft.registration.replace(/\s+/g, "").toUpperCase();
    setAssets((current) => [
      ...current,
      {
        ...assetDraft,
        localId: "asset_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
        registration: normalized.slice(-4),
        serial: assetDraft.serial.replace(/\s+/g, "").toUpperCase().slice(-4),
      },
    ]);
    setAssetDraft(emptyAsset(selectedServices[0] ?? initialService));
    toast.success("Machine added to this registration.");
  }

  function removeAsset(index: number) {
    setAssets((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleExistingAssetService(index: number, serviceId: string, checked: boolean) {
    setAssets((current) => current.map((asset, itemIndex) => {
      if (itemIndex !== index) return asset;
      const serviceIds = checked
        ? Array.from(new Set([...asset.serviceIds, serviceId]))
        : asset.serviceIds.filter((id) => id !== serviceId);
      return { ...asset, serviceIds };
    }));
  }

  function onDocumentSelect(key: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (authEnabled) {
      toast.info("Secure document upload is not enabled yet. Your checklist will be saved as pending; no file is uploaded.");
      event.currentTarget.value = "";
      return;
    }
    const requirement = documentRequirements.find((doc) => doc.key === key);
    if (requirement?.secureOnly) {
      toast.info("This identity / tax item must be completed through secure production KYC, not the local preview.");
      event.currentTarget.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Choose a document under 8 MB.");
      event.currentTarget.value = "";
      return;
    }
    setSelectedDocumentKeys((current) => current.includes(key) ? current : [...current, key]);
    // The File object and file name are intentionally not read or persisted.
    event.currentTarget.value = "";
    toast.success("Document marked as ready in this preview. It has not been uploaded.");
  }

  function validateStepOne() {
    if (ownerName.trim().length < 3) return "Enter the owner or authorised representative's full name.";
    if (!phoneSchema.safeParse(verifiedPhoneDigits).success) return "Enter a valid Indian mobile number.";
    if (!verifiedMobile) return authEnabled
      ? "Sign in with a verified Indian mobile number before continuing."
      : "Verify the mobile number before continuing.";
    if (legalName.trim().length < 3) return "Enter the legal / proprietor name.";
    if (tradeName.trim().length < 2) return "Enter the public business / trade name.";
    if (businessAddress.trim().length < 6 || district.trim().length < 2) return "Enter the operating address and district.";
    if (!/^\d{6}$/.test(pincode)) return "Enter a valid six-digit PIN code.";
    if (!site) return "Set the business yard location on the map before continuing.";
    return null;
  }

  function nextFromBusiness() {
    const error = validateStepOne();
    if (error) return toast.error(error);
    setStep(2);
  }

  function nextFromServices() {
    if (!selectedServices.length) return toast.error("Select at least one service.");
    for (const serviceId of selectedServices) {
      if (!(serviceTasks[serviceId] ?? []).length) {
        return toast.error("Select at least one task for " + SERVICE_ONBOARDING[serviceId].label + ".");
      }
    }
    setStep(3);
  }

  function nextFromAssets() {
    if (assetDraft.make.trim() || assetDraft.model.trim()) {
      return toast.error("Press “Add this machine” to include the machine in your application.");
    }
    if (!completedAssets.length) return toast.error("Add at least one machine or equipment asset.");
    for (const asset of completedAssets) {
      if (!asset.serviceIds.length) return toast.error("Link every machine to at least one service.");
      if (asset.roadUse === "NEEDS_REVIEW" && !asset.vehicleClass) {
        return toast.error("Complete the road-use classification for every machine.");
      }
    }
    const requiresBorewellRig = (serviceTasks.borewell ?? []).some((task) => /new borewell drilling|deepening/i.test(task));
    if (requiresBorewellRig && !completedAssets.some((asset) => asset.serviceIds.includes("borewell") && /drilling rig/i.test(asset.assetType))) {
      return toast.error("New drilling or deepening requires a separate drilling-rig asset linked to Borewell services.");
    }
    setStep(4);
  }

  async function submitForReview() {
    if (!verifiedMobile) {
      return toast.error(authEnabled
        ? "A verified Indian mobile number is required for provider registration."
        : "Verify the mobile number first.");
    }
    if (!selectedServices.length || !completedAssets.length) {
      return toast.error("Add at least one service and at least one machine.");
    }
    if (!declarationAccepted) {
      return toast.error("Accept the provider declaration before submitting.");
    }

    if (authEnabled) {
      if (authSessionPending || !authSession?.user?.id) {
        return toast.error("Your sign-in session is still loading. Try again.");
      }
      setIsSubmitting(true);
      try {
        const result = await submitCurrentProviderApplication({
          data: {
            business: {
              ownerFullName: ownerName.trim(),
              legalName: legalName.trim(),
              tradeName: tradeName.trim(),
              businessType,
              address: businessAddress.trim(),
              district: district.trim(),
              city: site?.city || district.trim(),
              area: site?.area || businessAddress.trim(),
              state: site?.state || "Telangana",
              pincode,
              gstStatus,
              aggregateTurnoverBand,
              udyamProvided,
              authorisedRepresentative,
            },
            profile: {
              latitude: site?.lat ?? 17.385,
              longitude: site?.lng ?? 78.4867,
              yearsExperience: Number(years) || 0,
              languages: languages.split(",").map((item) => item.trim()).filter(Boolean),
              bio: bio.trim(),
            },
            services: selectedServices.map((serviceId) => ({
              serviceId,
              selectedTasks: serviceTasks[serviceId] ?? [],
              specifications: {},
            })),
            assets: completedAssets.map((asset) => ({
              serviceIds: asset.serviceIds,
              assetType: asset.assetType,
              make: asset.make.trim(),
              model: asset.model.trim(),
              yearOfManufacture: asset.year ? Number(asset.year) : null,
              ownership: asset.ownership,
              roadUse: asset.roadUse,
              vehicleClass: asset.vehicleClass,
              registrationLast4: asset.registration || null,
              serialLast4: asset.serial || null,
              specifications: asset.specifications,
            })),
            declarationAccepted: true,
          },
        });
        setIsProductionSubmitted(true);
        setCreatedProviderId(result.businessId);
        setStep(5);
        toast.success(result.alreadyExists
          ? "This business already has an application on your account."
          : "Provider application saved securely and submitted for review.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not submit provider application.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const now = Date.now();
    const providerId = "yard_" + phone;
    const business: ProviderBusinessProfile = {
      ownerFullName: ownerName.trim(),
      legalName: legalName.trim(),
      tradeName: tradeName.trim(),
      businessType,
      address: businessAddress.trim(),
      district: district.trim(),
      pincode,
      state: site?.state || "Telangana",
      gstStatus,
      aggregateTurnoverBand,
      udyamProvided,
      authorisedRepresentative,
      declarationAcceptedAt: now,
    };

    const registrations: ProviderServiceRegistration[] = selectedServices.map((serviceId) => ({
      serviceId,
      selectedTasks: serviceTasks[serviceId] ?? [],
      specifications: {},
      status: "SUBMITTED",
      selectedDocumentKeys: selectedDocumentKeys,
      submittedAt: now,
    }));

    const providerAssets: ProviderAsset[] = completedAssets.map((asset, index) => ({
      id: providerId + "_" + (asset.localId ?? "asset_" + (index + 1)),
      serviceIds: asset.serviceIds,
      assetType: asset.assetType,
      make: asset.make.trim(),
      model: asset.model.trim(),
      yearOfManufacture: asset.year ? Number(asset.year) : undefined,
      ownership: asset.ownership,
      roadUse: asset.roadUse,
      vehicleClass: asset.vehicleClass,
      registrationLast4: asset.registration || undefined,
      serialLast4: asset.serial || undefined,
      specifications: asset.specifications,
      selectedDocumentKeys,
      status: "SUBMITTED",
    }));

    const documents: ProviderOnboardingDocument[] = documentRequirements.map((document) => ({
      key: document.key,
      label: document.label,
      selectedInPreview: selectedDocumentKeys.includes(document.key),
      requiredForApproval: document.requiredForApproval,
      jobSpecific: Boolean(document.jobSpecific),
    }));

    const onboarding: ProviderOnboardingProfile = {
      business,
      services: registrations,
      assets: providerAssets,
      documents,
      businessStatus: "SUBMITTED",
      payoutStatus: "NOT_STARTED",
      accountCreatedAt: now,
    };

    const serviceLabels = selectedServices.map((id) => SERVICE_ONBOARDING[id].label);
    const machineNames = providerAssets.map((asset) => asset.make + " " + asset.model);
    const provider: Provider = {
      id: providerId,
      phone: verifiedPhoneDigits,
      name: tradeName.trim(),
      city: site?.city || district.trim(),
      area: site?.area || businessAddress.trim(),
      state: site?.state || "Telangana",
      lat: site?.lat ?? 17.385,
      lng: site?.lng ?? 78.4867,
      services: selectedServices,
      equipment: machineNames.join(", "),
      machines: machineNames,
      years: Number(years) || 0,
      jobs: 0,
      rating: 0,
      reviewCount: 0,
      replyMin: 20,
      rates: {},
      verified: {
        identity: false,
        equipment: false,
        insurance: false,
        walta: null,
      },
      approved: false,
      online: false,
      bio: bio.trim() || "New provider. Verification is in progress.",
      languages: languages.split(",").map((item) => item.trim()).filter(Boolean),
      reviews: [],
      onboarding,
    };

    addProvider(provider);
    setIsProductionSubmitted(false);
    setCreatedProviderId(providerId);
    setStep(5);
    toast.success("Application saved in the local preview and remains unapproved.");
  }

  function addAnotherService() {
    setCreatedProviderId(null);
    setStep(2);
    toast.info("Select another service, add its machine and submit the updated application.");
  }

  const stepNames = ["Business", "Services", "Machines", "Documents", "Submitted"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-field">Provider registration</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Build your service profile</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            One business account can register multiple services and many machines. Each service and machine is reviewed separately.
          </p>
        </div>
        <Link to="/desk" className="text-sm font-semibold underline underline-offset-4">Provider desk</Link>
      </div>

      <div className="mt-6 grid grid-cols-5 gap-1">
        {stepNames.map((label, index) => (
          <div key={label} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", index + 1 <= step ? "bg-field" : "bg-line")} />
            <p className={cn("mt-2 truncate text-[10px] font-semibold sm:text-xs", index + 1 === step ? "text-field" : "text-muted")}>{label}</p>
          </div>
        ))}
      </div>

      {step === 1 && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-line bg-card p-5">
          <SectionHeading title="1. Owner and business details" subtitle="Register the person responsible for this business, then enter the business identity." />
          <Field label="Owner / authorised representative full name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="As shown on identity proof" className={controlClass} />
          </Field>
          {authEnabled ? (
            <div className="rounded-xl border border-line bg-paper p-3 text-sm">
              {authSessionPending ? (
                <p className="text-muted">Checking your verified mobile session…</p>
              ) : verifiedMobile ? (
                <p className="font-semibold text-green-700">Mobile verified: {verifiedPhone}</p>
              ) : (
                <>
                  <p className="font-semibold">Verified mobile sign-in required</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Provider registration uses the phone number verified by Better Auth. The preview OTP is not accepted in production.
                  </p>
                  <Link to="/account" className="mt-2 inline-block text-sm font-semibold underline">Open account sign-in</Link>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Field label="Mobile number">
                  <input value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setPhoneVerified(false); }} placeholder="10-digit Indian mobile number" inputMode="numeric" className={controlClass} />
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => {
                    if (!phoneSchema.safeParse(phone).success) return toast.error("Enter a valid 10-digit mobile number.");
                    setPreviewOtp("482609");
                    toast.info("Preview OTP generated: 482609. Real SMS OTP is not active in this prototype.");
                  }}>Send preview OTP</Button>
                </div>
              </div>
              {previewOtp && (
                <div className="grid gap-2 rounded-xl bg-paper p-3 sm:grid-cols-[1fr_auto]">
                  <input value={previewOtp} onChange={(e) => { setPreviewOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setPhoneVerified(false); }} placeholder="Enter 6-digit OTP" inputMode="numeric" className={controlClass} />
                  <Button type="button" onClick={() => {
                    if (previewOtp !== "482609") return toast.error("The preview OTP is 482609.");
                    setPhoneVerified(true);
                    toast.success("Mobile verified in preview only.");
                  }}>Verify mobile</Button>
                </div>
              )}
              <p className="text-xs text-muted">Preview mode uses the fixed demo code. Production requires real verified mobile sign-in.</p>
            </>
          )}          <Field label="Business legal structure">
            <select value={businessType} onChange={(e) => setBusinessType(e.target.value as ProviderBusinessType)} className={controlClass}>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Legal name / proprietor name">
            <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Name on applicable business / tax records" className={controlClass} />
          </Field>
          <Field label="Business / trade name shown to customers">
            <input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="e.g. Sri Sai Borewell Works" className={controlClass} />
          </Field>
          <Field label="Business / yard address">
            <textarea value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Door / street / village / mandal" className={cn(controlClass, "min-h-20 py-3")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="District">
              <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Warangal" className={controlClass} />
            </Field>
            <Field label="PIN code">
              <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digits" inputMode="numeric" className={controlClass} />
            </Field>
          </div>
          <Field label="GST registration status">
            <select value={gstStatus} onChange={(e) => setGstStatus(e.target.value as ProviderBusinessProfile["gstStatus"])} className={controlClass}>
              <option value="REGISTERED">Registered — GSTIN will be verified securely</option>
              <option value="NOT_REGISTERED">Not registered — tax eligibility must be checked</option>
              <option value="NOT_SURE">Not sure — request tax review</option>
            </select>
          </Field>
          <Field label="Approximate all-India aggregate turnover from all business activities">
            <select value={aggregateTurnoverBand} onChange={(e) => setAggregateTurnoverBand(e.target.value as ProviderBusinessProfile["aggregateTurnoverBand"])} className={controlClass}>
              <option value="UNDER_20_LAKH">Below ₹20 lakh</option>
              <option value="20_LAKH_OR_MORE">₹20 lakh or more</option>
              <option value="NOT_SURE">Not sure — request tax review</option>
            </select>
            <span className="text-xs leading-5 text-muted">This is a tax-review declaration, not a final GST eligibility decision. Aggregate turnover, inter-state supply, notified services and the platform's tax role must be checked by Fieldly's CA.</span>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={udyamProvided} onChange={(e) => setUdyamProvided(e.target.checked)} className="mt-1 size-4" />
            <span>We have an Udyam / MSME certificate (optional).</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={authorisedRepresentative} onChange={(e) => setAuthorisedRepresentative(e.target.checked)} className="mt-1 size-4" />
            <span>I am registering as an authorised representative, not the owner / proprietor.</span>
          </label>
          <Field label="Years in operation (optional)">
            <input value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={controlClass} />
          </Field>
          <Field label="Languages spoken (comma-separated)">
            <input value={languages} onChange={(e) => setLanguages(e.target.value)} className={controlClass} />
          </Field>
          <Field label="Business description (optional)">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Experience, service area, special capabilities…" className={cn(controlClass, "min-h-20 py-3")} />
          </Field>
          <div className="rounded-xl bg-paper p-3 text-xs leading-5 text-muted">
            Yard location: {site ? site.label + ", " + site.area : "Not selected"}. Set the correct yard / equipment base pin from the home page. This is the provider's operating base, not a live vehicle location.
            <Link to="/" className="ml-1 font-semibold underline">Change location</Link>
          </div>
          <Button onClick={nextFromBusiness}>Continue to services</Button>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-line bg-card p-5">
          <SectionHeading title="2. Choose the services you provide" subtitle="Select as many service categories as you genuinely offer. Then select the specific jobs you can perform in each category." />
          <div className="grid gap-3">
            {SERVICES.map((service) => {
              const selected = Object.prototype.hasOwnProperty.call(serviceTasks, service.id);
              const definition = SERVICE_ONBOARDING[service.id];
              return (
                <article key={service.id} className={cn("rounded-2xl border p-4", selected ? "border-field bg-field/5" : "border-line")}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleService(service.id)} className="size-5" />
                    <ServiceIcon name={service.icon} className="size-5" />
                    <span className="font-semibold">{service.name}</span>
                  </label>
                  {selected && definition && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Select the work you offer</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {definition.tasks.map((task) => (
                          <label key={task} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={(serviceTasks[service.id] ?? []).includes(task)} onChange={(e) => updateServiceTask(service.id, task, e.target.checked)} className="mt-1 size-4" />
                            <span>{task}</span>
                          </label>
                        ))}
                      </div>

                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted">You can add another service after submitting this application. Each service has a separate review status; approval for one service does not automatically approve another.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={nextFromServices}>Continue to machines</Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-line bg-card p-5">
          <SectionHeading title="3. Add your machines and vehicles" subtitle="Add each physical machine separately. One business may own several rigs, tractors, cranes, tippers or attachments." />
          <div className="grid gap-3">
            {assets.map((asset, index) => (
              <article key={index} className="rounded-2xl border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{asset.make} {asset.model}</p>
                    <p className="text-xs text-muted">{asset.assetType} · {asset.serviceIds.map((id) => SERVICE_ONBOARDING[id]?.label).join(", ")}</p>
                    <p className="mt-1 text-xs text-muted">Registration / serial ending: {asset.registration || asset.serial || "Not provided"}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {selectedServices.map((serviceId) => (
                        <label key={serviceId} className="flex items-center gap-1 text-[11px] text-muted">
                          <input type="checkbox" checked={asset.serviceIds.includes(serviceId)} onChange={(e) => toggleExistingAssetService(index, serviceId, e.target.checked)} className="size-3.5" />
                          {SERVICE_ONBOARDING[serviceId].label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeAsset(index)} className="text-xs font-semibold text-danger underline">Remove</button>
                </div>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-line bg-paper/40 p-4">
            <p className="font-semibold">New machine / vehicle</p>
            <div className="mt-3 grid gap-3">
              <Field label="Link this machine to services">
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedServices.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={assetDraft.serviceIds.includes(id)} onChange={(e) => toggleAssetService(id, e.target.checked)} className="size-4" />
                      {SERVICE_ONBOARDING[id].label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Machine / vehicle type">
                <select value={assetDraft.assetType} onChange={(e) => updateAsset("assetType", e.target.value)} className={controlClass}>
                  {Array.from(new Set(assetDraft.serviceIds.flatMap((id) => SERVICE_ONBOARDING[id]?.assetTypes ?? []))).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Manufacturer / make">
                  <input value={assetDraft.make} onChange={(e) => updateAsset("make", e.target.value)} placeholder="JCB, Tata, Mahindra…" className={controlClass} />
                </Field>
                <Field label="Model">
                  <input value={assetDraft.model} onChange={(e) => updateAsset("model", e.target.value)} placeholder="3DX, 470, 575…" className={controlClass} />
                </Field>
              </div>
              <Field label="Year of manufacture (optional)">
                <input type="number" min="1950" max={new Date().getFullYear()} value={assetDraft.year} onChange={(e) => updateAsset("year", e.target.value)} placeholder="2022" className={controlClass} />
              </Field>
              <Field label="Ownership / possession">
                <select value={assetDraft.ownership} onChange={(e) => updateAsset("ownership", e.target.value as ProviderAssetOwnership)} className={controlClass}>
                  {Object.entries(OWNERSHIP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
                <Field label="How does it move / operate?">
                <select value={assetDraft.roadUse} onChange={(e) => updateAsset("roadUse", e.target.value as ProviderAssetRoadUse)} className={controlClass}>
                  {Object.entries(ROAD_USE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <span className="text-xs leading-5 text-muted">Choose the real movement pattern. If unsure, leave “Not sure” and Fieldly must manually classify it before approval.</span>
              </Field>
              {(assetDraft.roadUse === "PUBLIC_ROAD" || assetDraft.roadUse === "COMMERCIAL_TRANSPORT") && (
                <>
                  <Field label="Vehicle class from RC">
                    <select value={assetDraft.vehicleClass} onChange={(e) => updateAsset("vehicleClass", e.target.value)} className={controlClass}>
                      <option value="TRANSPORT">Transport / goods carriage</option>
                      <option value="CONSTRUCTION_EQUIPMENT">Construction equipment vehicle</option>
                      <option value="AGRICULTURAL">Agricultural tractor / vehicle</option>
                      <option value="OTHER">Other — reviewer to classify</option>
                    </select>
                  </Field>
                  <Field label="Registration number — last four characters only in preview" hint="In production, the complete registration and RC image must be submitted through a protected document upload and matched to VAHAN / RTO records.">
                    <input value={assetDraft.registration} onChange={(e) => updateAsset("registration", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-4))} placeholder="Last 4 only" maxLength={4} className={controlClass} />
                  </Field>
                </>
              )}
              <Field label="Serial / chassis suffix (optional, last four only)">
                <input value={assetDraft.serial} onChange={(e) => updateAsset("serial", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-4))} placeholder="Last 4 only" maxLength={4} className={controlClass} />
              </Field>
              {assetDraft.serviceIds.flatMap((id) => SERVICE_ONBOARDING[id]?.fields ?? []).map((field, index) => (
                <Field key={field.key + "_" + index} label={field.label} hint={field.hint}>
                  {field.kind === "select" ? (
                    <select value={assetDraft.specifications[field.key] ?? ""} onChange={(e) => updateAsset("specifications", { ...assetDraft.specifications, [field.key]: e.target.value })} className={controlClass}>
                      <option value="">Select</option>
                      {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input type={field.kind === "number" ? "number" : "text"} value={assetDraft.specifications[field.key] ?? ""} onChange={(e) => updateAsset("specifications", { ...assetDraft.specifications, [field.key]: e.target.value })} placeholder={field.placeholder ?? ""} className={controlClass} />
                  )}
                </Field>
              ))}
              <Button type="button" variant="secondary" onClick={addAsset}>Add this machine</Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={nextFromAssets}>Continue to documents</Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-line bg-card p-5">
          <SectionHeading title="4. Compliance documents and verification" subtitle="The checklist changes based on your entity, services and machine types. A selected file is not considered verified." />
          <div className="rounded-xl border border-gold/30 bg-gold-soft p-3 text-xs leading-5 text-gold">
            Preview safety: this screen does not upload or retain documents. Sensitive identity, PAN, bank and KYC data must go directly through secure production verification. A Fieldly reviewer must check authenticity, expiry and that the document matches the selected machine.
          </div>
          {documentRequirements.filter((doc) => !doc.jobSpecific).map((doc) => (
            <div key={doc.key} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{doc.label} {doc.requiredForApproval && <span className="text-danger">*</span>}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{doc.description}</p>
                <p className="mt-1 text-[11px] font-semibold text-muted">
                  {doc.secureOnly ? "Secure KYC in production" : selectedDocumentKeys.includes(doc.key) ? "Marked ready in preview only" : "Not submitted"}
                </p>
              </div>
              {doc.secureOnly ? (
                <span className="shrink-0 rounded-full bg-paper px-3 py-2 text-xs font-semibold">Secure production step</span>
              ) : (
                <label className="shrink-0 cursor-pointer rounded-xl border border-line px-3 py-2 text-center text-xs font-semibold">
                  Select file
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => onDocumentSelect(doc.key, e)} />
                </label>
              )}
            </div>
          ))}
          {documentRequirements.filter((doc) => doc.jobSpecific).map((doc) => (
            <div key={doc.key} className="rounded-xl bg-paper p-3">
              <p className="text-sm font-semibold">{doc.label} <span className="text-xs text-muted">(per job)</span></p>
              <p className="mt-1 text-xs leading-5 text-muted">{doc.description}</p>
            </div>
          ))}
          <div className="rounded-xl border border-line p-3">
            <p className="font-semibold">Payout onboarding</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Not collected in this local preview. In production, after Fieldly and Cashfree approve the provider, secure onboarding will collect the account holder name, bank account number and IFSC, or a supported UPI VPA, and verify the destination. A cancelled cheque / bank proof may be requested if the gateway requires it. Payout status will remain pending until Cashfree confirms the vendor is active.
            </p>
            <p className="mt-2 text-xs font-semibold text-muted">Do not enter account numbers, IFSC, PAN, Aadhaar or bank details in this preview.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={() => {
              const missing = documentRequirements.filter((doc) => doc.requiredForApproval && !doc.secureOnly && !selectedDocumentKeys.includes(doc.key));
              if (missing.length) toast.info("Some required documents are still pending. You can still submit for manual review.");
              setStep(5);
            }}>Review application</Button>
          </div>
        </section>
      )}

      {step === 5 && !createdProviderId && (
        <section className="mt-6 grid gap-4 rounded-3xl border border-line bg-card p-5">
          <SectionHeading title="5. Review and submit" subtitle="Check the business, services, equipment and documents before sending your application for review." />
          <Summary label="Owner / contact" value={ownerName + " · " + verifiedPhoneDigits + (authEnabled ? " · Better Auth verified" : " · mobile preview-verified")} />
          <Summary label="Business" value={tradeName + " · " + legalName + " · " + BUSINESS_TYPE_LABELS[businessType]} />
          <Summary label="Business address" value={businessAddress + ", " + district + " – " + pincode} />
          <Summary label="Services" value={selectedServices.map((id) => SERVICE_ONBOARDING[id].label + " (" + (serviceTasks[id] ?? []).length + " task types)").join("; ")} />
          <Summary label="Machines" value={completedAssets.map((asset) => asset.make + " " + asset.model + " — " + asset.assetType).join("; ")} />
          <Summary label="Documents" value={authEnabled ? (documentRequirements.length + " checklist requirements saved; no files uploaded yet.") : (selectedDocumentKeys.length + " marked ready in preview; none have been uploaded or verified.")} />
          <div className="rounded-xl bg-paper p-3 text-xs leading-5 text-muted">
            By submitting, you confirm that the business information is accurate, you are authorised to list the equipment, and all required licences, permits, insurance and site-specific approvals will remain valid for the work offered. Misleading claims, expired documents, unsafe equipment or missing legal permission may lead to rejection or suspension.
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
            <input type="checkbox" checked={declarationAccepted} onChange={(event) => setDeclarationAccepted(event.target.checked)} className="mt-0.5 size-4 accent-current" />
            <span>I confirm that the details are accurate and accept the provider registration declaration.</span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(4)}>Back</Button>
            <Button onClick={() => void submitForReview()} disabled={isSubmitting || !declarationAccepted}>
              {isSubmitting ? "Submitting…" : "Submit provider application"}
            </Button>
          </div>
        </section>
      )}

      {step === 5 && createdProviderId && (
        <section className="mt-6 rounded-3xl border border-line bg-card p-5">
          <div className="grid size-12 place-items-center rounded-2xl bg-gold-soft text-xl">✓</div>
          <h2 className="mt-4 font-display text-2xl font-bold">Application submitted</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {isProductionSubmitted
              ? "Your application has been saved in the MakeService database. It is submitted for review and remains unapproved. Document files have not been uploaded, and customers cannot book this listing yet."
              : "Your preview application has been saved on this browser. It has not uploaded documents, completed real OTP/KYC or been approved by an administrator. Customers cannot book the listing yet."}
          </p>
          <div className="mt-4 grid gap-2">
            {selectedServices.map((id) => (
              <div key={id} className="flex items-center justify-between rounded-xl border border-line p-3">
                <span className="text-sm font-semibold">{SERVICE_ONBOARDING[id].label}</span>
                <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold">{statusText.SUBMITTED}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 rounded-xl bg-paper p-3 text-xs leading-5 text-muted">
            <p>Business review: Submitted</p>
            <p>Machine and document review: Submitted separately per item</p>
            <p>Payout onboarding: Not started</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {isProductionSubmitted ? (
              <Button variant="secondary" onClick={() => void navigate({ to: "/desk" })}>Open provider dashboard</Button>
            ) : (
              <>
                <Button onClick={addAnotherService}>Add another service</Button>
                <Button variant="secondary" onClick={() => {
                  signInProvider(createdProviderId);
                  toast.info("Preview desk opened. Your account remains unapproved.");
                  void navigate({ to: "/desk" });
                }}>Open provider desk</Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="font-display text-xl font-bold">{title}</h2><p className="mt-1 text-sm leading-5 text-muted">{subtitle}</p></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5"><span className="text-sm font-semibold">{label}</span>{children}{hint && <span className="text-xs leading-5 text-muted">{hint}</span>}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm leading-5">{value}</p></div>;
}
