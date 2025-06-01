import { eq, desc, asc, and, or, isNull, isNotNull, count, sql, inArray } from 'drizzle-orm';
import { db } from './db.js';
import { IStorage } from './storage.js';
import { 
  users, scamReports, scamComments, consolidatedScams, scamReportConsolidations, scamStats,
  lawyerProfiles, lawyerRequests, scamVideos,
  type User, type InsertUser, 
  type ScamReport, type InsertScamReport,
  type ScamComment, type InsertScamComment,
  type ConsolidatedScam, type InsertConsolidatedScam,
  type ScamReportConsolidation, type InsertScamReportConsolidation,
  type LawyerProfile, type InsertLawyerProfile,
  type LawyerRequest, type InsertLawyerRequest,
  type ScamVideo, type InsertScamVideo,
  type ScamStat,
  type ScamType, type AuthProviderType, type RequestStatus
} from "../shared/schema.js";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUserByBeawareUsername(beawareUsername: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.beawareUsername, beawareUsername));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, userData: Partial<Omit<User, 'id'>>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  // Scam Report methods
  async createScamReport(reportData: InsertScamReport): Promise<ScamReport> {
    // Use the incident date as provided - it should already be handled by the schema validation
    // which transforms it into a Date object
    const formattedData = { ...reportData };
    
    const [report] = await db
      .insert(scamReports)
      .values(formattedData)
      .returning();
    
    // Update stats
    await this.updateScamStats();
    
    return report;
  }

  async getScamReport(id: number): Promise<ScamReport | undefined> {
    const [report] = await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.id, id));
    return report;
  }

  async getAllScamReports(): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .orderBy(desc(scamReports.reportedAt));
  }

  async getRecentScamReports(limit: number, includeUnpublished: boolean = false): Promise<ScamReport[]> {
    if (includeUnpublished) {
      // For admins - return all reports regardless of publication status
      return await db
        .select()
        .from(scamReports)
        .orderBy(desc(scamReports.reportedAt))
        .limit(limit);
    } else {
      // For regular users - only return published reports
      return await db
        .select()
        .from(scamReports)
        .where(or(
          eq(scamReports.isPublished, true),
          isNull(scamReports.isPublished) // For backward compatibility
        ))
        .orderBy(desc(scamReports.reportedAt))
        .limit(limit);
    }
  }

  async getScamReportsByType(type: ScamType): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.scamType, type))
      .orderBy(desc(scamReports.reportedAt));
  }

  async getScamReportsByUser(userId: number): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.userId, userId))
      .orderBy(desc(scamReports.reportedAt));
  }

  async getVerifiedScamReports(): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.isVerified, true))
      .orderBy(desc(scamReports.reportedAt));
  }

  async getUnverifiedScamReports(): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.isVerified, false))
      .orderBy(desc(scamReports.reportedAt));
  }

  async getScamReportsWithProof(): Promise<ScamReport[]> {
    return await db
      .select()
      .from(scamReports)
      .where(eq(scamReports.hasProofDocument, true))
      .orderBy(desc(scamReports.reportedAt));
  }

  async verifyScamReport(id: number, verifiedBy: number): Promise<ScamReport | undefined> {
    const now = new Date();
    const [updatedReport] = await db
      .update(scamReports)
      .set({
        isVerified: true,
        verifiedBy,
        verifiedAt: now
      })
      .where(eq(scamReports.id, id))
      .returning();
    
    // Update stats
    await this.updateScamStats();
    
    return updatedReport;
  }
  
  async publishScamReport(id: number, publishedBy: number): Promise<ScamReport | undefined> {
    const now = new Date();
    const [updatedReport] = await db
      .update(scamReports)
      .set({
        isPublished: true,
        publishedBy,
        publishedAt: now
      })
      .where(eq(scamReports.id, id))
      .returning();
    
    return updatedReport;
  }
  
  async unpublishScamReport(id: number, publishedBy: number): Promise<ScamReport | undefined> {
    const now = new Date();
    const [updatedReport] = await db
      .update(scamReports)
      .set({
        isPublished: false,
        publishedBy,
        publishedAt: now
      })
      .where(eq(scamReports.id, id))
      .returning();
    
    return updatedReport;
  }
  
  async getPublishedScamReports(): Promise<ScamReport[]> {
    return db
      .select()
      .from(scamReports)
      .where(or(
        eq(scamReports.isPublished, true),
        isNull(scamReports.isPublished) // For backward compatibility
      ))
      .orderBy(desc(scamReports.reportedAt));
  }
  
  async getUnpublishedScamReports(): Promise<ScamReport[]> {
    return db
      .select()
      .from(scamReports)
      .where(eq(scamReports.isPublished, false))
      .orderBy(desc(scamReports.reportedAt));
  }

  // Consolidated logic to handle when a report is added directly to database
  async processConsolidation(reportData: any): Promise<void> {
    const reportId = reportData.id;
    
    // Extract scam type and identifier based on scam type
    const scamType = reportData.scam_type as ScamType;
    let identifier = null;
    
    if (scamType === 'phone' && reportData.scam_phone_number) {
      identifier = reportData.scam_phone_number;
    } else if (scamType === 'email' && reportData.scam_email) {
      identifier = reportData.scam_email;
    } else if (scamType === 'business' && reportData.scam_business_name) {
      identifier = reportData.scam_business_name;
    }
    
    if (!identifier) return;
    
    // Check if this identifier already exists in consolidated scams
    const [existing] = await db
      .select()
      .from(consolidatedScams)
      .where(eq(consolidatedScams.identifier, identifier));
    
    let consolidatedId;
    
    if (existing) {
      // Update the existing consolidated scam
      consolidatedId = existing.id;
      await db
        .update(consolidatedScams)
        .set({
          reportCount: existing.reportCount + 1,
          lastReportedAt: new Date()
        })
        .where(eq(consolidatedScams.id, consolidatedId));
    } else {
      // Create a new consolidated scam
      const [newConsolidated] = await db
        .insert(consolidatedScams)
        .values({
          scamType,
          identifier,
          reportCount: 1,
          firstReportedAt: new Date(),
          lastReportedAt: new Date(),
          isVerified: false
        })
        .returning();
      
      consolidatedId = newConsolidated.id;
    }
    
    // Create the association between the report and the consolidated scam
    await db
      .insert(scamReportConsolidations)
      .values({
        scamReportId: reportId,
        consolidatedScamId: consolidatedId
      });
    
    // Update stats
    await this.updateScamStats();
  }
  
  // Comment methods
  async createScamComment(comment: InsertScamComment): Promise<ScamComment> {
    const [newComment] = await db
      .insert(scamComments)
      .values(comment)
      .returning();
    return newComment;
  }

  async getCommentsForScamReport(reportId: number): Promise<ScamComment[]> {
    return await db
      .select()
      .from(scamComments)
      .where(eq(scamComments.scamReportId, reportId))
      .orderBy(desc(scamComments.createdAt));
  }
  
  // Consolidated Scam methods
  async createConsolidatedScam(scamData: InsertConsolidatedScam): Promise<ConsolidatedScam> {
    const now = new Date();
    
    const [consolidatedScam] = await db
      .insert(consolidatedScams)
      .values({
        ...scamData,
        firstReportedAt: now,
        lastReportedAt: now,
        isVerified: false
      })
      .returning();
    
    return consolidatedScam;
  }

  async getConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined> {
    const [scam] = await db
      .select()
      .from(consolidatedScams)
      .where(eq(consolidatedScams.id, id));
    return scam;
  }

  async getConsolidatedScamByIdentifier(identifier: string): Promise<ConsolidatedScam | undefined> {
    const [scam] = await db
      .select()
      .from(consolidatedScams)
      .where(eq(consolidatedScams.identifier, identifier));
    return scam;
  }

  async getAllConsolidatedScams(): Promise<ConsolidatedScam[]> {
    return await db
      .select()
      .from(consolidatedScams)
      .orderBy(desc(consolidatedScams.lastReportedAt));
  }

  async getConsolidatedScamsByType(type: ScamType): Promise<ConsolidatedScam[]> {
    return await db
      .select()
      .from(consolidatedScams)
      .where(eq(consolidatedScams.scamType, type))
      .orderBy(desc(consolidatedScams.lastReportedAt));
  }

  async updateConsolidatedScamReportCount(id: number, increment: number): Promise<ConsolidatedScam | undefined> {
    const [consolidated] = await db
      .select()
      .from(consolidatedScams)
      .where(eq(consolidatedScams.id, id));
    
    if (!consolidated) return undefined;
    
    const [updated] = await db
      .update(consolidatedScams)
      .set({
        reportCount: consolidated.reportCount + increment,
        lastReportedAt: new Date()
      })
      .where(eq(consolidatedScams.id, id))
      .returning();
    
    return updated;
  }

  async verifyConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined> {
    const [updated] = await db
      .update(consolidatedScams)
      .set({ isVerified: true })
      .where(eq(consolidatedScams.id, id))
      .returning();
    
    return updated;
  }
  
  // Report Consolidation methods
  async createScamReportConsolidation(consolidation: InsertScamReportConsolidation): Promise<ScamReportConsolidation> {
    const [newConsolidation] = await db
      .insert(scamReportConsolidations)
      .values(consolidation)
      .returning();
    return newConsolidation;
  }

  async getConsolidationForScamReport(reportId: number): Promise<ScamReportConsolidation | undefined> {
    const [consolidation] = await db
      .select()
      .from(scamReportConsolidations)
      .where(eq(scamReportConsolidations.scamReportId, reportId));
    return consolidation;
  }

  async getScamReportsForConsolidatedScam(consolidatedId: number): Promise<ScamReport[]> {
    const consolidations = await db
      .select()
      .from(scamReportConsolidations)
      .where(eq(scamReportConsolidations.consolidatedScamId, consolidatedId));
    
    const reportIds = consolidations.map((c: ScamReportConsolidation) => c.scamReportId);
    
    if (reportIds.length === 0) return [];
    
    // Use the proper IN operator with individual parameters
    const reports = await db
      .select()
      .from(scamReports)
      .where(inArray(scamReports.id, reportIds));
    
    return reports;
  }
  
  // Stats methods
  async getScamStats(): Promise<ScamStat | undefined> {
    const [stats] = await db
      .select()
      .from(scamStats)
      .orderBy(desc(scamStats.date))
      .limit(1);
    return stats;
  }

  async updateScamStats(): Promise<ScamStat> {
    // Count total reports
    const [{ value: totalReports }] = await db
      .select({ value: count() })
      .from(scamReports);
    
    // Count phone scams
    const [{ value: phoneScams }] = await db
      .select({ value: count() })
      .from(scamReports)
      .where(eq(scamReports.scamType, 'phone'));
    
    // Count email scams
    const [{ value: emailScams }] = await db
      .select({ value: count() })
      .from(scamReports)
      .where(eq(scamReports.scamType, 'email'));
    
    // Count business scams
    const [{ value: businessScams }] = await db
      .select({ value: count() })
      .from(scamReports)
      .where(eq(scamReports.scamType, 'business'));
    
    // Count reports with proof
    const [{ value: reportsWithProof }] = await db
      .select({ value: count() })
      .from(scamReports)
      .where(eq(scamReports.hasProofDocument, true));
    
    // Count verified reports
    const [{ value: verifiedReports }] = await db
      .select({ value: count() })
      .from(scamReports)
      .where(eq(scamReports.isVerified, true));
    
    // Insert new stats
    const [newStats] = await db
      .insert(scamStats)
      .values({
        date: new Date(),
        totalReports,
        phoneScams,
        emailScams,
        businessScams,
        reportsWithProof,
        verifiedReports
      })
      .returning();
    
    return newStats;
  }
  
  // Scam Video methods (omitted for brevity)
  async createScamVideo(videoData: InsertScamVideo): Promise<ScamVideo> {
    const [video] = await db
      .insert(scamVideos)
      .values(videoData)
      .returning();
    return video;
  }

  async getScamVideo(id: number): Promise<ScamVideo | undefined> {
    const [video] = await db
      .select()
      .from(scamVideos)
      .where(eq(scamVideos.id, id));
    return video;
  }

  async getAllScamVideos(): Promise<ScamVideo[]> {
    return await db
      .select()
      .from(scamVideos)
      .orderBy(desc(scamVideos.addedAt));
  }

  async getFeaturedScamVideos(limit?: number): Promise<ScamVideo[]> {
    const query = db
      .select()
      .from(scamVideos)
      .where(eq(scamVideos.featured, true))
      .orderBy(desc(scamVideos.addedAt));
    
    if (limit) {
      query.limit(limit);
    }
    
    return await query;
  }

  async getScamVideosByType(type: ScamType): Promise<ScamVideo[]> {
    return await db
      .select()
      .from(scamVideos)
      .where(eq(scamVideos.scamType, type))
      .orderBy(desc(scamVideos.addedAt));
  }

  async getScamVideosForConsolidatedScam(consolidatedScamId: number): Promise<ScamVideo[]> {
    return await db
      .select()
      .from(scamVideos)
      .where(eq(scamVideos.consolidatedScamId, consolidatedScamId))
      .orderBy(desc(scamVideos.addedAt));
  }

  async updateScamVideo(id: number, videoData: Partial<InsertScamVideo>): Promise<ScamVideo | undefined> {
    const [updated] = await db
      .update(scamVideos)
      .set({
        ...videoData,
        updatedAt: new Date()
      })
      .where(eq(scamVideos.id, id))
      .returning();
    
    return updated;
  }

  async deleteScamVideo(id: number): Promise<boolean> {
    const result = await db
      .delete(scamVideos)
      .where(eq(scamVideos.id, id));
    
    return true;
  }
  
  // Lawyer Profile methods (abbreviated)
  async createLawyerProfile(profile: InsertLawyerProfile): Promise<LawyerProfile> {
    const [newProfile] = await db
      .insert(lawyerProfiles)
      .values(profile)
      .returning();
    return newProfile;
  }

  async getLawyerProfile(id: number): Promise<LawyerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(lawyerProfiles)
      .where(eq(lawyerProfiles.id, id));
    return profile;
  }

  async getLawyerProfileByUserId(userId: number): Promise<LawyerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(lawyerProfiles)
      .where(eq(lawyerProfiles.userId, userId));
    return profile;
  }

  async getAllLawyerProfiles(): Promise<LawyerProfile[]> {
    return await db
      .select()
      .from(lawyerProfiles);
  }

  async getVerifiedLawyerProfiles(): Promise<LawyerProfile[]> {
    return await db
      .select()
      .from(lawyerProfiles)
      .where(eq(lawyerProfiles.verificationStatus, 'verified'));
  }

  async getPendingLawyerProfiles(): Promise<LawyerProfile[]> {
    return await db
      .select()
      .from(lawyerProfiles)
      .where(eq(lawyerProfiles.verificationStatus, 'pending'));
  }

  async verifyLawyerProfile(id: number, verifiedBy: number): Promise<LawyerProfile | undefined> {
    const [updated] = await db
      .update(lawyerProfiles)
      .set({
        verificationStatus: 'verified',
        verifiedBy,
        verifiedAt: new Date()
      })
      .where(eq(lawyerProfiles.id, id))
      .returning();
    
    return updated;
  }

  async updateLawyerProfile(id: number, updateData: Partial<InsertLawyerProfile>): Promise<LawyerProfile | undefined> {
    const [updated] = await db
      .update(lawyerProfiles)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(lawyerProfiles.id, id))
      .returning();
    
    return updated;
  }
  
  // Lawyer Request methods (abbreviated)
  async createLawyerRequest(request: InsertLawyerRequest): Promise<LawyerRequest> {
    const [newRequest] = await db
      .insert(lawyerRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getLawyerRequest(id: number): Promise<LawyerRequest | undefined> {
    const [request] = await db
      .select()
      .from(lawyerRequests)
      .where(eq(lawyerRequests.id, id));
    return request;
  }

  async getLawyerRequestsByUser(userId: number): Promise<LawyerRequest[]> {
    return await db
      .select()
      .from(lawyerRequests)
      .where(eq(lawyerRequests.userId, userId))
      .orderBy(desc(lawyerRequests.createdAt));
  }

  async getLawyerRequestsByLawyer(lawyerProfileId: number): Promise<LawyerRequest[]> {
    return await db
      .select()
      .from(lawyerRequests)
      .where(eq(lawyerRequests.lawyerProfileId, lawyerProfileId))
      .orderBy(desc(lawyerRequests.createdAt));
  }

  async getAllLawyerRequests(): Promise<LawyerRequest[]> {
    return await db
      .select()
      .from(lawyerRequests)
      .orderBy(desc(lawyerRequests.createdAt));
  }

  async getPendingLawyerRequests(): Promise<LawyerRequest[]> {
    return await db
      .select()
      .from(lawyerRequests)
      .where(eq(lawyerRequests.status, 'pending'))
      .orderBy(desc(lawyerRequests.createdAt));
  }

  async assignLawyerToRequest(requestId: number, lawyerProfileId: number): Promise<LawyerRequest | undefined> {
    const [updated] = await db
      .update(lawyerRequests)
      .set({
        lawyerProfileId,
        updatedAt: new Date()
      })
      .where(eq(lawyerRequests.id, requestId))
      .returning();
    
    return updated;
  }

  async updateLawyerRequestStatus(requestId: number, status: RequestStatus): Promise<LawyerRequest | undefined> {
    const updates: any = {
      status,
      updatedAt: new Date()
    };
    
    // If the status is completed, also set the completedAt date
    if (status === 'completed') {
      updates.completedAt = new Date();
    }
    
    const [updated] = await db
      .update(lawyerRequests)
      .set(updates)
      .where(eq(lawyerRequests.id, requestId))
      .returning();
    
    return updated;
  }


}