// Fix for Azure deployment - direct import without .js extension
import { storage } from './storage';
// Import interface directly
import type { IStorage } from './storage';
import type { ScamReport, ConsolidatedScam, ScamVideo } from './schema-shim.js';

// Add the missing methods to storage to match what routes.ts expects
export const extendedStorage: IStorage & {
  getVerifiedScamReports(): Promise<ScamReport[]>;
  getUnverifiedScamReports(): Promise<ScamReport[]>;
  getPublishedScamReports(): Promise<ScamReport[]>;
  getRecentScamReports(limit: number, isAdmin?: boolean): Promise<ScamReport[]>;
  getConsolidationForScamReport(reportId: number): Promise<any>;
  getScamReportsByType(type: string): Promise<ScamReport[]>;
  getCommentsForScamReport(reportId: number): Promise<any[]>;
  verifyScamReport(id: number, adminId: number): Promise<ScamReport | undefined>;
  verifyConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined>;
  createScamVideo(videoData: any): Promise<ScamVideo>;
  updateScamVideo(id: number, data: any): Promise<ScamVideo | undefined>;
  deleteScamVideo(id: number): Promise<boolean>;
} = {
  ...storage,
  
  // Filtered scam reports
  async getVerifiedScamReports(): Promise<ScamReport[]> {
    const allReports = await storage.getAllScamReports();
    return allReports.filter(report => report.isVerified);
  },
  
  async getUnverifiedScamReports(): Promise<ScamReport[]> {
    const allReports = await storage.getAllScamReports();
    return allReports.filter(report => !report.isVerified);
  },
  
  async getPublishedScamReports(): Promise<ScamReport[]> {
    const allReports = await storage.getAllScamReports();
    return allReports.filter(report => report.isPublished);
  },
  
  async getRecentScamReports(limit: number, isAdmin = false): Promise<ScamReport[]> {
    const allReports = await storage.getAllScamReports();
    
    // Filter published reports if not admin
    const filteredReports = isAdmin 
      ? allReports
      : allReports.filter(report => report.isPublished);
    
    // Sort by reported date (newest first) and limit
    return filteredReports
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
      .slice(0, limit);
  },
  
  async getConsolidationForScamReport(reportId: number): Promise<any> {
    // Find the consolidation for the given report
    const allConsolidations = Array.from(
      (storage as any).scamReportConsolidations?.values() || []
    );
    
    return allConsolidations.find(c => c.scamReportId === reportId);
  },
  
  async getScamReportsByType(type: string): Promise<ScamReport[]> {
    const allReports = await storage.getAllScamReports();
    return allReports.filter(report => report.scamType === type);
  },
  
  async getCommentsForScamReport(reportId: number): Promise<any[]> {
    return storage.getScamComments(reportId);
  },
  
  async verifyScamReport(id: number, adminId: number): Promise<ScamReport | undefined> {
    return storage.updateScamReportVerification(id, true, adminId);
  },
  
  async verifyConsolidatedScam(id: number): Promise<ConsolidatedScam | undefined> {
    const scam = await storage.getConsolidatedScam(id);
    if (!scam) return undefined;
    
    const updatedScam = {
      ...scam,
      isVerified: true
    };
    
    // Update in the storage
    (storage as any).consolidatedScams?.set(id, updatedScam);
    return updatedScam;
  },
  
  async createScamVideo(videoData: any): Promise<ScamVideo> {
    return storage.addScamVideo(videoData);
  },
  
  async updateScamVideo(id: number, data: any): Promise<ScamVideo | undefined> {
    const video = await storage.getScamVideo(id);
    if (!video) return undefined;
    
    const updatedVideo = {
      ...video,
      ...data,
      updatedAt: new Date()
    };
    
    // Update in the storage
    (storage as any).scamVideos?.set(id, updatedVideo);
    return updatedVideo;
  },
  
  async deleteScamVideo(id: number): Promise<boolean> {
    const video = await storage.getScamVideo(id);
    if (!video) return false;
    
    // Delete from the storage
    (storage as any).scamVideos?.delete(id);
    return true;
  }
};

// Export additional function to set storage for testing/mocking
export const setStorage = (newStorage: IStorage) => {
  Object.assign(storage, newStorage);
};

export { storage, IStorage };