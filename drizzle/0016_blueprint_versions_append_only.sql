-- A blueprint version means the same thing forever.
--
-- Orders record the blueprint version they started from. If a version could
-- be edited after the fact, "this order came from Restaurant v3" would stop
-- being a statement about what the customer was shown. So, as with the
-- ledgers in 0013, the database refuses rather than trusting every caller:
--
--   * DELETE is refused outright.
--   * UPDATE may only set published_at, once, from null -- and may null
--     created_by_user_id, which is what the foreign key's ON DELETE SET NULL
--     does when a staff account is removed. Refusing that would make
--     deleting a user fail.
--
-- Hand-written, since triggers are not expressible in the Drizzle schema.

CREATE OR REPLACE FUNCTION blueprint_versions_refuse_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'business_blueprint_versions is append-only; DELETE refused.';
  END IF;

  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'A published blueprint version cannot be unpublished or re-dated.';
  END IF;

  IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     AND NEW.created_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A blueprint version''s author cannot be reassigned.';
  END IF;

  IF (to_jsonb(NEW) - 'published_at' - 'created_by_user_id')
     IS DISTINCT FROM (to_jsonb(OLD) - 'published_at' - 'created_by_user_id') THEN
    RAISE EXCEPTION
      'Blueprint versions are immutable. Save a new version instead; UPDATE refused.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS business_blueprint_versions_append_only ON "business_blueprint_versions";--> statement-breakpoint
CREATE TRIGGER business_blueprint_versions_append_only
  BEFORE UPDATE OR DELETE ON "business_blueprint_versions"
  FOR EACH ROW EXECUTE FUNCTION blueprint_versions_refuse_rewrite();
--> statement-breakpoint

-- Version 0 is the shipped definition and lives in code.
ALTER TABLE "business_blueprint_versions"
  ADD CONSTRAINT "business_blueprint_versions_version_positive" CHECK ("version" >= 1);--> statement-breakpoint
ALTER TABLE "business_blueprints"
  ADD CONSTRAINT "business_blueprints_published_version_positive"
  CHECK ("published_version" IS NULL OR "published_version" >= 1);--> statement-breakpoint
ALTER TABLE "business_blueprints"
  ADD CONSTRAINT "business_blueprints_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,47}$');--> statement-breakpoint
ALTER TABLE "business_categories"
  ADD CONSTRAINT "business_categories_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,47}$');
