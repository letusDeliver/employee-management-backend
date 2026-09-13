---
Domain: Recruitment
Status: FINAL — with an open compliance question on candidate data retention
Date: 2026-07-28
Depends on: docs/domain-identity-employee-lifecycle.md, docs/domain-department.md, docs/domain-designation.md, docs/domain-branch.md, docs/domain-employment-type.md
---

# Domain Sign-off: Recruitment

## 1. Domain Overview

Recruitment manages the **pre-employment pipeline** — open positions, candidates, applications, interviews, and offers — that ultimately produces the input to Identity's employee-onboarding process.

**Business problem this domain solves:** every domain in this review so far has assumed an Employee record already exists. Recruitment is where that record's *origin* is designed: how a position gets opened, how candidates are tracked against it, and how an accepted offer becomes a hire. Without it, "how does a new Employee actually come to exist" has no answer beyond "an admin manually types one in."

**Why no other domain can own it:** Identity/Employee Lifecycle already has a finalized, accepted onboarding process ([[domain-identity-employee-lifecycle]]) — this document does not reopen or modify it (per the standing rule against redesigning accepted domains). Recruitment sits entirely upstream of that process: it produces the same inputs Identity's onboarding already expects (name, email, department, designation, branch, employment type, salary), regardless of whether those inputs came from a recruitment pipeline or direct admin entry. Department/Designation/Branch/Employment Type cannot own it — they define *what a position is*, not *how a candidate is found and hired for it*.

## 2. Business Lifecycle

- **JobRequisition:** `ADMIN`/hiring manager opens a requisition specifying Department, Designation, Branch, Employment Type, and number of openings. Lifecycle: `OPEN → ON_HOLD → CLOSED | CANCELLED`.
- **Candidate:** a person's basic profile (name, contact, resume) — created when they apply or are added to a pipeline. Candidates are not `User` records; they have no system login (see §3).
- **Application:** links a Candidate to a JobRequisition. Lifecycle: `APPLIED → SCREENING → INTERVIEW → OFFER → HIRED | REJECTED | WITHDRAWN`.
- **Interview:** an optional child record of an Application (scheduled time, interviewer, feedback, recommendation) — kept minimal (see §4).
- **Offer:** compensation and start-date terms proposed to a Candidate for a specific Application. Lifecycle: `PENDING → ACCEPTED | DECLINED | EXPIRED`.
- **Hire — the boundary event with Identity.** When an Offer is `ACCEPTED` and the start date arrives, a coordinating service reads the Application/Offer/Candidate data and invokes Identity's **existing, unmodified** employee-creation process, exactly as if an admin had entered the same data directly. Recruitment does not create `Employee` or `User` records itself, and Identity's onboarding logic requires no awareness that Recruitment exists — this is the same "orchestrating service coordinates across domains without either domain reaching into the other's internals" pattern already established by `auth.service.js`'s `register()` in the Identity domain itself.
- **Who performs:** `ADMIN`/hiring manager for requisitions and offers; recruiter/HR role for candidate and application management (role granularity is an open permission-scoping question, consistent with every prior domain).
- **Who consumes:** the hire-orchestration step (§2), and future reporting (time-to-hire, pipeline conversion — not designed here).

## 3. Relationships

**JobRequisition references Department, Designation, Branch, and Employment Type — the same four axes an Employee ultimately carries.** This is a deliberate mirroring: a fully specified requisition is, in effect, a template for the Employee record a successful hire will produce.

**Candidate is a self-contained entity, not a `User`.** A candidate has no system login prior to being hired — there is no verified requirement for a candidate self-service portal (see §6). Resume/document storage reuses the same generic pattern already established by `EmployeeDocument` (URL, storage-provider resource type, filename, mime type — see [[domain-identity-employee-lifecycle]]) rather than inventing a new document-handling mechanism for Recruitment specifically.

**Application is the join between Candidate and JobRequisition**, carrying its own workflow status independent of both.

**Offer references a specific Application, not a Candidate directly** — a candidate could in principle have multiple applications (to different requisitions) over time, and an offer belongs to exactly one of them.

**Hire is a one-way, read-only trigger into Identity — never a structural dependency.** Recruitment reads nothing from Identity except what's needed to avoid duplicate hires (e.g., checking no existing Employee/User already exists for that email); Identity's onboarding process is not modified, extended, or made aware of Recruitment's existence. This preserves the immutability of an already-signed-off domain while still allowing Recruitment to feed it.

## 4. Business Rules

**Mandatory invariants:**
- An Application can only reach `HIRED` if its JobRequisition is still `OPEN` (or has remaining openings) at that moment.
- A JobRequisition's remaining-openings count decrements on each successful hire and the requisition auto-transitions to `CLOSED` when openings reach zero.
- An Offer can only be created for an Application in `OFFER` stage, and only one active (`PENDING`) Offer may exist per Application at a time.

**Recommended practices:**
- Keep `Interview` minimal: scheduled time, interviewer, feedback text, recommendation. Resist building interview-panel management, structured scorecards, or multi-round calibration workflows — none are verified requirements and each is a materially larger feature.
- Rejected/withdrawn Applications and their Candidate data should be retained for historical/reporting purposes by default, **but see §8 — data-retention policy for rejected candidates is an explicit open compliance question, not a settled rule.**

## 5. Architecture

- **Aggregates:** `JobRequisition` (master-ish, referencing four axes), `Candidate` (profile + documents), `Application` (workflow, joining Candidate+Requisition), `Interview` (child of Application), `Offer` (child of Application).
- **Ownership:** each aggregate owns only its own persistence; none embeds another's full data — Application references Candidate and JobRequisition by ID.
- **Domain service responsibilities:** an Application-workflow service enforces stage transitions and the openings-decrement rule; a separate **Hire Orchestration Service** is the sole caller of Identity's employee-creation process, keeping that boundary explicit and singular rather than scattered across multiple call sites.
- **Cross-domain interaction:** synchronous reads of Department/Designation/Branch/Employment Type (existence + active-status validation, identical pattern to Employee's own assignment checks); a single, one-directional invocation of Identity's onboarding process at hire time — not a read, but also not a modification of Identity's own aggregate rules, since it supplies the same inputs Identity's process already accepts from any source.
- **What belongs inside Recruitment:** requisitions, candidates, applications, interviews, offers, the hire-trigger orchestration.
- **What does NOT belong inside Recruitment:** Employee/User creation logic itself (owned entirely by Identity, unmodified), compensation-band validation against Designation (no Grade/Band domain exists to validate against — an offer's salary is free-entry, not validated against a band, consistent with Grade/Band being out of scope for this entire review).

## 6. Future Proofing

- **What could break this design:** a verified requirement for a candidate self-service portal (candidates log in to check application status, upload documents themselves) would require candidates to become a login-capable identity of some kind — a materially different relationship to the Identity domain than "read-only trigger," and would need its own careful design rather than retrofitting into `User`. Not built now; no verified requirement.
- **Design now vs. defer:** design now — JobRequisition/Candidate/Application/Offer, minimal Interview, single hire-orchestration boundary. Defer — candidate self-service portal, resume parsing/AI screening, referral tracking, e-signature offer letters, background-check integration, public career-site/job-board integration.
- **Trade-off accepted:** all candidate/application data entry is performed by internal staff (recruiter/hiring manager), not by candidates themselves; acceptable because no verified requirement demands candidate self-service today.

## 7. Challenge the Design

**Self-critique — is a requisition-anchored model too rigid for unsolicited applications or general talent-pipeline building (candidates with no specific open requisition)?** This is a real gap: some organizations want to collect promising candidates before a matching requisition exists. Rejected as a v1 concern anyway — a generic "open pipeline" requisition could serve this need without new schema, and building a distinct unsolicited-application concept now would be scope expansion without a verified requirement.

**Self-critique — should the Hire Orchestration Service be allowed to bypass or short-circuit any of Identity's onboarding validation to speed up bulk hiring?** No — explicitly rejected. The entire value of routing hires through Identity's existing, already-signed-off process unmodified is that every Employee record, regardless of origin, is created under one consistent set of rules. Any pressure to special-case recruitment-sourced hires would be a sign that Identity's onboarding process itself needs revisiting — which is out of scope for this document and would require its own explicit contradiction-driven re-review, not a quiet bypass here.

**Alternative considered and rejected — Candidate as a `User` with a restricted role.** Rejected: conflates "has system access" with "is being considered for employment," and would force every rejected candidate to have a permanently-provisioned (even if role-restricted) login — unnecessary exposure with no offsetting benefit.

**Recommendation stands:** requisition-anchored pipeline, Candidate as a non-login entity, single Hire Orchestration Service boundary into unmodified Identity onboarding.

## 8. Open Questions

1. **Candidate data retention for rejected/withdrawn applications** — many jurisdictions have data-protection requirements (e.g., GDPR-style "right to erasure," retention-period limits) governing how long rejected-candidate PII may be kept. This is explicitly **not resolved** in this document — it requires legal/compliance input, the same category of deliberate scope-cut already made for Payroll's tax logic (§7 of [[domain-payroll]]).
2. Permission scoping (recruiter vs. hiring manager vs. admin capabilities) — same unresolved pattern as prior domains.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Candidate self-service portal | No verified requirement; would need its own Identity-relationship design. |
| Resume parsing / AI-assisted screening | No verified requirement. |
| Referral tracking | No verified requirement. |
| E-signature offer letters, background-check integration | No verified requirement; third-party integration concerns out of scope. |
| Unsolicited/pipeline-building applications without a requisition | No verified requirement; workaround (generic open requisition) exists if needed sooner. |
| Candidate PII retention/deletion policy | Legal/compliance question, not an architecture question — explicitly deferred to that expertise. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Candidate PII retention policy left unresolved | High (legal exposure in some jurisdictions) | Medium | Explicitly flagged as requiring legal/compliance input before real-world deployment (§8); not silently assumed safe. |
| Offer salary is free-entry with no Grade/Band validation | Low | Low | Consistent with Grade/Band being out of scope project-wide; accepted, not a Recruitment-specific gap. |
| Hire Orchestration Service becomes a pressure point to bypass Identity's onboarding rules for speed | Medium | Low | Explicitly rejected in §7; any real need here should trigger revisiting Identity's onboarding process directly, not a quiet workaround. |

## 11. Assumptions

- Assumed all hiring is done by internal staff on behalf of candidates (no candidate self-service); a reasonable v1 scope, not a verified constraint against ever adding it.
- Assumed one requisition-anchored pipeline model covers the substantial majority of hiring scenarios for this system's target organizations.

## 12. Impact on Future Domains

Any future domain must never violate:
1. Identity's onboarding process remains unmodified; Recruitment supplies inputs to it, never bypasses or special-cases it.
2. Candidate is not a `User` and carries no system-access implications unless a future, explicitly-designed self-service capability changes that.
3. The Hire Orchestration Service is the single boundary point between Recruitment and Identity — no other Recruitment component invokes Employee/User creation directly.

This most directly reinforces (rather than alters) the already-finalized **Identity & Employee Lifecycle** domain, and constrains any future **candidate self-service** capability to be designed as its own deliberate extension, not a retrofit.

## Architecture Decision Records

**ADR-RC01 — Requisition-Anchored Pipeline**
Status: Accepted
Summary: JobRequisition → Candidate → Application → Interview/Offer → Hire.

**ADR-RC02 — Candidate is Not a User**
Status: Accepted
Summary: No system login for candidates prior to hire; no verified requirement for a self-service portal.

**ADR-RC03 — Single Hire Orchestration Service Boundary**
Status: Accepted
Summary: One coordinating service invokes Identity's unmodified onboarding process; no other component in Recruitment creates Employee/User records.
Consequences: Identity's already-accepted onboarding ADRs remain untouched — this is confirmed as an extension, not a redesign.

**ADR-RC04 — Candidate PII Retention Policy Deferred**
Status: Deferred — Open (compliance)
Summary: Requires legal/compliance input before real-world deployment.

## Final Sign-off

**Implementation readiness:** Conditionally ready. Structurally complete; the PII-retention open question (ADR-RC04) should be resolved with legal/compliance input before handling real candidate data in production, though it does not block the architecture itself.

**Confidence score: 85%**

**Remaining blockers:** Resolve candidate PII retention policy with legal/compliance input; confirm permission scoping.

**Recommended next domain:** Training — a lower-stakes domain that can proceed independently of Recruitment's open compliance question.
