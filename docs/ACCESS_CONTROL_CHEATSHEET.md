# Platform Access Control — Plain-Language Cheat Sheet

> **Companion to `docs/BUILD_STATUS.md`** — this is a plain-language reference for
> understanding the system at a glance. For the authoritative, continuously
> updated technical record, see `docs/BUILD_STATUS.md`.
> Written with Rabin 2026-09-01 · verified against the live system.

## One login, six "hats"

Everyone signs in through the same login screen (email + password). What changes is the **role flag** on their account:

| Hat | Who | What they can do |
|---|---|---|
| **Super Admin** | You | Sees and manages everything, across every agency — the master key |
| **Agency Admin** | Runs one brokerage on the platform | Full control, but only within their own agency |
| **Broker** | Senior person at an agency | Can approve/publish listings within their agency |
| **Agent** | Works at an agency | Minimum access — their own listings/buyers/sellers |
| **Seller / Owner** | A business owner who listed their business | Sees only their own listing(s) |
| **Buyer** | Someone shopping for a business | Sees only what's unlocked for them, per listing |

One account = one role (simplified; the *effective* role is profile role + membership role + ownership flag). A person's **agency membership** is a separate layer on top — it says which brokerage they belong to and their role there. (Rare edge case: someone could technically be an agent at two different agencies.)

## Two fences — only one of them is real security

- **The UI (menu/screen)** — hides buttons and pages you're not supposed to use. This is just signage, like a directory in a building lobby. Not actual security.
- **The database itself** — every table has built-in rules: "only members of the agency that owns this row can touch it." Even if someone crafts a direct link or guesses a URL, the database refuses to hand over data that isn't theirs. This is the real vault door.

**Bottom line:** the real protection lives in the database, not the menu. This has been tested — an agent from one agency trying to open another agency's listing is denied at the database level, not just hidden from the menu.

## Your view as Super Admin

Logging in with your account shows an Admin section no one else sees — a control room with:

- **Agencies** — every brokerage on the platform, their status and plan
- **Users** — every account; you can change anyone's role
- **Listings** — everything across every agency, with a scam-risk score per listing
- **Money** — commission tracking, escrow, expenses, platform-wide
- **Audit log** — who did what, including who viewed sensitive legal documents
- **Marketplace health** — how listings move from views → NDAs → leads
- **White-label / trial settings** — how new agencies get configured

## Adding a new broker/agency

- **Agency gets created** — currently done by you (or via the platform's provisioning tooling). Fully self-serve public signup is a separate decision still pending.
- **Agency admin invites their own team** — they send an invite link/email with a role attached.
- **Invitee clicks, creates an account (or logs into an existing one), and lands inside that agency** with the correct role from day one.

You never have to manually add someone else's agents — each agency manages its own people.

## What's been tested vs. what's still an open question

**Tested and confirmed blocked:**
- Cross-agency listing views
- Cross-agency publishing
- Cross-agency deal room access
- Financial document access across agencies
- Portal token misuse
- Direct URL guessing to bypass the menu

**Known history:** an earlier audit found ~17 database tables with no protective rules at all, plus a few genuinely open tables. All were found and locked down, then re-verified.

**Honest open question:** self-testing can only catch what you think to test for. This is exactly why an independent security review (pentest) is still worth doing before scaling — a fresh set of eyes is the real way to answer "are we sure?"
