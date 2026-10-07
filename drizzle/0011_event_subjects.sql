-- Events gain a subject, so a fact with no project still has somewhere to go.
--
-- Hand-written. The generated version added `subject_id` as `NOT NULL` with no
-- default, which succeeds only on an empty table: anywhere with history it
-- fails outright. The column is therefore added nullable, backfilled from
-- `project_id` -- every existing event is a project event -- and only then
-- constrained.

CREATE TYPE "public"."event_subject" AS ENUM('project', 'order', 'subscription', 'user');--> statement-breakpoint

ALTER TABLE "project_events" ADD COLUMN "subject_type" "event_subject" DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_events" ADD COLUMN "subject_id" uuid;--> statement-breakpoint

-- Every row that exists today is about the project it names.
UPDATE "project_events" SET "subject_id" = "project_id" WHERE "subject_id" IS NULL;--> statement-breakpoint

ALTER TABLE "project_events" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_events" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint

CREATE INDEX "project_events_subject_idx" ON "project_events" USING btree ("subject_type","subject_id");--> statement-breakpoint

-- A project event carries its project id and nothing else may. The Build Room
-- timeline reads `project_id`, so a project event that left it null would
-- disappear from the customer's view while still existing in the log.
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_subject_has_project_id" CHECK (("project_events"."subject_type" = 'project') = ("project_events"."project_id" is not null));
