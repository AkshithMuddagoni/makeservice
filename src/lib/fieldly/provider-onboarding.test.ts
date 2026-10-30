import assert from "node:assert/strict";
import test from "node:test";

import {
  getProviderDocumentRequirements,
  isValidProviderOnboardingService,
} from "./provider-onboarding.ts";

const base = {
  businessType: "PROPRIETORSHIP" as const,
  gstStatus: "NOT_REGISTERED" as const,
  authorisedRepresentative: false,
  services: [],
  assets: [],
};

function keys(input: Parameters<typeof getProviderDocumentRequirements>[0]) {
  return new Set(getProviderDocumentRequirements(input).map((item) => item.key));
}

test("borewell drilling adds Telangana WALTA rig proof and job-level site permission", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "borewell", selectedTasks: ["New borewell drilling"] }],
    assets: [{
      serviceIds: ["borewell"],
      ownership: "OWNED",
      roadUse: "TRAILER_MOVED",
      vehicleClass: "CONSTRUCTION_EQUIPMENT",
      assetType: "Drilling rig",
    }],
  });

  assert.equal(result.has("WALTA_FORM16"), true);
  assert.equal(result.has("WALTA_ACKNOWLEDGEMENT"), true);
  assert.equal(result.has("SITE_PERMISSION_JOB"), true);
});

test("a tractor-only service does not demand borewell WALTA paperwork", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "tractor", selectedTasks: ["Ploughing"] }],
    assets: [{
      serviceIds: ["tractor"],
      ownership: "OWNED",
      roadUse: "PUBLIC_ROAD",
      vehicleClass: "AGRICULTURAL",
      assetType: "Agricultural tractor",
    }],
  });

  assert.equal(result.has("WALTA_FORM16"), false);
  assert.equal(result.has("SITE_PERMISSION_JOB"), false);
  assert.equal(result.has("VEHICLE_RC"), true);
  assert.equal(result.has("THIRD_PARTY_INSURANCE"), true);
  assert.equal(result.has("OPERATOR_DL"), true);
  assert.equal(result.has("FITNESS_CERTIFICATE"), false);
  assert.equal(result.has("TRANSPORT_PERMIT"), false);
});

test("goods carriage road use adds conditional transport papers", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "tipper", selectedTasks: ["Excavated soil movement"] }],
    assets: [{
      serviceIds: ["tipper"],
      ownership: "OWNED",
      roadUse: "COMMERCIAL_TRANSPORT",
      vehicleClass: "TRANSPORT",
      assetType: "Tipper truck",
    }],
  });

  assert.equal(result.has("VEHICLE_RC"), true);
  assert.equal(result.has("THIRD_PARTY_INSURANCE"), true);
  assert.equal(result.has("FITNESS_CERTIFICATE"), true);
  assert.equal(result.has("TRANSPORT_PERMIT"), true);
  assert.equal(result.has("ROAD_TAX_RECEIPT"), true);
});

test("off-road construction machinery is not incorrectly asked for a road RC or goods permit", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "jcb", selectedTasks: ["Foundation / basement excavation"] }],
    assets: [{
      serviceIds: ["jcb"],
      ownership: "LEASED",
      roadUse: "TRAILER_MOVED",
      vehicleClass: "CONSTRUCTION_EQUIPMENT",
      assetType: "Backhoe loader",
    }],
  });

  assert.equal(result.has("VEHICLE_RC"), false);
  assert.equal(result.has("TRANSPORT_PERMIT"), false);
  assert.equal(result.has("ASSET_OWNER_NOC"), true);
  assert.equal(result.has("ASSET_OWNERSHIP_PROOF"), true);
});

test("crane service requires machine load-chart, lifting inspection and operator evidence", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "crane", selectedTasks: ["Loading and unloading"] }],
    assets: [{
      serviceIds: ["crane"],
      ownership: "OWNED",
      roadUse: "TRAILER_MOVED",
      vehicleClass: "CONSTRUCTION_EQUIPMENT",
      assetType: "Mobile crane",
    }],
  });

  assert.equal(result.has("CRANE_LOAD_CHART"), true);
  assert.equal(result.has("CRANE_INSPECTION"), true);
  assert.equal(result.has("CRANE_OPERATOR_COMPETENCE"), true);
  assert.equal(result.has("OPERATOR_ROSTER"), true);
});

test("potable tanker service requires water quality evidence and flags possible FSSAI classification", () => {
  const result = keys({
    ...base,
    services: [{ serviceId: "tanker", selectedTasks: ["Potable / drinking water"] }],
    assets: [{
      serviceIds: ["tanker"],
      ownership: "OWNED",
      roadUse: "COMMERCIAL_TRANSPORT",
      vehicleClass: "TRANSPORT",
      assetType: "Water tanker truck",
    }],
  });

  assert.equal(result.has("WATER_SOURCE_EVIDENCE"), true);
  assert.equal(result.has("POTABLE_WATER_QUALITY"), true);
  assert.equal(result.has("POTABLE_WATER_FBO_LICENSE"), true);
});

test("GST certificate is conditional and Udyam remains optional", () => {
  const registered = getProviderDocumentRequirements({
    ...base,
    gstStatus: "REGISTERED",
    services: [{ serviceId: "jcb", selectedTasks: ["Digging"] }],
  });
  const unregistered = getProviderDocumentRequirements({
    ...base,
    gstStatus: "NOT_REGISTERED",
    services: [{ serviceId: "jcb", selectedTasks: ["Digging"] }],
  });

  assert.equal(registered.some((item) => item.key === "GST_CERTIFICATE" && item.requiredForApproval), true);
  assert.equal(unregistered.some((item) => item.key === "GST_CERTIFICATE"), false);
  assert.equal(registered.some((item) => item.key === "UDYAM_CERTIFICATE" && !item.requiredForApproval), true);
});

test("identity and operator roster are always routed through secure KYC, not preview uploads", () => {
  const result = getProviderDocumentRequirements({
    ...base,
    services: [{ serviceId: "jcb", selectedTasks: ["Digging"] }],
  });
  assert.equal(result.find((item) => item.key === "OWNER_IDENTITY_KYC")?.secureOnly, true);
  assert.equal(result.find((item) => item.key === "PAN_KYC")?.secureOnly, true);
  assert.equal(result.find((item) => item.key === "OPERATOR_ROSTER")?.secureOnly, true);
});

test("service capability selection accepts only tasks from that service", () => {
  assert.equal(isValidProviderOnboardingService({
    serviceId: "borewell",
    selectedTasks: ["New borewell drilling", "Flushing / cleaning"],
  }), true);
  assert.equal(isValidProviderOnboardingService({
    serviceId: "borewell",
    selectedTasks: ["Crane hire"],
  }), false);
  assert.equal(isValidProviderOnboardingService({
    serviceId: "not-a-service",
    selectedTasks: ["Anything"],
  }), false);
  assert.equal(isValidProviderOnboardingService({
    serviceId: "tractor",
    selectedTasks: [],
  }), false);
});
