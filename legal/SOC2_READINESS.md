# SOC 2 Readiness — Concord Deal Platform

Prepared: 2026-08-26 · Status: **Readiness assessment** (not yet audited)

SOC 2 is the trust credential enterprise brokerage buyers ask for. This
document maps what the platform already has to the SOC 2 Trust Services
Criteria, and lists the gaps to close before a Type I audit.

---

## 1. Why SOC 2 matters here

- You store client financials (P&Ls, tax returns, bank statements) and deal
  PII. Enterprise brokers + larger buyers expect SOC 2.
- It's a sales asset: "SOC 2 Type II" on the pricing page closes trust gaps.
- It forces the discipline that makes breaches less likely — which today's
  security work already started.

## 2. Current state vs. Trust Services Criteria (TSC)

### CC6.x — Logical & Physical Access (strongest today)
| Criterion | Status | Evidence |
|---|---|---|
| CC6.1 Logical access (roles, least privilege) | ✅ Strong | Supabase RLS on 181/181 tables, admin-only vaults, agency-scoped policies |
| CC6.2 User provisioning/de-provisioning | 🟡 Partial | Supabase Auth + profiles.status (active/locked/banned); no automated offboarding runbook |
| CC6.3 Role-based access + segregation | ✅ Strong | super_admin / admin / broker / agent / owner roles; canManageAgency gates |
| CC6.6 Authentication (MFA) | 🟡 Partial | TOTP 2FA exists + agency 2FA policy; NOT enforced for platform admins yet |
| CC6.7 Boundary protection | ✅ Strong | CSP, HSTS, frame-deny, private buckets, signed URLs |
| CC6.8 Encryption at rest + in transit | ✅ Strong | TLS everywhere; Supabase at-rest encryption; vault AES-256-GCM; RLS |

### CC7.x — System Operations (needs work)
| Criterion | Status | Evidence |
|---|---|---|
| CC7.1 Detection (monitoring) | 🟡 New | **Sentry wired today** (SENTRY_DSN activates it) + Vercel Analytics |
| CC7.2 Incident response | 🟡 Partial | Incident Response Plan in Legal Vault; no runbook automation |
| CC7.3 Recovery | 🟡 Partial | Supabase backups; PITR needs enabling on Pro plan |
| CC7.4 Vulnerability management | 🟡 New | npm audit 0 vulns today; no scheduled dependency scanning |

### CC8.x — Change Management
| Criterion | Status | Evidence |
|---|---|---|
| CC8.1 Authorized changes | 🟡 Partial | Git + PR history; no formal change-approval policy doc |
| CC8.2 Testing | ✅ Strong | 618 automated tests, typecheck, production build gate |
| CC8.3 Change documentation | 🟡 Partial | Commits are descriptive; no release-notes process |

### CC9.x — Risk Mitigation
| Criterion | Status | Evidence |
|---|---|---|
| CC9.1 Risk assessment | 🟡 Partial | Audit report + legal vault; no formal risk register |
| CC9.2 Vendor management | 🟡 Partial | API keys registry lists vendors; no vendor risk reviews |

### A1.x — Availability
| Criterion | Status | Evidence |
|---|---|---|
| A1.1 Capacity | 🟡 Partial | Vercel auto-scaling; no load tests on record |
| A1.2 Backup + restore | 🟡 Partial | Supabase managed backups; PITR + restore test pending |

### PI.x — Processing Integrity (built-in by design)
| Criterion | Status | Evidence |
|---|---|---|
| PI1.1 Complete/accurate processing | ✅ Strong | Zod validation, commission/fee math, audit logs |

## 3. Gap-closure checklist (in priority order)

- [ ] **Enable Sentry** — create project at sentry.io, set `SENTRY_DSN`,
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` in Vercel env (code is ready)
- [ ] **Enforce MFA for platform admins** (code exists; policy gate next)
- [ ] **Enable PITR** in Supabase (Pro plan) + run a documented restore test
- [ ] **Formalize incident response runbook** (Legal Vault has the plan; make it an ops doc)
- [ ] **Write the security policy + data handling policy** as official docs
- [ ] **Automated dependency scanning** (e.g., Dependabot / Renovate on GitHub)
- [ ] **Scheduled backup verification** (quarterly restore drill)
- [ ] **Vendor risk register** (one line per API key vendor in the registry)
- [ ] **Hire/assign a SOC 2 point person**; pick auditor (e.g., Vanta/Drata platform, or boutique firm)
- [ ] **90-day observation period** before Type I → then Type II

## 4. Timeline to Type I (realistic)

- Month 1: close gaps above (Sentry live, MFA enforced, PITR + restore test,
  policy docs, Dependabot)
- Month 2: evidence collection + control documentation
- Month 3: Type I audit (point-in-time) → badge
- Month 6–9: Type II (12-month observation) → enterprise-ready

## 5. What NOT to do

- Don't claim SOC 2 before the report exists — that's a liability.
- Don't self-attest; buyers want an independent auditor.
- Don't let the audit block shipping — the controls above are 90% process.

---

*Not legal/audit advice — this is a readiness assessment. Confirm scope
(Type I vs II, trust criteria) with your chosen auditor.*
