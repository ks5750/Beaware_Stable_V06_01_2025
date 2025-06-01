/**
 * This script generates consolidated scams from existing scam reports
 * It should be run after initial data migration or whenever necessary
 */
import { db } from '../server/db';
import { scamReports, consolidatedScams, scamReportConsolidations } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function generateConsolidatedScams() {
  console.log('Starting consolidated scams generation...');
  
  try {
    // Get all scam reports
    const reports = await db.select().from(scamReports);
    console.log(`Found ${reports.length} reports to process`);
    
    // Keep track of identifiers we've already processed
    const processedIdentifiers = new Map<string, number>();
    let consolidatedCount = 0;
    let associationsCount = 0;
    
    for (const report of reports) {
      let identifier: string | null = null;
      
      // Get the identifier based on scam type
      if (report.scamType === 'phone' && report.scamPhoneNumber) {
        identifier = report.scamPhoneNumber;
      } else if (report.scamType === 'email' && report.scamEmail) {
        identifier = report.scamEmail;
      } else if (report.scamType === 'business' && report.scamBusinessName) {
        identifier = report.scamBusinessName;
      }
      
      // Skip if no valid identifier
      if (!identifier || identifier.trim() === '') {
        console.log(`Skipping report #${report.id}: No valid identifier`);
        continue;
      }
      
      // Check if we've already processed this identifier
      let consolidatedId = processedIdentifiers.get(identifier);
      
      if (!consolidatedId) {
        // Create new consolidated scam
        const [newConsolidated] = await db.insert(consolidatedScams).values({
          scamType: report.scamType,
          identifier: identifier,
          reportCount: 1,
          firstReportedAt: report.reportedAt,
          lastReportedAt: report.reportedAt,
          isVerified: report.isVerified
        }).returning();
        
        consolidatedId = newConsolidated.id;
        processedIdentifiers.set(identifier, consolidatedId);
        consolidatedCount++;
        
        console.log(`Created consolidated scam #${consolidatedId} for ${report.scamType}: ${identifier}`);
      } else {
        // Update existing consolidated scam
        const consolidated = await db.select().from(consolidatedScams).where(eq(consolidatedScams.id, consolidatedId)).limit(1);
        
        if (consolidated.length > 0) {
          // Safe handling of dates to avoid null errors
          const lastReportedDate = consolidated[0].lastReportedAt;
          const reportDate = report.reportedAt ? new Date(report.reportedAt) : new Date();
          
          const newLastReportedAt = lastReportedDate && reportDate 
            ? new Date(Math.max(lastReportedDate.getTime(), reportDate.getTime()))
            : reportDate;
            
          await db.update(consolidatedScams)
            .set({ 
              reportCount: consolidated[0].reportCount + 1,
              lastReportedAt: newLastReportedAt
            })
            .where(eq(consolidatedScams.id, consolidatedId));
            
          console.log(`Updated consolidated scam #${consolidatedId} for ${report.scamType}: ${identifier}`);
        }
      }
      
      // Create the association
      await db.insert(scamReportConsolidations).values({
        scamReportId: report.id,
        consolidatedScamId: consolidatedId
      });
      
      associationsCount++;
    }
    
    console.log(`Generation complete. Created ${consolidatedCount} consolidated scams and ${associationsCount} associations.`);
  } catch (error) {
    console.error('Error generating consolidated scams:', error);
  }
}

// Run the function
generateConsolidatedScams().then(() => {
  console.log('Script completed successfully.');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});