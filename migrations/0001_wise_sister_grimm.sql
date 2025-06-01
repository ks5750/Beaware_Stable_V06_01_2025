ALTER TABLE "scam_reports" DROP COLUMN "has_proof_document";--> statement-breakpoint
ALTER TABLE "scam_reports" DROP COLUMN "proof_document_path";--> statement-breakpoint
ALTER TABLE "scam_reports" DROP COLUMN "proof_document_type";--> statement-breakpoint
DROP TYPE "public"."proof_status";