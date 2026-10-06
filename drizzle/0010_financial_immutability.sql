-- Financial records become immutable once they exist as records.
--
-- `invoices` carries a comment calling it "the most immutable thing in the
-- schema", and until now the database enforced none of it: every column was
-- freely updatable and any row could be deleted. That is only a comment and a
-- habit, and a habit is not an audit trail. Written by hand because triggers
-- are not expressible in the Drizzle schema; the snapshot is unchanged.
--
-- Both triggers work from an ALLOWLIST of mutable columns rather than a list
-- of frozen ones. The difference matters over time: with a frozen-list, a
-- column added next year is silently mutable and nobody notices. With an
-- allowlist it is frozen by default and somebody has to decide, which is the
-- safe direction to fail for a financial record.
--
-- The comparison is `to_jsonb(row) - allowed...`, so the check covers every
-- column without naming any of them.

CREATE OR REPLACE FUNCTION invoices_refuse_frozen_change() RETURNS trigger AS $$
BEGIN
  -- A draft has not been issued to anybody yet, so it is still being
  -- assembled rather than being a record of anything.
  IF OLD.issued_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- What may still legitimately change after issue: the invoice being paid,
  -- voided, or refunded. Everything else is the document.
  IF (to_jsonb(NEW) - 'status' - 'refunded_minor_units' - 'paid_at' - 'voided_at' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'refunded_minor_units' - 'paid_at' - 'voided_at' - 'updated_at')
  THEN
    RAISE EXCEPTION
      'Invoice % has been issued and cannot be altered. Issue a corrective document instead.',
      OLD.number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION invoices_refuse_delete() RETURNS trigger AS $$
BEGIN
  -- An unissued draft is not a record; deleting one loses nothing. An issued
  -- invoice is the record, and its number is part of a gapless sequence that
  -- several tax regimes require, so removing it breaks the sequence itself.
  IF OLD.issued_at IS NULL THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'Invoice % has been issued and cannot be deleted. Void it instead.',
    OLD.number;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS invoices_frozen_after_issue ON "invoices";--> statement-breakpoint
CREATE TRIGGER invoices_frozen_after_issue
  BEFORE UPDATE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_refuse_frozen_change();
--> statement-breakpoint

DROP TRIGGER IF EXISTS invoices_no_delete_after_issue ON "invoices";--> statement-breakpoint
CREATE TRIGGER invoices_no_delete_after_issue
  BEFORE DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_refuse_delete();
--> statement-breakpoint

-- Orders: the pricing snapshot is the evidence for what was charged, so it is
-- frozen from the moment the money arrives rather than from creation -- an
-- unpaid order is still a quote and may legitimately be re-priced.
CREATE OR REPLACE FUNCTION orders_refuse_frozen_change() RETURNS trigger AS $$
BEGIN
  IF OLD.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- `project_id` is on this list because fulfilment sets it immediately after
  -- `paid_at`, inside the same transaction -- freezing it would refuse the
  -- very write that creates the project. The rest is the refund path.
  IF (to_jsonb(NEW) - 'status' - 'refunded_minor_units' - 'refunded_at' - 'project_id' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'refunded_minor_units' - 'refunded_at' - 'project_id' - 'updated_at')
  THEN
    RAISE EXCEPTION
      'Order % has been paid; its pricing snapshot cannot be altered.',
      OLD.number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS orders_frozen_after_payment ON "orders";--> statement-breakpoint
CREATE TRIGGER orders_frozen_after_payment
  BEFORE UPDATE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION orders_refuse_frozen_change();
