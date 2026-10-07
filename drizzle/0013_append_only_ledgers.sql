-- The ledgers become append-only in the database, not just by convention.
--
-- `docs/SECURITY.md` has carried this as a named gap: "project_events is
-- append-only by convention, not by constraint". A timeline that can be
-- edited is worthless for the one thing it exists for — settling a disputed
-- guarantee — and the rows somebody has a reason to rewrite are exactly the
-- ones that matter. Same mechanism as the invoice triggers in 0010: the
-- application already behaves; the database now refuses when it does not.
--
-- Hand-written, since triggers are not expressible in the Drizzle schema.
-- The schema snapshot is unchanged.

-- project_events: the domain event log and Build Room timeline. Facts only.
CREATE OR REPLACE FUNCTION ledgers_refuse_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only. A correction is a new row, not an edit; % refused.',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS project_events_append_only ON "project_events";--> statement-breakpoint
CREATE TRIGGER project_events_append_only
  BEFORE UPDATE OR DELETE ON "project_events"
  FOR EACH ROW EXECUTE FUNCTION ledgers_refuse_mutation();
--> statement-breakpoint

-- audit_events: the staff console's record of who changed what.
DROP TRIGGER IF EXISTS audit_events_append_only ON "audit_events";--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION ledgers_refuse_mutation();
--> statement-breakpoint

-- credit_ledger: money-adjacent. The enum itself says corrections are new
-- entries ("adjusted"), so an UPDATE is always a bug or an attack.
DROP TRIGGER IF EXISTS credit_ledger_append_only ON "credit_ledger";--> statement-breakpoint
CREATE TRIGGER credit_ledger_append_only
  BEFORE UPDATE OR DELETE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION ledgers_refuse_mutation();
--> statement-breakpoint

-- subscription_events: lifecycle history.
DROP TRIGGER IF EXISTS subscription_events_append_only ON "subscription_events";--> statement-breakpoint
CREATE TRIGGER subscription_events_append_only
  BEFORE UPDATE OR DELETE ON "subscription_events"
  FOR EACH ROW EXECUTE FUNCTION ledgers_refuse_mutation();
--> statement-breakpoint

-- payment_events is a processing ledger, not a pure audit log: the webhook
-- legitimately marks a row processed, links it, or records why processing
-- failed. Everything else about the delivered event is frozen, and deletion
-- is refused outright.
CREATE OR REPLACE FUNCTION payment_events_refuse_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_events is append-only; DELETE refused.';
  END IF;

  IF (to_jsonb(NEW) - 'processed_at' - 'processing_error' - 'payment_id' - 'order_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'processed_at' - 'processing_error' - 'payment_id' - 'order_id')
  THEN
    RAISE EXCEPTION
      'payment_events rows record what the provider delivered; only processing columns may change.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS payment_events_processing_only ON "payment_events";--> statement-breakpoint
CREATE TRIGGER payment_events_processing_only
  BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION payment_events_refuse_rewrite();
