import { InsertUser, User, InsertScamReport, ScamReport, InsertScamComment, ScamComment, 
  ConsolidatedScam, InsertConsolidatedScam, ScamReportConsolidation, InsertScamReportConsolidation,
  LawyerProfile, InsertLawyerProfile, LawyerRequest, InsertLawyerRequest, InsertScamVideo, ScamVideo,
  ScamStat, ScamType, RequestStatus, InsertNewsletterSubscription, NewsletterSubscription } from "./schema-shim.js";
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Interface for storage operations
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByBeawareUsername(beawareUsername: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  createScamReport(report: InsertScamReport): Promise<ScamReport>;
  getScamReport(id: number): Promise<ScamReport | undefined>;
  getAllScamReports(): Promise<ScamReport[]>;
  getScamReportsByUser(userId: number): Promise<ScamReport[]>;
  updateScamReportVerification(id: number, isVerified: boolean, verifiedBy: number): Promise<ScamReport | undefined>;
  toggleScamReportPublished(id: number, isPublished: boolean, publishedBy: number): Promise<ScamReport | undefined>;
  
  addScamComment(comment: InsertScamComment): Promise<ScamComment>;
  getScamComments(scamReportId: number): Promise<ScamComment[]>;
  
  getConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined>;
  getConsolidatedScamByIdentifier(identifier: string): Promise<ConsolidatedScam | undefined>;
  getAllConsolidatedScams(): Promise<ConsolidatedScam[]>;
  searchConsolidatedScams(query: string): Promise<ConsolidatedScam[]>;
  
  createLawyerProfile(profile: InsertLawyerProfile): Promise<LawyerProfile>;
  getLawyerProfile(id: number): Promise<LawyerProfile | undefined>;
  getLawyerProfileByUserId(userId: number): Promise<LawyerProfile | undefined>;
  getAllLawyerProfiles(): Promise<LawyerProfile[]>;
  
  createLawyerRequest(request: InsertLawyerRequest): Promise<LawyerRequest>;
  getLawyerRequest(id: number): Promise<LawyerRequest | undefined>;
  getLawyerRequestsByUser(userId: number): Promise<LawyerRequest[]>;
  updateLawyerRequestStatus(id: number, status: RequestStatus, lawyerProfileId?: number): Promise<LawyerRequest | undefined>;
  
  addScamVideo(video: InsertScamVideo): Promise<ScamVideo>;
  getScamVideo(id: number): Promise<ScamVideo | undefined>;
  getAllScamVideos(): Promise<ScamVideo[]>;
  getFeaturedScamVideos(): Promise<ScamVideo[]>;
  
  getScamStats(): Promise<ScamStat>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private scamReports: Map<number, ScamReport> = new Map();
  private scamComments: Map<number, ScamComment> = new Map();
  private consolidatedScams: Map<number, ConsolidatedScam> = new Map();
  private scamReportConsolidations: Map<number, ScamReportConsolidation> = new Map();
  private lawyerProfiles: Map<number, LawyerProfile> = new Map();
  private lawyerRequests: Map<number, LawyerRequest> = new Map();
  private scamVideos: Map<number, ScamVideo> = new Map();
  
  private userId: number = 1;
  private scamReportId: number = 1;
  private commentId: number = 1;
  private consolidatedScamId: number = 1;
  private scamReportConsolidationId: number = 1;
  private lawyerProfileId: number = 1;
  private lawyerRequestId: number = 1;
  private scamVideoId: number = 1;
  
  constructor() {
    // Seed an admin user
    this.createUser({
      email: "admin@beaware.fyi",
      password: "adminpassword",
      displayName: "Admin User",
      role: "admin",
      authProvider: "local"
    });
  }
  
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }
  
  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.googleId === googleId);
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    
    // Create user with all required fields explicitly specified
    const user: User = { 
      id,
      email: insertUser.email,
      displayName: insertUser.displayName,
      password: insertUser.password || null,
      googleId: insertUser.googleId || null,
      role: insertUser.role || "user",
      authProvider: insertUser.authProvider || "local",
      createdAt: now
    };
    
    this.users.set(id, user);
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async createScamReport(insertReport: InsertScamReport): Promise<ScamReport> {
    const id = this.scamReportId++;
    const now = new Date();
    
    // Convert incidentDate to a Date object if it's a string
    const incidentDate = typeof insertReport.incidentDate === 'string' 
      ? new Date(insertReport.incidentDate) 
      : insertReport.incidentDate;
    
    // Create report with all required fields explicitly specified
    const scamReport: ScamReport = {
      id,
      userId: insertReport.userId,
      scamType: insertReport.scamType,
      scamPhoneNumber: insertReport.scamPhoneNumber || null,
      scamEmail: insertReport.scamEmail || null,
      scamBusinessName: insertReport.scamBusinessName || null,
      incidentDate: typeof incidentDate === 'string' ? incidentDate : incidentDate.toISOString(),
      country: insertReport.country || "USA",
      city: insertReport.city || null,
      state: insertReport.state || null,
      zipCode: insertReport.zipCode || null,
      description: insertReport.description,
      hasProofDocument: insertReport.hasProofDocument || false,
      proofFilePath: insertReport.proofFilePath || null,
      proofFileName: insertReport.proofFileName || null,
      proofFileType: insertReport.proofFileType || null,
      proofFileSize: insertReport.proofFileSize || null,
      reportedAt: now,
      isVerified: false,
      verifiedBy: null,
      verifiedAt: null,
      isPublished: true,
      publishedBy: null,
      publishedAt: null
    };
    
    this.scamReports.set(id, scamReport);
    
    // Try to consolidate with existing scams
    this.consolidateScamReport(scamReport);
    
    return scamReport;
  }
  
  private async consolidateScamReport(report: ScamReport): Promise<void> {
    // Determine the identifier based on scam type
    let identifier: string | null = null;
    
    if (report.scamType === "phone" && report.scamPhoneNumber) {
      identifier = report.scamPhoneNumber;
    } else if (report.scamType === "email" && report.scamEmail) {
      identifier = report.scamEmail;
    } else if (report.scamType === "business" && report.scamBusinessName) {
      identifier = report.scamBusinessName;
    }
    
    if (!identifier) return;
    
    // Check if we already have a consolidated scam for this identifier
    const existingScam = await this.getConsolidatedScamByIdentifier(identifier);
    
    if (existingScam) {
      // Update the existing consolidated scam
      const updatedScam = {
        ...existingScam,
        reportCount: existingScam.reportCount + 1,
        lastReportedAt: report.reportedAt
      };
      
      this.consolidatedScams.set(existingScam.id, updatedScam);
      
      // Create a consolidation record
      await this.createScamReportConsolidation({
        scamReportId: report.id,
        consolidatedScamId: existingScam.id
      });
    } else {
      // Create a new consolidated scam
      const newScam = await this.createConsolidatedScam({
        scamType: report.scamType,
        identifier,
        reportCount: 1
      });
      
      // Create a consolidation record
      await this.createScamReportConsolidation({
        scamReportId: report.id,
        consolidatedScamId: newScam.id
      });
    }
  }
  
  private async createConsolidatedScam(insertScam: InsertConsolidatedScam): Promise<ConsolidatedScam> {
    const id = this.consolidatedScamId++;
    const now = new Date();
    
    const consolidatedScam: ConsolidatedScam = {
      id,
      scamType: insertScam.scamType,
      identifier: insertScam.identifier,
      reportCount: insertScam.reportCount || 1,
      firstReportedAt: now,
      lastReportedAt: now,
      isVerified: false
    };
    
    this.consolidatedScams.set(id, consolidatedScam);
    return consolidatedScam;
  }
  
  private async createScamReportConsolidation(
    insertConsolidation: InsertScamReportConsolidation
  ): Promise<ScamReportConsolidation> {
    const id = this.scamReportConsolidationId++;
    
    const consolidation: ScamReportConsolidation = {
      id,
      scamReportId: insertConsolidation.scamReportId,
      consolidatedScamId: insertConsolidation.consolidatedScamId
    };
    
    this.scamReportConsolidations.set(id, consolidation);
    return consolidation;
  }
  
  async getScamReport(id: number): Promise<ScamReport | undefined> {
    return this.scamReports.get(id);
  }
  
  async getAllScamReports(): Promise<ScamReport[]> {
    return Array.from(this.scamReports.values());
  }
  
  async getScamReportsByUser(userId: number): Promise<ScamReport[]> {
    return Array.from(this.scamReports.values())
      .filter(report => report.userId === userId);
  }
  
  async updateScamReportVerification(
    id: number, 
    isVerified: boolean, 
    verifiedBy: number
  ): Promise<ScamReport | undefined> {
    const report = await this.getScamReport(id);
    if (!report) return undefined;
    
    const updatedReport = {
      ...report,
      isVerified,
      verifiedBy,
      verifiedAt: isVerified ? new Date() : null
    };
    
    this.scamReports.set(id, updatedReport);
    
    // If we're verifying the report, also update any consolidated scam
    if (isVerified) {
      const consolidations = Array.from(this.scamReportConsolidations.values())
        .filter(c => c.scamReportId === id);
      
      for (const consolidation of consolidations) {
        const consolidatedScam = await this.getConsolidatedScam(consolidation.consolidatedScamId);
        if (consolidatedScam) {
          const updatedScam = {
            ...consolidatedScam,
            isVerified: true
          };
          this.consolidatedScams.set(consolidatedScam.id, updatedScam);
        }
      }
    }
    
    return updatedReport;
  }
  
  async toggleScamReportPublished(
    id: number, 
    isPublished: boolean, 
    publishedBy: number
  ): Promise<ScamReport | undefined> {
    const report = await this.getScamReport(id);
    if (!report) return undefined;
    
    const updatedReport = {
      ...report,
      isPublished,
      publishedBy,
      publishedAt: isPublished ? new Date() : null
    };
    
    this.scamReports.set(id, updatedReport);
    return updatedReport;
  }
  
  async addScamComment(insertComment: InsertScamComment): Promise<ScamComment> {
    const id = this.commentId++;
    const now = new Date();
    
    const comment: ScamComment = {
      id,
      scamReportId: insertComment.scamReportId,
      userId: insertComment.userId,
      content: insertComment.content,
      createdAt: now
    };
    
    this.scamComments.set(id, comment);
    return comment;
  }
  
  async getScamComments(scamReportId: number): Promise<ScamComment[]> {
    return Array.from(this.scamComments.values())
      .filter(comment => comment.scamReportId === scamReportId);
  }
  
  async getConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined> {
    return this.consolidatedScams.get(id);
  }
  
  async getConsolidatedScamByIdentifier(identifier: string): Promise<ConsolidatedScam | undefined> {
    return Array.from(this.consolidatedScams.values())
      .find(scam => scam.identifier.toLowerCase() === identifier.toLowerCase());
  }
  
  async getAllConsolidatedScams(): Promise<ConsolidatedScam[]> {
    return Array.from(this.consolidatedScams.values());
  }
  
  async searchConsolidatedScams(query: string): Promise<ConsolidatedScam[]> {
    if (!query) return this.getAllConsolidatedScams();
    
    const lowerQuery = query.toLowerCase();
    return Array.from(this.consolidatedScams.values())
      .filter(scam => scam.identifier.toLowerCase().includes(lowerQuery));
  }
  
  async createLawyerProfile(profile: InsertLawyerProfile): Promise<LawyerProfile> {
    const id = this.lawyerProfileId++;
    const now = new Date();
    
    const lawyerProfile: LawyerProfile = {
      id,
      userId: profile.userId,
      barNumber: profile.barNumber,
      yearsOfExperience: profile.yearsOfExperience,
      firmName: profile.firmName || null,
      primarySpecialization: profile.primarySpecialization,
      secondarySpecializations: profile.secondarySpecializations || [],
      officeLocation: profile.officeLocation,
      officePhone: profile.officePhone,
      officeEmail: profile.officeEmail,
      bio: profile.bio,
      profilePhotoUrl: profile.profilePhotoUrl || null,
      websiteUrl: profile.websiteUrl || null,
      verificationStatus: "pending",
      verificationDocumentPath: profile.verificationDocumentPath || null,
      verifiedAt: null,
      verifiedBy: null,
      acceptingNewClients: profile.acceptingNewClients || true,
      caseTypes: profile.caseTypes || [],
      offersFreeConsultation: profile.offersFreeConsultation || false,
      consultationFee: profile.consultationFee || null,
      createdAt: now,
      updatedAt: now
    };
    
    this.lawyerProfiles.set(id, lawyerProfile);
    
    // Update the user's role to "lawyer"
    const user = await this.getUser(profile.userId);
    if (user) {
      const updatedUser: User = { 
        ...user, 
        role: "lawyer" as "admin" | "user" | "lawyer" 
      };
      this.users.set(user.id, updatedUser);
    }
    
    return lawyerProfile;
  }
  
  async getLawyerProfile(id: number): Promise<LawyerProfile | undefined> {
    return this.lawyerProfiles.get(id);
  }
  
  async getLawyerProfileByUserId(userId: number): Promise<LawyerProfile | undefined> {
    return Array.from(this.lawyerProfiles.values())
      .find(profile => profile.userId === userId);
  }
  
  async getAllLawyerProfiles(): Promise<LawyerProfile[]> {
    return Array.from(this.lawyerProfiles.values());
  }
  
  async createLawyerRequest(request: InsertLawyerRequest): Promise<LawyerRequest> {
    const id = this.lawyerRequestId++;
    const now = new Date();
    
    const lawyerRequest: LawyerRequest = {
      id,
      fullName: request.fullName,
      email: request.email,
      phone: request.phone,
      userId: request.userId || null,
      scamType: request.scamType,
      scamReportId: request.scamReportId || null,
      lossAmount: request.lossAmount || null,
      description: request.description,
      urgency: request.urgency || "medium",
      preferredContact: request.preferredContact || "email",
      status: "pending",
      lawyerProfileId: null,
      createdAt: now,
      updatedAt: null,
      completedAt: null
    };
    
    this.lawyerRequests.set(id, lawyerRequest);
    return lawyerRequest;
  }
  
  async getLawyerRequest(id: number): Promise<LawyerRequest | undefined> {
    return this.lawyerRequests.get(id);
  }
  
  async getLawyerRequestsByUser(userId: number): Promise<LawyerRequest[]> {
    return Array.from(this.lawyerRequests.values())
      .filter(request => request.userId === userId);
  }
  
  async updateLawyerRequestStatus(
    id: number, 
    status: RequestStatus, 
    lawyerProfileId?: number
  ): Promise<LawyerRequest | undefined> {
    const request = await this.getLawyerRequest(id);
    if (!request) return undefined;
    
    const now = new Date();
    
    const updatedRequest: LawyerRequest = {
      ...request,
      status,
      lawyerProfileId: lawyerProfileId || request.lawyerProfileId,
      updatedAt: now,
      completedAt: status === "completed" ? now : null
    };
    
    this.lawyerRequests.set(id, updatedRequest);
    return updatedRequest;
  }
  
  async addScamVideo(video: InsertScamVideo): Promise<ScamVideo> {
    const id = this.scamVideoId++;
    const now = new Date();
    
    const scamVideo: ScamVideo = {
      id,
      title: video.title,
      description: video.description,
      youtubeUrl: video.youtubeUrl,
      youtubeVideoId: video.youtubeVideoId,
      scamType: video.scamType || null,
      featured: video.featured || false,
      consolidatedScamId: video.consolidatedScamId || null,
      addedById: video.addedById,
      addedAt: now,
      updatedAt: now
    };
    
    this.scamVideos.set(id, scamVideo);
    return scamVideo;
  }
  
  async getScamVideo(id: number): Promise<ScamVideo | undefined> {
    return this.scamVideos.get(id);
  }
  
  async getAllScamVideos(): Promise<ScamVideo[]> {
    return Array.from(this.scamVideos.values());
  }
  
  async getFeaturedScamVideos(): Promise<ScamVideo[]> {
    return Array.from(this.scamVideos.values())
      .filter(video => video.featured);
  }
  
  async getScamStats(): Promise<ScamStat> {
    const allReports = await this.getAllScamReports();
    
    return {
      id: 1,
      date: new Date(),
      totalReports: allReports.length,
      phoneScams: allReports.filter(r => r.scamType === "phone").length,
      emailScams: allReports.filter(r => r.scamType === "email").length,
      businessScams: allReports.filter(r => r.scamType === "business").length,
      reportsWithProof: allReports.filter(r => r.hasProofDocument).length,
      verifiedReports: allReports.filter(r => r.isVerified).length,
    };
  }
  

}

// Upload utilities
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only certain file types
    const allowedTypes = [
      'application/pdf', 
      'image/jpeg', 
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, GIF, and DOC/DOCX files are allowed.') as any, false);
    }
  }
});

// Export an instance of MemStorage as the default implementation
// Import DatabaseStorage for proper persistence
import { DatabaseStorage } from './DatabaseStorage.js';

// Use DatabaseStorage instead of MemStorage to actually use the database
export const storage = new DatabaseStorage();