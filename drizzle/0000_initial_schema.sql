CREATE TYPE "public"."abuse_reason" AS ENUM('fabricated_report', 'inappropriate_content', 'spam', 'privacy_concern', 'other');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."match_source" AS ENUM('manual_review', 'automated');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('possible', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('report_status_changed', 'possible_match_found', 'match_confirmed', 'match_dismissed', 'account_security');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'under_review', 'published', 'matched', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filed_by_id" uuid NOT NULL,
	"missing_report_id" uuid,
	"found_report_id" uuid,
	"reason" "abuse_reason" NOT NULL,
	"details" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_reports_one_target_check" CHECK (("abuse_reports"."missing_report_id" IS NOT NULL)::int + ("abuse_reports"."found_report_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "found_person_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"estimated_age_min" integer,
	"estimated_age_max" integer,
	"gender" "gender" NOT NULL,
	"height_cm" integer,
	"distinguishing_features" text,
	"notes" text,
	"found_address" text NOT NULL,
	"found_city" text NOT NULL,
	"found_latitude" double precision,
	"found_longitude" double precision,
	"found_at" timestamp with time zone NOT NULL,
	"current_whereabouts" text,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "found_reports_age_range_check" CHECK (("found_person_reports"."estimated_age_min" IS NULL OR ("found_person_reports"."estimated_age_min" >= 0 AND "found_person_reports"."estimated_age_min" <= 130))
          AND ("found_person_reports"."estimated_age_max" IS NULL OR ("found_person_reports"."estimated_age_max" >= 0 AND "found_person_reports"."estimated_age_max" <= 130))
          AND ("found_person_reports"."estimated_age_min" IS NULL OR "found_person_reports"."estimated_age_max" IS NULL OR "found_person_reports"."estimated_age_min" <= "found_person_reports"."estimated_age_max")),
	CONSTRAINT "found_reports_height_check" CHECK ("found_person_reports"."height_cm" IS NULL OR ("found_person_reports"."height_cm" > 0 AND "found_person_reports"."height_cm" < 300)),
	CONSTRAINT "found_reports_coords_check" CHECK (("found_person_reports"."found_latitude" IS NULL) = ("found_person_reports"."found_longitude" IS NULL)),
	CONSTRAINT "found_reports_lat_range_check" CHECK ("found_person_reports"."found_latitude" IS NULL OR ("found_person_reports"."found_latitude" BETWEEN -90 AND 90)),
	CONSTRAINT "found_reports_lng_range_check" CHECK ("found_person_reports"."found_longitude" IS NULL OR ("found_person_reports"."found_longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"missing_report_id" uuid NOT NULL,
	"found_report_id" uuid NOT NULL,
	"status" "match_status" DEFAULT 'possible' NOT NULL,
	"source" "match_source" DEFAULT 'manual_review' NOT NULL,
	"confidence_score" double precision,
	"notes" text,
	"created_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_confidence_range_check" CHECK ("matches"."confidence_score" IS NULL OR ("matches"."confidence_score" BETWEEN 0 AND 1))
);
--> statement-breakpoint
CREATE TABLE "missing_person_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"age" integer NOT NULL,
	"gender" "gender" NOT NULL,
	"height_cm" integer,
	"clothing_description" text,
	"distinguishing_features" text,
	"last_seen_address" text NOT NULL,
	"last_seen_city" text NOT NULL,
	"last_seen_latitude" double precision,
	"last_seen_longitude" double precision,
	"last_seen_at" timestamp with time zone NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"police_report_number" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missing_reports_age_check" CHECK ("missing_person_reports"."age" >= 0 AND "missing_person_reports"."age" <= 130),
	CONSTRAINT "missing_reports_height_check" CHECK ("missing_person_reports"."height_cm" IS NULL OR ("missing_person_reports"."height_cm" > 0 AND "missing_person_reports"."height_cm" < 300)),
	CONSTRAINT "missing_reports_coords_check" CHECK (("missing_person_reports"."last_seen_latitude" IS NULL) = ("missing_person_reports"."last_seen_longitude" IS NULL)),
	CONSTRAINT "missing_reports_lat_range_check" CHECK ("missing_person_reports"."last_seen_latitude" IS NULL OR ("missing_person_reports"."last_seen_latitude" BETWEEN -90 AND 90)),
	CONSTRAINT "missing_reports_lng_range_check" CHECK ("missing_person_reports"."last_seen_longitude" IS NULL OR ("missing_person_reports"."last_seen_longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jti" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"missing_report_id" uuid,
	"found_report_id" uuid,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_photos_one_parent_check" CHECK (("report_photos"."missing_report_id" IS NOT NULL)::int + ("report_photos"."found_report_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text,
	"phone" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"is_banned" boolean DEFAULT false NOT NULL,
	"banned_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_purpose_check" CHECK ("verification_tokens"."purpose" IN ('email_verification', 'password_reset'))
);
--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_filed_by_id_users_id_fk" FOREIGN KEY ("filed_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_missing_report_id_missing_person_reports_id_fk" FOREIGN KEY ("missing_report_id") REFERENCES "public"."missing_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_found_report_id_found_person_reports_id_fk" FOREIGN KEY ("found_report_id") REFERENCES "public"."found_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "found_person_reports" ADD CONSTRAINT "found_person_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "found_person_reports" ADD CONSTRAINT "found_person_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_missing_report_id_missing_person_reports_id_fk" FOREIGN KEY ("missing_report_id") REFERENCES "public"."missing_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_found_report_id_found_person_reports_id_fk" FOREIGN KEY ("found_report_id") REFERENCES "public"."found_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_person_reports" ADD CONSTRAINT "missing_person_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_person_reports" ADD CONSTRAINT "missing_person_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_missing_report_id_missing_person_reports_id_fk" FOREIGN KEY ("missing_report_id") REFERENCES "public"."missing_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_found_report_id_found_person_reports_id_fk" FOREIGN KEY ("found_report_id") REFERENCES "public"."found_person_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_reports_open_idx" ON "abuse_reports" USING btree ("created_at") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "abuse_reports_filed_by_idx" ON "abuse_reports" USING btree ("filed_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "abuse_reports_unique_open_missing" ON "abuse_reports" USING btree ("filed_by_id","missing_report_id") WHERE resolved_at IS NULL AND missing_report_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "abuse_reports_unique_open_found" ON "abuse_reports" USING btree ("filed_by_id","found_report_id") WHERE resolved_at IS NULL AND found_report_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "found_reports_reporter_idx" ON "found_person_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "found_reports_status_created_idx" ON "found_person_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "found_reports_city_idx" ON "found_person_reports" USING btree (lower("found_city"));--> statement-breakpoint
CREATE INDEX "found_reports_found_at_idx" ON "found_person_reports" USING btree ("found_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_key" ON "matches" USING btree ("missing_report_id","found_report_id");--> statement-breakpoint
CREATE INDEX "matches_missing_idx" ON "matches" USING btree ("missing_report_id");--> statement-breakpoint
CREATE INDEX "matches_found_idx" ON "matches" USING btree ("found_report_id");--> statement-breakpoint
CREATE INDEX "matches_status_created_idx" ON "matches" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "missing_reports_reporter_idx" ON "missing_person_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "missing_reports_status_created_idx" ON "missing_person_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "missing_reports_city_idx" ON "missing_person_reports" USING btree (lower("last_seen_city"));--> statement-breakpoint
CREATE INDEX "missing_reports_last_seen_idx" ON "missing_person_reports" USING btree ("last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens" USING btree ("jti");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "report_photos_missing_idx" ON "report_photos" USING btree ("missing_report_id","sort_order");--> statement-breakpoint
CREATE INDEX "report_photos_found_idx" ON "report_photos" USING btree ("found_report_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_hash_key" ON "verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_purpose_idx" ON "verification_tokens" USING btree ("user_id","purpose");