import { pgTable, text, serial, integer, timestamp, pgEnum, date, boolean, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum for scam types
export const scamTypeEnum = pgEnum("scam_type", ["phone", "email", "business"]);

// User roles enum
export const roleEnum = pgEnum("role", ["admin", "user", "lawyer"]);

// Auth providers enum
export const authProviderEnum = pgEnum("auth_provider", ["local", "google"]);

// Lawyer specialization enum
export const lawyerSpecializationEnum = pgEnum("lawyer_specialization", [
  "consumer_fraud", 
  "identity_theft", 
  "financial_recovery", 
  "general_practice", 
  "cyber_crime"
]);

// Lawyer verification status enum
export const verificationStatusEnum = pgEnum("verification_status", [
  "pending", 
  "verified", 
  "rejected"
]);

// Request status enum
export const requestStatusEnum = pgEnum("request_status", [
  "pending", 
  "accepted", 
  "rejected", 
  "completed"
]);

// Urgency level enum
export const urgencyLevelEnum = pgEnum("urgency_level", [
  "low", 
  "medium", 
  "high"
]);

// Contact method enum
export const contactMethodEnum = pgEnum("contact_method", [
  "email", 
  "phone", 
  "either"
]);

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"),
  displayName: text("display_name").notNull(),
  beawareUsername: text("beaware_username").unique(),
  role: roleEnum("role").notNull().default("user"),
  authProvider: authProviderEnum("auth_provider").notNull().default("local"),
  googleId: text("google_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Scam report model
export const scamReports = pgTable("scam_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  scamType: scamTypeEnum("scam_type").notNull(),
  
  // Contact information of the scammer
  scamPhoneNumber: text("scam_phone_number"),
  scamEmail: text("scam_email"),
  scamBusinessName: text("scam_business_name"),
  
  // Incident details
  incidentDate: date("incident_date").notNull(),
  // Location information split into separate fields
  country: text("country").notNull().default("USA"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  description: text("description").notNull(),
  
  // Proof file attachment
  hasProofDocument: boolean("has_proof_document").default(false),
  proofFilePath: text("proof_file_path"),
  proofFileName: text("proof_file_name"),
  proofFileType: text("proof_file_type"),
  proofFileSize: integer("proof_file_size"),
  
  // Metadata
  reportedAt: timestamp("reported_at").defaultNow(),
  isVerified: boolean("is_verified").default(false),
  verifiedBy: integer("verified_by"),
  verifiedAt: timestamp("verified_at"),
  isPublished: boolean("is_published").default(true), // Default to published
  publishedBy: integer("published_by"),
  publishedAt: timestamp("published_at"),
});

// Comments on scam reports
export const scamComments = pgTable("scam_comments", {
  id: serial("id").primaryKey(),
  scamReportId: integer("scam_report_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Consolidated scam entities 
export const consolidatedScams = pgTable("consolidated_scams", {
  id: serial("id").primaryKey(),
  scamType: scamTypeEnum("scam_type").notNull(),
  
  // The consolidated identifier (phone, email, or business name)
  identifier: text("identifier").notNull().unique(),
  
  // Stats
  reportCount: integer("report_count").notNull().default(1),
  firstReportedAt: timestamp("first_reported_at").defaultNow(),
  lastReportedAt: timestamp("last_reported_at").defaultNow(),
  
  // Verification status
  isVerified: boolean("is_verified").default(false),
});

// Scam report to consolidated scam mapping
export const scamReportConsolidations = pgTable("scam_report_consolidations", {
  id: serial("id").primaryKey(),
  scamReportId: integer("scam_report_id").notNull().unique(),
  consolidatedScamId: integer("consolidated_scam_id").notNull(),
});

// Stats model (for aggregated statistics)
export const scamStats = pgTable("scam_stats", {
  id: serial("id").primaryKey(),
  date: timestamp("date").defaultNow(),
  totalReports: integer("total_reports").notNull(),
  phoneScams: integer("phone_scams").notNull(),
  emailScams: integer("email_scams").notNull(),
  businessScams: integer("business_scams").notNull(),
  // Number of reports with proof attachments
  reportsWithProof: integer("reports_with_proof").notNull(),
  verifiedReports: integer("verified_reports").notNull(),
});


// Education videos about scams (added by admins)
export const scamVideos = pgTable("scam_videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  scamType: scamTypeEnum("scam_type"),  // Optional category
  featured: boolean("featured").default(false), // Whether to feature on homepage
  addedById: integer("added_by_id").notNull(), // Admin who added it
  addedAt: timestamp("added_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Optional relation to consolidated scam
  consolidatedScamId: integer("consolidated_scam_id"),
});

// Lawyer profile model
export const lawyerProfiles = pgTable("lawyer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  
  // Professional information
  barNumber: text("bar_number").notNull(),
  yearsOfExperience: integer("years_of_experience").notNull(),
  firmName: text("firm_name"),
  primarySpecialization: lawyerSpecializationEnum("primary_specialization").notNull(),
  secondarySpecializations: lawyerSpecializationEnum("secondary_specializations").array(),
  
  // Contact and location
  officeLocation: text("office_location").notNull(),
  officePhone: text("office_phone").notNull(),
  officeEmail: text("office_email").notNull(),
  
  // Bio and details
  bio: text("bio").notNull(),
  profilePhotoUrl: text("profile_photo_url"),
  websiteUrl: text("website_url"),
  
  // Verification status
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("pending"),
  verificationDocumentPath: text("verification_document_path"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by"),
  
  // Preferences
  acceptingNewClients: boolean("accepting_new_clients").default(true),
  caseTypes: text("case_types").array(),
  offersFreeConsultation: boolean("offers_free_consultation").default(false),
  consultationFee: text("consultation_fee"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Lawyer requests from users
export const lawyerRequests = pgTable("lawyer_requests", {
  id: serial("id").primaryKey(),
  
  // User details
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  userId: integer("user_id"), // Optional: may not be a registered user
  
  // Request details
  scamType: scamTypeEnum("scam_type").notNull(),
  scamReportId: integer("scam_report_id"), // Optional: may not have a report yet
  lossAmount: text("loss_amount"),
  description: text("description").notNull(),
  urgency: urgencyLevelEnum("urgency").notNull().default("medium"),
  preferredContact: contactMethodEnum("preferred_contact").notNull().default("email"),
  
  // Status
  status: requestStatusEnum("status").notNull().default("pending"),
  lawyerProfileId: integer("lawyer_profile_id"), // Assigned lawyer
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  completedAt: timestamp("completed_at"),
});

// =================== SCHEMA DEFINITIONS =================== //

// User schema
export const insertUserSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
  displayName: z.string().min(2),
  beawareUsername: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores").optional(),
  role: z.enum(["admin", "user", "lawyer"]).default("user"),
  authProvider: z.enum(["local", "google"]).default("local"),
  googleId: z.string().optional(),
});

// Scam report schema
export const insertScamReportSchema = z.object({
  userId: z.number(),
  scamType: z.enum(["phone", "email", "business"]),
  scamPhoneNumber: z.string().optional(),
  scamEmail: z.string().email().optional(),
  scamBusinessName: z.string().optional(),
  incidentDate: z.union([z.string(), z.date()]),
  country: z.string().default("USA"),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  description: z.string(),
  hasProofDocument: z.boolean().optional(),
  proofFilePath: z.string().optional(),
  proofFileName: z.string().optional(),
  proofFileType: z.string().optional(),
  proofFileSize: z.number().optional(),
});

// Scam comment schema
export const insertScamCommentSchema = z.object({
  scamReportId: z.number(),
  userId: z.number(),
  content: z.string().min(1),
});

// Consolidated scam schema
export const insertConsolidatedScamSchema = z.object({
  scamType: z.enum(["phone", "email", "business"]),
  identifier: z.string().min(1),
  reportCount: z.number().default(1),
});

// Scam report consolidation schema
export const insertScamReportConsolidationSchema = z.object({
  scamReportId: z.number(),
  consolidatedScamId: z.number(),
});

// Lawyer profile schema
export const insertLawyerProfileSchema = z.object({
  userId: z.number(),
  barNumber: z.string().min(1),
  yearsOfExperience: z.number().min(0),
  firmName: z.string().optional(),
  primarySpecialization: z.enum(["consumer_fraud", "identity_theft", "financial_recovery", "general_practice", "cyber_crime"]),
  secondarySpecializations: z.array(z.enum(["consumer_fraud", "identity_theft", "financial_recovery", "general_practice", "cyber_crime"])).optional(),
  officeLocation: z.string().min(1),
  officePhone: z.string().min(1),
  officeEmail: z.string().email(),
  bio: z.string().min(1),
  profilePhotoUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  verificationDocumentPath: z.string().optional(),
  acceptingNewClients: z.boolean().optional(),
  caseTypes: z.array(z.string()).optional(),
  offersFreeConsultation: z.boolean().optional(),
  consultationFee: z.string().optional(),
});

// Lawyer request schema
export const insertLawyerRequestSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  userId: z.number().optional(),
  scamType: z.enum(["phone", "email", "business"]),
  scamReportId: z.number().optional(),
  lossAmount: z.string().optional(),
  description: z.string().min(1),
  urgency: z.enum(["low", "medium", "high"]).default("medium"),
  preferredContact: z.enum(["email", "phone", "either"]).default("email"),
});

// Scam video schema
export const insertScamVideoSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  youtubeUrl: z.string().min(1),
  youtubeVideoId: z.string().min(1),
  scamType: z.enum(["phone", "email", "business"]).optional(),
  featured: z.boolean().optional(),
  consolidatedScamId: z.number().optional(),
  addedById: z.number(),
});

// =================== TYPE DEFINITIONS =================== //

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertScamReport = z.infer<typeof insertScamReportSchema>;
export type ScamReport = typeof scamReports.$inferSelect;

export type InsertScamComment = z.infer<typeof insertScamCommentSchema>;
export type ScamComment = typeof scamComments.$inferSelect;

export type InsertConsolidatedScam = z.infer<typeof insertConsolidatedScamSchema>;
export type ConsolidatedScam = typeof consolidatedScams.$inferSelect;

export type InsertScamReportConsolidation = z.infer<typeof insertScamReportConsolidationSchema>;
export type ScamReportConsolidation = typeof scamReportConsolidations.$inferSelect;

export type InsertLawyerProfile = z.infer<typeof insertLawyerProfileSchema>;
export type LawyerProfile = typeof lawyerProfiles.$inferSelect;

export type InsertLawyerRequest = z.infer<typeof insertLawyerRequestSchema>;
export type LawyerRequest = typeof lawyerRequests.$inferSelect;

export type InsertScamVideo = z.infer<typeof insertScamVideoSchema>;
export type ScamVideo = typeof scamVideos.$inferSelect;

export type ScamStat = typeof scamStats.$inferSelect;

// Export enum type definitions
export type ScamType = "phone" | "email" | "business";
export type RoleType = "admin" | "user" | "lawyer";
export type AuthProviderType = "local" | "google";
export type LawyerSpecialization = "consumer_fraud" | "identity_theft" | "financial_recovery" | "general_practice" | "cyber_crime";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type RequestStatus = "pending" | "accepted" | "rejected" | "completed";
export type UrgencyLevel = "low" | "medium" | "high";
export type ContactMethod = "email" | "phone" | "either";