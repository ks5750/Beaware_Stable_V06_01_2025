CREATE TYPE "public"."auth_provider" AS ENUM('local', 'google');--> statement-breakpoint
CREATE TYPE "public"."contact_method" AS ENUM('email', 'phone', 'either');--> statement-breakpoint
CREATE TYPE "public"."lawyer_specialization" AS ENUM('consumer_fraud', 'identity_theft', 'financial_recovery', 'general_practice', 'cyber_crime');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('provided', 'not_provided');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'user', 'lawyer');--> statement-breakpoint
CREATE TYPE "public"."scam_type" AS ENUM('phone', 'email', 'business');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "consolidated_scams" (
	"id" serial PRIMARY KEY NOT NULL,
	"scam_type" "scam_type" NOT NULL,
	"identifier" text NOT NULL,
	"report_count" integer DEFAULT 1 NOT NULL,
	"first_reported_at" timestamp DEFAULT now(),
	"last_reported_at" timestamp DEFAULT now(),
	"is_verified" boolean DEFAULT false,
	CONSTRAINT "consolidated_scams_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "lawyer_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"bar_number" text NOT NULL,
	"years_of_experience" integer NOT NULL,
	"firm_name" text,
	"primary_specialization" "lawyer_specialization" NOT NULL,
	"secondary_specializations" "lawyer_specialization"[],
	"office_location" text NOT NULL,
	"office_phone" text NOT NULL,
	"office_email" text NOT NULL,
	"bio" text NOT NULL,
	"profile_photo_url" text,
	"website_url" text,
	"verification_status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verification_document_path" text,
	"verified_at" timestamp,
	"verified_by" integer,
	"accepting_new_clients" boolean DEFAULT true,
	"case_types" text[],
	"offers_free_consultation" boolean DEFAULT false,
	"consultation_fee" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lawyer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "lawyer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"user_id" integer,
	"scam_type" "scam_type" NOT NULL,
	"scam_report_id" integer,
	"loss_amount" text,
	"description" text NOT NULL,
	"urgency" "urgency_level" DEFAULT 'medium' NOT NULL,
	"preferred_contact" "contact_method" DEFAULT 'email' NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"lawyer_profile_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scam_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"scam_report_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scam_report_consolidations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scam_report_id" integer NOT NULL,
	"consolidated_scam_id" integer NOT NULL,
	CONSTRAINT "scam_report_consolidations_scam_report_id_unique" UNIQUE("scam_report_id")
);
--> statement-breakpoint
CREATE TABLE "scam_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"scam_type" "scam_type" NOT NULL,
	"scam_phone_number" text,
	"scam_email" text,
	"scam_business_name" text,
	"incident_date" date NOT NULL,
	"country" text DEFAULT 'USA' NOT NULL,
	"city" text,
	"state" text,
	"zip_code" text,
	"description" text NOT NULL,
	"has_proof_document" boolean DEFAULT false,
	"proof_document_path" text,
	"proof_document_type" text,
	"reported_at" timestamp DEFAULT now(),
	"is_verified" boolean DEFAULT false,
	"verified_by" integer,
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scam_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp DEFAULT now(),
	"total_reports" integer NOT NULL,
	"phone_scams" integer NOT NULL,
	"email_scams" integer NOT NULL,
	"business_scams" integer NOT NULL,
	"reports_with_proof" integer NOT NULL,
	"verified_reports" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text,
	"display_name" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"google_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
