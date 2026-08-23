[33mcommit 7c2cf430c2119ba3082cf5731540453353c4467c[m[33m ([m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Author: Rabin Timsina <rtimsina@ezbusinessadvisors.com>
Date:   Mon Aug 3 01:08:59 2026 -0400

    fix(listings): stamp agent_id from authenticated user on createListing
    
    listings.agent_id is NOT NULL; createListing() inserted without it, causing
    'null value in column "agent_id"' on every new-listing request. Now resolves
    the signed-in user via supabase.auth.getUser() and sets agent_id (falling back
    to an explicit input.agent_id for service-role seeding). RLS policy
    listings_owner_write (check coalesce(agent_id,auth.uid())=auth.uid()) was
    already correct and now satisfied. Verified live: anon insert blocked by RLS;
    explicit agent_id insert succeeds.

[33mcommit 386cf43a57276331238c63392c0cf12111cd4664[m
Author: Rabin Timsina <rtimsina@ezbusinessadvisors.com>
Date:   Mon Aug 3 00:49:44 2026 -0400

    fix(platform): resolve live-schema mismatches found in full broker CRM test
    
    End-to-end broker test (2026-08-03) surfaced schema/code mismatches that broke
    several platform features against the live Supabase schema. All fixed in code so
    the platform works now, plus a consolidated SQL migration for the remaining
    DB-side table creations.
    
    Fixed (code, works against current live schema):
    - Step 1 legal docs: listing_documents lacks file_name + has a restrictive
      category/status/party_type allow-list. upload/fetch now map listing_agreement
      & financial_proof onto allowed buckets, derive display names, and use valid
      status/party_type. (lib/workflow.ts)
    - Deal pipeline 'pending status' error: deals_status_check rejects 'loi'/'pending';
      all stage writes now use letter_of_intent and unknown statuses fall back safely.
      createDeal fails fast when no listing (deals.listing_id NOT NULL). (lib/pipeline.ts,
      DealFormModal, DealPipeline, lib/dashboard.ts)
    - Seller lead statuses: seller_leads_status_check only allows new|contacted|closed;
      lead writes are normalized onto that set while buyer leads keep the full funnel.
      (lib/leads2.ts)
    - Document management: listing uploads now pass party_type, valid status, and
      map Title-Case categories to the DB snake_case allow-list; read-back mapped
      to labels. (lib/documents.ts)
    - AI doc agent + dashboard activity: stop selecting non-existent file_name/title
      columns; derive names from URL/version. (lib/claude/context.ts, lib/dashboard.ts)
    
    Migration (run in Supabase SQL Editor): sql/FIX_ALL_2026_08_03.sql
    - adds listing_documents.file_name/uploaded_at; widens category/status checks
    - widens seller_leads status check
    - creates lead_activities (lead notes/activities)
    - creates financial_documents (Financial Files + Recast/BOV/CIM/BLI)
    
    Verified: 10-step workflow 70/70, deal pipeline + commissions, lead mgmt,
    document mgmt, all 4 AI agents, dashboard — 16/16 final smoke test; production
    build 80/80 static pages.

[33mcommit 955620c9a8186870ca325b0c621ac8674592a4f7[m
Author: Rabin Timsina <rtimsina@ezbusinessadvisors.com>
Date:   Sun Aug 2 15:32:00 2026 -0400

    feat(financial-files): complete financial documents system
    
    - Multi-file drag & drop upload with per-file progress bars + batch summary.
    - Auto-tag documents (Tax Return / Financial Statement / Bank Statement / Generated Document) from file names.
    - File type badges + icons (PDF / Excel / Word / Image / Other) with colored states.
    - Preview modal (PDF iframe, image, download prompt for others) + download button.
    - Financial Files dashboard at /dashboard/financial-files: per-deal listing with type badges, category tags, status pills, size, uploader, date/time.
    - Smart workflow buttons: Run Recast / Generate BOV / Generate CIM / Generate BLI / SBA Qualification / Financial Dashboard.
    - Status tracking per document (Pending / Processed / Recast Done / BOV Done / CIM Done) with editable status.
    - Delete with confirmation modal; RLS gates delete to uploader-or-broker/admin.
    - New financial_files_schema.sql: financial_documents table + auto-tag function + role-scoped RLS policies (agent role column on profiles).
    - New 'documents' public storage bucket created (25MB, fin/office MIME types).
    
    Verified: tsc clean, next build exit 0.
