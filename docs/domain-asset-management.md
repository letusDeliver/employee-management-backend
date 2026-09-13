---
Domain: Asset Management
Status: FINAL
Date: 2026-07-28
Depends on: docs/domain-identity-employee-lifecycle.md
---

# Domain Sign-off: Asset Management

## 1. Domain Overview

Asset Management tracks **company-owned physical assets (laptops, phones, equipment) and their custody chain** — which employee holds which asset, and when.

**Business problem this domain solves:** organizations need to know what equipment exists, its condition/status, and who is currently (and previously) responsible for it — for accountability, recovery on offboarding, and loss prevention. No prior domain tracks anything physical.

**Why no other domain can own it:** Employee could in principle hold an `assignedAssets` list, but that would violate the same "aggregate stays thin, references live on the appropriate side" principle already applied to Branch/Department/Designation/Shift — and unlike those single-current-value axes, asset custody specifically needs history (§3), which does not fit Employee's existing shape at all.

## 2. Business Lifecycle

- **Asset creation:** `ADMIN`/IT registers a new Asset (tag/serial number, type, description). Status: `AVAILABLE → ASSIGNED → AVAILABLE | UNDER_REPAIR → ... → RETIRED`.
- **Assignment:** `ADMIN`/IT hands an asset to an employee, creating an `AssetAssignment` record (`assetId`, `employeeId`, `assignedAt`, `returnedAt: null`). The asset's status becomes `ASSIGNED`.
- **Return:** `ADMIN`/IT records the return, setting `returnedAt` on the assignment. The asset's status reverts to `AVAILABLE`, or moves to `UNDER_REPAIR` if returned damaged — a judgment call made at return time, not automatic.
- **Retirement:** `status: RETIRED` — no longer assignable (positive allowlist: assignable only when `AVAILABLE`), same pattern as every prior status-lifecycle domain.
- **Who consumes:** the future Exit Management domain (an offboarding employee's active asset assignments must be identified for return — an explicit forward dependency, named here and expected to be honored when Exit Management is designed next).

## 3. Relationships — a Deliberate Divergence: History is Built Now, Not Deferred

**AssetAssignment is a historical ledger, not a single-current-value field on Employee — and this is the correct default here, unlike Branch/Department/Designation, where history was explicitly deferred.** This deserves to be stated plainly rather than left as an unexplained inconsistency with the earlier axes: Branch/Department/Designation history was deferred because it was a *nice-to-have analytics enhancement* with no verified demand (§6 of [[domain-branch]] and equivalents). Asset custody is different in kind — **"who had this asset, and when" is not an enhancement to Asset Management, it is the domain's core purpose.** An asset-tracking system that only knows the *current* holder and discards who had it before offers essentially no accountability value over a spreadsheet. This is the same foreseeable-vs-speculative test already applied to justify building overnight-shift semantics now in Shift (§7 of [[domain-shift]]) rather than deferring it — here it comes out the other way (build history now) for the same underlying reasoning, not a contradiction of it.

**One Asset can have at most one active (`returnedAt: null`) AssetAssignment at a time** — a mandatory invariant preventing double-assignment.

**One Employee can hold multiple Assets simultaneously** (a laptop and a phone, for example) — modeled naturally by the many-to-many shape of the AssetAssignment ledger, not a single FK on Employee.

**No relationship to Department, Designation, or Branch.** Asset assignment is an operational IT action independent of those classification axes; no verified requirement ties asset eligibility to any of them (e.g., no "only Engineering gets laptops" rule is built in — that would be an organizational policy enforced by whoever assigns assets, not a schema-level constraint).

**Read by, will be read by, the future Exit Management domain** — a synchronous read of "does this employee have any active AssetAssignments" at offboarding time, the same cross-domain read pattern used throughout this review; Asset Management does not need to know Exit Management exists.

## 4. Business Rules

**Mandatory invariants:**
- At most one active AssetAssignment per Asset at any time.
- An Asset is only assignable when `status === AVAILABLE` (positive allowlist).
- An Asset with any assignment history cannot be hard-deleted — only an asset created and never assigned may be hard-deleted; one with history is retired, not erased, preserving the custody record that is this domain's entire point.

**Recommended practices:**
- Keep `Asset` minimal: tag/serial number, type, description, status. Resist adding depreciation/valuation, purchase-order linkage, or maintenance-history detail beyond a simple `UNDER_REPAIR` status — these are Finance/procurement concerns without a verified requirement here.
- Asset assignment/return is a direct `ADMIN`/IT action, not an approval workflow — consistent with Branch's own direct-assignment pattern, since no verified requirement demands an approval gate for handing out equipment.

## 5. Architecture

- **Aggregates:** `Asset` (the physical item, with status), `AssetAssignment` (the custody ledger, child-referencing both Asset and Employee).
- **Ownership:** AssetAssignment references `assetId` and `employeeId` by ID; Employee does not embed a list of its assets (queried from the AssetAssignment side, mirroring the existing `employee.repository.js` precedent of never embedding a related aggregate's data).
- **Repository/service responsibilities:** an Asset Management service enforces the one-active-assignment-per-asset invariant and the assignable-only-when-`AVAILABLE` rule; it exposes "current holder of asset X" and "all currently-held assets for employee Y" as the two reusable queries other domains (Exit Management) should consume rather than re-querying the ledger independently.
- **Cross-domain interaction:** synchronous read of Employee (existence) on assignment; will be read *by* the future Exit Management domain — no writes in either direction.
- **What belongs inside Asset Management:** asset registry, custody ledger, status lifecycle.
- **What does NOT belong inside Asset Management:** depreciation/financial valuation (Finance concern), procurement/purchase-order workflow, offboarding return-enforcement logic itself (Exit Management's concern — this domain only exposes the data Exit Management needs to act on).

## 6. Future Proofing

- **What could break this design:** a verified requirement for asset requests (an employee requesting new equipment through a mini approval workflow, similar in shape to Leave's request/approval pattern) would be a natural additive extension — not built now, no verified requirement. A verified requirement for barcode/QR-based check-in/check-out would add a new ingestion path without changing the core Asset/AssetAssignment shape.
- **Design now vs. defer:** design now — Asset/AssetAssignment with full custody history (justified in §3 as foreseeable, not speculative). Defer — depreciation/valuation, procurement linkage, detailed maintenance/repair history, employee-initiated asset requests, barcode/QR integration.
- **Trade-off accepted:** no financial tracking of asset value or depreciation; acceptable because this domain's verified purpose is operational accountability (who has what), not financial asset management, and no verified requirement demands the latter.

## 7. Challenge the Design

**Self-critique — doesn't building custody history now, right after Training also justified building repeatable-enrollment history, and Shift justified building overnight semantics now, suggest the "defer by default" discipline is eroding as this review goes on?** No — each of these was tested against the same explicit criterion (foreseeable-and-inherent vs. speculative-and-additive), and each came out differently for a stated reason: Shift's overnight semantics were cheap and structurally load-bearing for a field being built anyway; Training's repeatable enrollment was a correctness requirement (retaking/renewal is normal, not an edge case); Asset custody history is the domain's actual purpose. What was *not* done in any of these cases is building speculative features "because other systems have them" — the criterion has been applied consistently, even though it produces "build now" in some cases and "defer" in others, which is exactly what a principled test should do rather than a blanket rule.

**Alternative considered and rejected — Employee holds a simple `assignedAssetIds` list, current-only, no history.** Rejected in §3: discards the exact information (who had it before) that gives this domain its accountability value; this would be copying the Branch/Department pattern into a context where the underlying justification for that pattern (no verified need for history) does not hold.

**Alternative considered and rejected — full financial asset-management (depreciation schedules, book value, disposal accounting).** Rejected: a distinct Finance-domain concern with no verified requirement here; this domain's job is operational custody tracking, not financial asset accounting.

**Recommendation stands:** Asset/AssetAssignment with built-in custody history, minimal aggregate, no financial tracking, explicit forward dependency named for Exit Management.

## 8. Open Questions

1. Permission scoping (IT role vs. general `ADMIN`) — same unresolved pattern as prior domains.
2. Whether asset-request (employee-initiated) workflow is ever needed — explicitly deferred, not decided either way.

## 9. Deferred Decisions

| Decision | Reason for Deferral |
|---|---|
| Depreciation / financial valuation | Finance-domain concern; no verified requirement here. |
| Procurement / purchase-order linkage | No verified requirement. |
| Employee-initiated asset requests (approval workflow) | No verified requirement; additive, similar in shape to Leave's request pattern if ever built. |
| Barcode/QR scanning integration | No verified requirement; no existing hardware-integration infrastructure. |
| Detailed maintenance/repair history | `UNDER_REPAIR` status is sufficient for today's verified scope. |

## 10. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Exit Management (not yet designed) fails to query active assignments before completing offboarding, leaving unreturned assets untracked | Medium | Low | Explicit forward dependency named here (§2/§5); Exit Management's own sign-off must confirm this is honored. |
| No financial tracking may be insufficient for organizations needing asset-value reporting | Low | Low | Explicitly out of scope (§6); additive Finance-domain concern if ever required. |

## 11. Assumptions

- Assumed (reasonable, foreseeable) that custody history has clear, immediate value for this domain's stated purpose, unlike the analytics-only history deferred for Branch/Department/Designation — this is treated as a justified distinction, not an inconsistency (§7).
- Assumed no current requirement for financial asset accounting.

## 12. Impact on Future Domains

Any future domain must never violate:
1. AssetAssignment history is never discarded or overwritten — it is an append-only custody ledger.
2. At most one active assignment per Asset at any time.
3. An Asset with assignment history is retired, never hard-deleted.
4. Asset Management exposes "current holder" and "all currently-held assets for an employee" as its two reusable queries — future consumers (Exit Management) read these rather than re-querying the ledger independently.

This most directly constrains the future **Exit Management** domain, which must query this domain's active assignments as part of its offboarding checklist.

## Architecture Decision Records

**ADR-AM01 — AssetAssignment as an Append-Only Custody Ledger**
Status: Accepted
Summary: Full history is built now, justified as inherent to the domain's purpose rather than deferred, in explicit contrast to Branch/Department/Designation's deferred history.

**ADR-AM02 — At Most One Active Assignment Per Asset**
Status: Accepted

**ADR-AM03 — Positive Allowlist Assignability (status === AVAILABLE)**
Status: Accepted
Summary: Consistent with every prior domain's assignability rule.

**ADR-AM04 — No Financial/Depreciation Tracking**
Status: Deferred
Summary: Explicitly out of scope; a Finance-domain concern if ever required.

## Final Sign-off

**Implementation readiness:** Ready. No structural blockers.

**Confidence score: 89%**

**Remaining blockers:** None structural. Confirm permission scoping before implementation.

**Recommended next domain:** Exit Management — the final domain in the approved dependency order, and the one that must explicitly reconcile its scope against Identity's already-finalized offboarding process and consume this domain's active-assignment query.
