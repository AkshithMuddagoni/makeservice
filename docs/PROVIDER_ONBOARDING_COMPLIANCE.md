# Fieldly provider onboarding and service-compliance model

**Scope:** independent equipment owners, machinery businesses and local service operators in India, initially Telangana. This is an operating design and product checklist, not a legal opinion. State/local licensing, machine classification, business form, job/site and use conditions matter. Have a Telangana transport / groundwater compliance adviser and an Indian CA review the launch checklist.

## Product structure

Use one verified provider account / legal business profile, then allow multiple service registrations and multiple physical assets under that business.

- **Person / account:** owner or authorised representative, mobile OTP, account security, role.
- **Business profile:** legal name, trade name, legal structure, operating address, district/PIN, tax status, authorised representative and optional Udyam.
- **Service registration:** one row per category with selected work types, service-area and relevant capability details.
- **Machine / vehicle asset:** one row per physical asset with make, model, manufacture year, serial suffix, ownership, operating mode, road-use classification and service links.
- **Operator roster:** each driver / machine operator linked to the machines and services they may operate, with role, contact, experience, training and licence evidence where relevant.
- **Documents:** business-, service-, asset-, operator- and job-specific. Keep file metadata, verification result, issue/expiry dates and reviewer audit separately.
- **Payout identity:** a separate secure Cashfree vendor onboarding and bank / UPI destination verification step. Never mix bank KYC with ordinary profile form storage.

A business can be approved for tractor work while a separate rig, crane or tipper awaits its own documents. A green check on one service must never approve every asset or service in that business.

## Onboarding wizard

### 1. Owner and mobile verification

Ask for owner / authorised representative's legal name and a mobile number. Verify with real OTP in production (fixed preview OTP is only a demo). Record consent to the privacy notice and declaration that the person is authorised to register the business.

Production security controls: OTP expiry, send/verify rate limits, abuse throttling, replay prevention, device/session controls, and no sensitive data in analytics/logs.

### 2. Business profile

Ask for:
- Legal structure: individual owner, sole proprietorship, partnership, LLP, private/public limited company or other.
- Legal name exactly as appropriate to the owner's/entity's records; public trading name separately.
- Principal business / yard address, district, PIN code and base map pin.
- Whether the owner is acting for the entity or is an authorised representative.
- GST status (registered / not registered / unsure) and a turnover band for tax review.
- Udyam / MSME status as optional information.

Conditional business evidence:
- Individual / proprietor: identity/PAN KYC, address proof and an acceptable business or trade evidence appropriate to the activity.
- Partnership: partnership deed, partner/signatory authority and entity PAN.
- LLP: incorporation / LLP agreement and designated partner authority.
- Company: certificate of incorporation / CIN and board or authorised-signatory resolution.
- If the registrant is not the owner: an owner / entity authorisation.
- GST certificate only if the business says it is GST-registered; validate GSTIN and legal name.
- Local trade licence, Shop and Establishments registration, municipal/panchayat permission, labour registrations, fire NOC or other premises/business registration only when the actual activity, premises, staff and local rules require them.
- Udyam certificate is optional, not a universal condition and not a separate registration for each service.

Do not make one generic “GST certificate mandatory for everyone” rule. CBIC Notification 65/2017 exempts eligible suppliers making services (other than Section 9(5) services) through a TCS e-commerce operator from compulsory registration when all-India aggregate turnover stays within the specified threshold. The supplier's complete aggregate turnover, service classification, other registrations and any exceptions must be reviewed by Fieldly's CA. Fieldly's own ECO registration/TCS obligations are separate from the provider's GST status.

### 3. Choose service categories and work types

Allow multiple categories. For every selected category, show only its work types and service-specific specifications. A provider must select at least one task in every category they register.

**Borewell services**
- New borewell drilling.
- Deepening / re-boring.
- Flushing / cleaning.
- Camera inspection.
- Pump installation / removal / repair.
- Water-yield assessment.
- Site / groundwater survey.
- Recharge / maintenance.

The legal registration attaches to the drilling rig / owner, not simply to a profile label saying “borewell”.

**JCB / excavation**
- Foundation and basement excavation, trenching, drainage, site clearing, grading, pond/canal excavation, loading, backfilling, breaker, auger and attachments.

**Crane / lifting**
- Loading/unloading, construction-material lifting, machinery/tank/generator placement, steel/structural lifting and pick-and-carry.
- Record crane type, rated safe working load (SWL), load chart, boom, outriggers / setup, rigging and lifting accessories.

**Tractor**
- Ploughing, rotavator, cultivator, harrowing, sowing, inter-cultivation, levelling and trailer work.
- Record horsepower and implements. Ask separately whether the tractor/trailer is used for agricultural purposes or commercial goods transport.

**Water tanker**
- Construction / curing, agriculture, non-potable domestic and potable/drinking water.
- Record capacity, source, tank material, cleaning and water-quality information.
- Do not allow “drinking water” marketing without verified source and current test evidence. FSSAI registration/licensing applies to Food Business Operators; whether bulk tanker supply is a food business must be classified by the activity, not assumed for every water tanker.

**Tipper / goods transport**
- Soil, aggregate, construction material, debris and regulated sand/mineral loads.
- Record permitted payload from vehicle records, axle configuration, load covering and material type.
- Source and transit documents for regulated mineral loads are checked per job / load, not treated as a permanent general-purpose vehicle licence.

**Agriculture equipment**
- Harvester, reaper, thresher, power sprayer, seed drill, baler, mulcher and other machine-specific operations.
- Record working width/output, tractor compatibility and attachments.

**Construction equipment**
- Concrete mixers/pumps, compaction/rollers, generators, material hoists, scaffolding and other equipment.
- Record rated capacity/output and maintenance/inspection evidence.

**Rental**
- With operator / without operator (when lawful and safe), daily/weekly/monthly rental, attachments and accessories.
- Record minimum rental term, delivery, security/deposit policy, damage and extension terms.

An “Other” category should require a manual description and manual compliance review before it can be listed.

### 4. Add every physical asset separately

Required fields in production:
- Asset type, make, model, year of manufacture.
- Ownership: owned, leased/financed, or third-party.
- Registration/vehicle class, full registration number and RC where the vehicle is road-registered.
- Chassis / serial / equipment identification where available.
- Service links (which of this business's approved services can use this exact machine).
- Road use: public-road self-propelled, commercial transport, trailer / low-bed movement, off-road/private-site-only, or stationary equipment.
- Rated capacity and service-specific specifications.
- Current photos from multiple angles, machine plate / serial plate and relevant attachments.
- Maintenance/inspection status, defects and insurance.
- If leased/third-party: valid lease, owner's NOC / hire authorisation and confirmation that the equipment may be offered to customers.

Do not treat “machine name” as proof that the applicant owns it or may legally hire it out.

### 5. Conditional vehicle / equipment documents

The correct list depends on the actual legal class and use. Ask the provider to choose the intended use and use the RC / registration record to verify it. Do not demand every certificate for every asset.

| Asset / use | Verification checklist |
|---|---|
| Motor vehicle used on a public road | Valid RC / registration; valid third-party motor insurance; PUC where required for the vehicle/fuel/age |
| Transport vehicle / goods carriage | Above, plus current fitness certificate and applicable permit; tax / permit evidence where applicable |
| Agricultural tractor | Vehicle registration and third-party cover for public-road use; correct driver-licence class; separately classify tractor/trailer use before demanding goods-carriage permit |
| JCB / excavator / construction-equipment vehicle | Determine whether and how it is registered as a construction-equipment vehicle, whether it moves on the road under its own power or is transported, and the correct driver licence category; do not automatically class every excavator as a goods carriage |
| Machine moved on low-bed / trailer | Machine's identity and ownership; transporter / trailer vehicle papers and permits for the transporter as applicable |
| Stationary machine (generator, mixer, pump etc.) | Ownership / purchase evidence, make/model/serial, rated capacity, maintenance/safety evidence; road RC is not automatically applicable |
| Crane / lifting appliance | Manufacturer's load chart / SWL, machine/gear identification, inspection and maintenance records, rigging accessories and operator/rigger competence. Verify the current statutory site/workplace and competent-person requirements for each site and configuration. |
| Borewell drilling rig in Telangana | Current WALTA rig-registration certificate Form 16, and the corresponding application / particulars. Verify the rig registration against the individual rig and its vehicle/identifiers; currentness and display obligations must be checked. |
| Tipper / mineral / sand transport | Applicable source documents, mineral transit pass / e-permit and any other load-specific documents before dispatch. A registered provider profile does not authorise every load. |
| Potable water tanker | Lawful source evidence, recent competent-lab water quality evidence, cleaning / hygiene records and any applicable FSSAI / local permissions after the exact supply activity is classified. |

### Telangana borewell requirement — high priority

Section 14 of the Telangana Water, Land and Trees Act, 2002 requires every rig owner to register drilling machinery with the Authority. The WALTA Rules list Form 15 as the rig-registration application and Form 16 as the registration certificate. Rule 17 material describes a two-year renewal cycle and display of the certificate on the rig. The Act additionally provides, for agricultural irrigation lands, that the rig owner/operator obtain a groundwater feasibility certificate for the selected site and insure the proposed borewell before drilling. Confirm the latest local form, fee and administrative process with the District Ground Water / WALTA Authority rather than hard-coding a fee from an old copy of the rules.

Important distinction: a rig owner's registration is not a blanket permission to drill any customer's land. For a specific job, check the customer's well/site permission, local restriction, feasibility and the additional agricultural irrigation requirements before work starts. Store these with the job/site and customer consent, not as if they were a permanent machine credential.

### 6. Operator roster

In production, every provider should add each person who will operate or drive a machine:
- Legal name and verified mobile.
- Role (driver, rig operator, crane operator, rigger/signal person, excavator operator, tractor operator, etc.).
- Which asset(s) and service(s) the person may operate.
- Years of experience and relevant training/competence evidence.
- Driving licence details and class/validity where they drive a motor vehicle on a public road.
- Crane/rigger/other specialised training and competent-person evidence where applicable.

Do not assume a driver's ordinary licence covers every transport or special vehicle. Use the registered vehicle class and current CMVR/Parivahan licence class. A person who only operates an off-road machine may have different requirements from the person driving a road-going vehicle.

This roster is also a Fieldly safety and accountability control. The exact statutory certificate / licence requirement varies by equipment, employer, worksite and current safety rules; do not present a platform checklist as a universal statutory list.

### 7. Insurance and safety

- For motor vehicles on public roads, verify compulsory third-party motor insurance.
- For high-risk machinery (rigs, JCBs, cranes, tippers and lifting equipment), request equipment / public liability / contractor's plant cover where appropriate and set a Fieldly safety policy for minimum cover. Do not label voluntary insurance as a universal statutory requirement.
- Capture policy number suffix, insurer, insured machine, coverage type and expiry in the secure production review record.
- Crane / lifting: inspect load chart, rated capacity, outriggers/setup, rigging gear, maintenance and competent operator.
- Excavation: require utility-location/site-risk confirmation before digging.
- Water: source, hygiene, cleaning and potable testing.
- Tipper: permitted payload, secured/covered loads and lawful mineral source.
- Record defects and allow a machine to be suspended until re-inspection.

### 8. Rates, coverage and customer terms

Only after capability entry, ask for:
- Operating base / yard pin and service coverage radius.
- Availability and response times.
- Pricing basis per foot, hour, trip, load, acre, day or milestone.
- Minimum hours / trip, mobilisation and travel fees, fuel/extra attachment charges.
- What is included/excluded, overtime, standby, cancellation, rescheduling, weather and access constraints.
- Whether operator, fuel, transport, helpers and accessories are included.

Never use one base rate for all selected services. An owner may have separate rates for a rig, pump repair, tractor, trailer and different machine attachments.

## Payout and tax profile

Do not ask for bank details during the first public service-profile step. After business and service approval:
- Run Cashfree Easy Split vendor/KYC onboarding server-side.
- Collect the beneficiary / account holder name, bank account number and IFSC, or an allowed UPI VPA if Cashfree confirms it for this merchant/vendor type.
- Verify the payout destination (and request a cancelled cheque / bank proof where the gateway requires it).
- Confirm that the account name, business/legal owner and beneficiary are appropriately related; mismatches require review.
- Store Cashfree vendor ID, onboarding state and masked bank/UPI destination only. Do not store full account number, IFSC, PAN, Aadhaar images or bank proofs in localStorage.
- Provider remains ineligible for marketplace payouts until Cashfree confirms the vendor is active and eligible for settlement.

The Income-Tax Act, 2025 has applied from 1 April 2026. Marketplace withholding provisions are now in Section 393 (and TCS provisions in Section 394), so do not implement old-section references blindly. Fieldly's CA must determine the exact table item, rate, threshold, exception, PAN handling and returns for the actual platform/provider transactions.

GST:
- Ask whether GST registered; securely verify GSTIN only where registered.
- Ask turnover band for CA review, not as a self-certification that settles legal liability.
- Notification 65/2017-Central Tax exempts eligible suppliers of services (excluding Section 9(5) supplies) through a Section 52 TCS ECO where all-India aggregate turnover is within its threshold (₹20 lakh; ₹10 lakh for specified special-category States).
- Whether Fieldly is collecting consideration, whether Section 52 TCS applies, service classification/SAC, any Section 9(5) classification, inter-state supply and other compulsory-registration circumstances must be reviewed by a CA. Fieldly itself may have separate ECO registration/TCS obligations.

## Privacy, security and retention

This registration collects legal names, mobile numbers, addresses, vehicle identifiers, operator information, identity/tax KYC and document images. Treat this as sensitive business/KYC data even where a document is not legally classified as sensitive personal data.

Production requirements:
- A clear, separate privacy notice with each data category, purpose, sharing (including Cashfree/KYC partners), retention, contact, grievance and consent withdrawal path.
- Collect only fields needed for onboarding and compliance. Do not use Aadhaar as a default identity document if another suitable KYC path is available.
- Private object storage, server-issued signed upload URLs, encryption at rest/in transit, access control by customer/provider/reviewer role, malware scanning, file type/size validation, immutable audit of downloads/reviews, retention/deletion policy.
- Never expose unmasked PAN, Aadhaar, bank account, complete DL or RC identifiers on public listings or customer/provider pages.
- Avoid browser localStorage for full legal documents or KYC fields. Use the authenticated server and database; use a KYC provider for identity verification rather than keeping unnecessary ID copies.
- DPDP Rules 2025 require clear, standalone notices and reasonable security safeguards; phased commencement means check the provision effective at the actual launch date.

## Review workflow and status model

Use separate statuses:
- Business: draft → submitted → under review → approved / needs information / rejected / suspended.
- Each service: submitted → under review → approved / needs information / rejected / suspended.
- Each asset: submitted → document check → inspection required (if required) → approved / rejected / suspended.
- Each document: missing / uploaded / verified / rejected / expired.
- Each operator: pending / verified / suspended.
- Payout: not started / KYC required / under review / active / rejected / on hold.

Customer discovery must check the exact requested service, at least one active approved linked asset, valid required document statuses and the provider's operating status. A provider's approval for tractors must not expose an unapproved borewell rig. Expired legal documents should automatically take the affected service/asset offline until renewed.

Reviewer console should show:
1. Owner/business identity and authority.
2. Service tasks claimed and any special permission.
3. Exact machines linked to each service and serial/registration match.
4. Required / conditional / job-level documents with expiry.
5. Operator and licence checks.
6. Reviewer decision, reason, timestamp and audit trail.
7. Renewal alerts and the ability to request corrections without deleting the whole provider account.

## Current prototype limitation

This branch updates the provider onboarding UI and local data structures only. It uses the prototype's localStorage store, fixed demo OTP, and file selection only marks a document as “ready in preview”; file bytes are not uploaded. Do not enter real Aadhaar/PAN/bank/identity document numbers or upload real KYC files into the preview. There is no real administrative verification console, VAHAN API verification, Telangana WALTA API integration, Cashfree KYC or live payout.

Before launch, move provider onboarding into the authenticated shared PostgreSQL backend, add private document storage, a reviewer console, real OTP, service/asset-level eligibility, expiring-document enforcement and approved Cashfree vendor onboarding.

## Official reference material checked

- Telangana Water, Land and Trees Act, 2002 — Section 14: https://indiacode.nic.in/bitstream/123456789/8587/1/act_10_of_2002.pdf
- Telangana WALTA Rules / Forms 15 and 16: https://forests.telangana.gov.in/Pages/Acts_Rules/WALTA%20Rules%202004%20%28AP%29.pdf
- Telangana government's WALTA laws and rules index: https://forests.telangana.gov.in/Pages/Acts_Rules.aspx
- Motor Vehicles Act, 1988 (India Code): https://www.indiacode.nic.in/bitstream/123456789/15636/1/a1988_59.pdf
- Parivahan driver's licence category notification G.S.R. 243(E): https://parivahan.gov.in/parivahan/sites/default/files/NOTIFICATION%26ADVISORY/GSR%20243%28E%29.pdf
- GST Notification 65/2017-Central Tax: https://upload.indiacode.nic.in/showfile?actid=AC_CEN_2_2_00042_201712_1517807328102&filename=notfctn-65-central-tax-english.pdf&type=notification
- CBIC GST TCS FAQ: https://cbic-gst.gov.in/pdf/FAQs-TCS-30-11-2018.pdf
- Income Tax Department TDS/TCS transition guidance: https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tax-payments-faq
- FSSAI business registration / licensing overview: https://fssai.gov.in/business/registration
- FSSAI drinking-water testing scheme for packaged drinking/mineral water (not a universal tanker rule): https://www.fssai.gov.in/upload/uploadfiles/files/Scheme%20of%20Testing%20PDW%20MW.pdf
- DPDP Rules 2025 explanatory note: https://www.meity.gov.in/writereaddata/files/Explanatory-Note-DPDP-Rules-2025.pdf
- Consumer Protection (E-Commerce) Amendment Rules, 2026 PIB announcement (effective 1 January 2027): https://www.pib.gov.in/PressReleasePage.aspx?PRID=2308759

**Before production:** get written advice from a Telangana-groundwater / transport compliance adviser, Indian GST/Income Tax CA and privacy counsel on the categories and state-specific conditions Fieldly will actually operate.


## Provider / operator workspace

The provider home screen is an operational workspace, not just an online toggle.

### Availability controls

- **Global Online / Offline:** one switch for the whole business. Offline stops matching for new customer enquiries; it does not cancel confirmed bookings or remove active jobs.
- **Service-level switch:** a provider can accept borewell jobs and pause tractor jobs, or vice versa. A service can only be switched on when it has been approved and has at least one approved, available linked asset.
- **Machine-level switch:** pause one tractor, rig, crane, tipper or other machine because it is under repair, already committed, undergoing inspection or not staffed. Other approved machines linked to that service can still receive requests.
- Customer search and the server-side request creation rule must enforce the same combined state. A UI-only toggle is not an authorization control.
- A production version should add working hours, weekly schedule, date-specific leave / holidays, emergency pause and an “until” time. Global/service/asset availability is immediate; calendar scheduling is a separate next iteration.

### Main sections

1. **Overview:** open request count, active booking count, completed jobs, customer-recorded paid count/value, current online state, per-service states, today's active work queue and customer rating.
2. **Requests:** assigned enquiries, job type, location/distance, date/time, customer requirements, site photos, quote scope/price, reply, decline and post-response contact/chat. Do not show leads to unapproved or paused services.
3. **Bookings:** separate active jobs, paid/cancelled history and disputes. Active booking details provide customer contact after provider response, accepted quote terms, work-site details, status timeline, chat, arrival/start OTP and job-completion action.
4. **Services & fleet:** each registered service and each physical machine, approval status, linked service categories and independent availability toggles.
5. **Earnings:** separate customer-marked payment activity, completed jobs awaiting customer payment, quoted job value, and (when later available) actual gateway settlements, commissions, adjustments, refunds and payouts. A locally entered “paid” status must never be shown as bank settlement.
6. **Business profile:** owner/business summary, registered services, machine count, document checklist, approval states and future expiry/renewal notifications.

### Partner-product patterns used

- Uber's driver workflows separate going online, receiving a request, active trip controls, trip history and earnings statements.
- Urban Company's partner tools expose available slots, day-off controls, upcoming bookings, booking-specific support, ratings and profile-change reviews.
- Porter's driver/owner workflows surface vehicle/driver status, trip details, daily earnings and payout/transaction views.

Fieldly adopts these underlying operational patterns but its controls need to fit worksite equipment: multiple service types, multiple independently available assets, machine suitability, operator assignments and job/site safety requirements. Schedule calendars, support ticketing and real bank settlement statements remain future capabilities rather than simulated functionality.
