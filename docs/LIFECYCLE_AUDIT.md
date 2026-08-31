# Lifecycle Spec — Gap Analysis Audit (2026-08-31)

Spec: Full Listing Lifecycle (BOV, Recast, CIM, vault, listing flow, buyer qualification, DD, closing; BLI excluded).
Per §0: audit before writing new code. This is the what-exists / reusable / needs-replacing map.

---

## Gate verification status (pre-build requirement)

- **Gate 1 — financialEngine: DONE, committed `823d87a`.** SDE = NI + Σ(itemized add-backs) only; double-count defect (142k + 24k = 166k gap) fixed and regression-locked. Invariant enforced inside the engine AND on the send path (`docDelivery.generateDeliveryPdf` + `approveDelivery`). Suite 886/886, typecheck clean.
- **Gate 2 — universal ingestion: WIRED.** `analyzeDocumentText` → `mergeAnalyses` → `financial_extractions` (confidence + `review_state: pending`) → broker approve/override → `autoGenerate` consumes reviewed first. Never bypasses Gate 1.
- **Rendered-output verified** on real PDFs: recast/CIM/BOV agree FY2026 $406,200 / FY2025 $363,800 / FY2024 $307,100; invariant holds per year; no clipped watermark.
- Caveats: extraction runs through DeepSeek client (comments say Claude); sourcing is per-document, `lineItems[]` (page/line refs) not yet populated.

## What already exists (reusable)

### Ingestion / uploads (Phase 2)
- `app/api/listings/financial-import/route.ts` — multipart upload with year stamp.
- `app/api/financial/intelligence/route.ts` — per-document Claude analysis → `financial_extractions` rows (confidence, doc_type, model, review_state pending).
- `lib/ai/textExtract.ts` — Tesseract OCR, PDF rasterization, DOCX/XLSX/CSV parsing. Universal formats covered.
- `lib/ai/documentAnalyzer.ts` — `analyzeDocumentText` structured JSON (15+ doc types), `computeDerivedSde/Ebitda`.
- `lib/ai/financialExtractor.ts` — `mergeAnalyses` broker-grade merge.
- `lib/financialExtractor.ts` — client-safe detection + CSV + `buildFinancialHistory`.
- `lib/storageBuckets.ts` — auto-tag categories (Legal / Financial / etc.).
- Preview + delete for queued files (test-covered).

### Buyer qualification & NDA (Phase 5)
- `lib/ndaAccess.ts` — request → agent review → approve grants data-room buyer record (idempotent per email).
- `lib/buyerQualify.ts` — score → qualified/maybe/not_now → nda / proof_of_funds / hold.
- `lib/proofOfFunds.ts` — submit + agent review.
- `lib/buyerPass.ts` — buyer subscription tiers.
- `lib/clientPortal.ts` — client portal access (buyer/seller).
- Agent approval required before any disclosure — hard-gated already (approve/reject).

### Pipeline & closing (Phases 7–8)
- `lib/pipeline.ts` — stages: letter_of_intent → under_contract → due_diligence → closing → closed; stage timing.
- `lib/loi.ts` + `lib/loiRender.ts` — LOI draft/save/list/render.
- `lib/offers.ts` — offer tracking tied to listing.
- `lib/closingTracker.ts` + `lib/postCloseEngine.ts` — closing + post-close sequence.
- `lib/staleDeals.ts` — stalled-deal detection (≥14d) EXISTS (spec idea #1).
- `lib/notifications.ts` — notification primitives EXIST (spec idea #2, partial wiring).
- Listing statuses: draft/active/pending_sale/under_contract/sold/withdrawn.

### Document vault (Section 3)
- `data_rooms` (agency_id NOT NULL — multi-tenant ✓), `data_room_files`, `data_room_folders`, `data_room_access_requests`, `data_room_qa`.
- Version history: `version`, `parent_id`, soft-delete `is_deleted` + `restoreRoomFile` — never silently overwritten ✓.
- Audit trail: `viewed_count`, `downloaded_count`, `data-rooms/view-log` route (per-user view log) ✓.
- Access levels: `all_parties | buyer_only | seller_only | agent_only` ✓ (maps to spec Visibility).
- `lib/dataRoom.ts` — full CRUD: upload/folder/rename/delete/restore/move/setAccess.
- `lib/dataRoomDelivery.ts` — generated docs (CIM/BOV/recast) auto-drop into the room ✓.

### Legal gate
- `lib/publish.ts` — THREE gates before live: Owner Identity (phone+photo+attestation), Legitimacy/AI (3yr revenue, scam bands), Seller-Approval (signed Listing/Marketing Agreement required — hard block with pointer to Deal Docs eSign).
- `lib/listingReadiness.ts` — readiness score incl. legal step (agreement present check).
- `lib/sellerFormSchemas.ts` — seller_interview / listing_agreement / corp_resolution / llc_resolution / doc_checklist forms.
- `lib/legalPackTemplates.ts` — legal packet templates incl. purchase agreements.
- `lib/eSign.ts` + `lib/documentSigning.ts` — docusign/hellosign + self-hosted signing links.

### Financial package generation (Phase 3)
- Gate 1 engine (`lib/recast.ts`) + `lib/normalizedEarnings.ts` canonical resolver + `lib/autoGenerate.ts` sequential recast→BOV→CIM from ONE validated output.
- `lib/docDelivery.ts` — approval-gated send (pending_approval → approve → PDF/upload/email/Deal Room). Nothing auto-publishes ✓.
- Human review step exists before finalization ✓.

## Gaps (needs replacing / new build)

| # | Spec requirement | Status | Action |
|---|---|---|---|
| G1 | **AI Advisor Interview** — conversational Claude, adapts to prior answers (Phase 1) | `financialInterview.ts` is deterministic question builder; no conversational layer | Build Claude conversation on top of existing interview engine (Item 2 adjacent — still frozen until boss lifts) |
| G2 | **Seller tiers** (Free self-serve vs Paid add-on) with upsell routing | No seller-tier model; only agency-level `financialAddon` flag | Build seller tier + upgrade path + "work with advisor" lead routing |
| G3 | **Self-Reported vs AI-Verified badge** on public listing | `financials_status` + `revenue_verified` fields exist; badge UI on public card missing | Build badge UI; verify verification panel wiring |
| G4 | **Legal doc gate as editable checklist** (not hardcoded) | `doc_checklist` form exists; configurable per-agency list unclear | Make required-docs list configurable (agency settings), keep gate hard |
| G5 | **Claude cross-check on upload**: entity/business-name match, missing signatures, wrong dates, type | Type + confidence only; no entity/signature/date checks | Extend `documentAnalyzer` cross-check + flag reason surfaced to agent |
| G6 | **Line-item source refs** (document/page/line) in extraction | Per-document only; `lineItems[]` in schema comment, not populated | Populate lineItems with source refs in analyzer prompt + merge |
| G7 | **Reconciliation-failure follow-up question** back to advisor chat | Engine throws; no targeted Claude follow-up loop | Build follow-up Q loop (Item 1 territory — still frozen until boss lifts) |
| G8 | **One-shot "Advance to Listing"** (headline financials + asking-price suggestion + narrative) | autoGenerate + publish exist separately | Build the one-tap advance action wiring BOV/CIM output → listing fields |
| G9 | **Teaser-only public listing** until qualified | `anonymizePublic` exists; full hide of financials/address pre-qualification unverified | Verify + harden public route to strip financials/address pre-NDA |
| G10 | **DD checklist** — standard template + Claude-suggested items | `dueDiligence.ts` CRUD + overdue exists; template/suggestion source unclear | Add template seed + Claude-suggested items; wire buyer completion status |
| G11 | **DD uploads cross-checked** like intake | Same as G5 | Covered by G5 extension |
| G12 | **Buyer sees checklist status + buyer-visible docs only** | access_level filtering exists; DD status exposure to buyer portal partial | Verify buyer portal surfaces status + filtered docs |
| G13 | **Unified e-signature** across NDA/LOI/PA (one system) | eSign adapters + documentSigning both exist | Consolidate on one e-sign path per document type |
| G14 | **Auto-archive on close** (entire deal file, timestamped) | postCloseEngine schedules follow-ups; no archive-all-documents step | Build archive-on-close (copy vault → closed-deal archive, set status Closed, remove from marketplace) |
| G15 | **Buyer uploads during DD** (subject to agent review) | Seller portal upload exists; buyer-submitted upload path partial | Extend portal/room upload to buyer role during DD |
| G16 | **Gate-transition notifications** (NDA signed, unlocked, DD uploaded) | notification primitives exist; hooks partial | Wire notify calls at each gate transition |

## Reusable as-is (no change)
- Vault versioning/soft-delete/restore, view/download logs, access levels, agency_id on every room.
- NDA request→review→grant data-room flow.
- Pipeline stages + stale-deal detection + notifications primitives.
- Publish gates (identity/legitimacy/seller-approval).
- Gate 1 engine + normalizedEarnings + docDelivery approval send path.

## Proposed vault permission schema (for approval)

Mirror of spec Section 3 onto the existing room model (keep `data_room_files` shape, add columns):

- **Category** → `file_kind` (extend enum: `legal | financial | due_diligence | buyer_submitted | generated_document`; already auto-tagged at upload).
- **Visibility** → `access_level` (existing: `all_parties | buyer_only | seller_only | agent_only`) + new `visibility: internal_only | buyer_visible | seller_only` derived column mapping:
  - internal_only → agent_only
  - buyer_visible → buyer_only (post-NDA grant)
  - seller_only → seller_only
- **Stage tag** → new `stage_tag: intake | listing_live | due_diligence | closing` (set by pipeline stage).
- **Source** → new `source: uploaded_by_seller | uploaded_by_agent | uploaded_by_buyer | generated_by_claude` (set at upload; generated docs auto-set).
- **Claude cross-check status** → new `claude_check: pending | verified | flagged` + `claude_check_reason text`.
- **Version history** → existing `version` + `parent_id` + soft-delete ✓ no change.
- **Audit trail** → existing viewed/downloaded counts + per-user view log ✓ no change.
- **Role permissions** (enforce in RLS + route):
  - Agent: preview/download/delete all.
  - Seller: preview/download own listing; delete own uploads pre-listing-live; upload anytime.
  - Buyer (post-NDA): preview/download buyer_visible only; upload during DD only, agent review required.
- **Multi-tenant**: `data_rooms.agency_id NOT NULL` already ✓; ensure every new column inherits room-level RLS.

Proposed DB migration: 1 new table `vault_file_meta` (or add columns to `data_room_files`) + RLS policies per role. Recommend extending `data_room_files` columns (single source of truth, no dual-store).
