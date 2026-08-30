-- =============================================================================
-- 0005_agent_titles.sql
-- -----------------------------------------------------------------------------
-- Per-agent signing identity: each profile gets a professional title so the
-- NDA auto counter-sign uses the ACTUAL SENDER's name + title (boss's rule:
--   * my listing + I sent NDA        -> "Rabin Timsina, Business Advisor"
--   * other agent's listing + I sent -> same (sender-based)
--   * my listing + other agent sent  -> that agent's name + title)
-- falls back to the agency signing identity when the agent has no title.
-- Additive, idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS title text;
