import fs from 'fs';
import path from 'path';
import { db } from '../server/db';
import { scamReports, consolidatedScams, scamReportConsolidations } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Define the structure for the scam data in the CSV/JSON file
interface ScamData {
  scamType: 'phone' | 'email' | 'business';
  scamPhoneNumber?: string;
  scamEmail?: string;
  scamBusinessName?: string;
  incidentDate: string;
  // Updated location fields
  city?: string;
  state?: string;
  zipCode?: string;
  location?: string; // Keep for backward compatibility
  description: string;
  hasProofDocument?: boolean;
  userId?: number; // Optional, will use default if not provided
}

/**
 * Seeds the database with scam data from a JSON file
 * @param filePath Path to the JSON file containing scam data
 * @param defaultUserId Default user ID to use if not specified in the data
 */
async function seedScamsFromJson(filePath: string, defaultUserId: number = 1) {
  try {
    console.log(`Reading scam data from ${filePath}...`);
    const jsonData = fs.readFileSync(filePath, 'utf8');
    const scams: ScamData[] = JSON.parse(jsonData);
    
    console.log(`Found ${scams.length} scams to import`);
    
    let added = 0;
    let consolidated = 0;

    for (const scam of scams) {
      // Prepare the scam report data
      const scamData = {
        userId: scam.userId || defaultUserId,
        scamType: scam.scamType,
        scamPhoneNumber: scam.scamPhoneNumber || null,
        scamEmail: scam.scamEmail || null,
        scamBusinessName: scam.scamBusinessName || null,
        incidentDate: new Date(scam.incidentDate),
        location: scam.location,
        description: scam.description,
        hasProofDocument: scam.hasProofDocument || false,
        proofDocumentPath: null,
        proofDocumentType: null,
        reportedAt: new Date(),
        isVerified: true, // Bulk imports are auto-verified
        verifiedBy: defaultUserId,
        verifiedAt: new Date()
      };
      
      // Insert the scam report
      const [insertedReport] = await db.insert(scamReports).values(scamData).returning();
      added++;
      
      // Get the identifier based on the scam type
      let identifier = '';
      if (scam.scamType === 'phone' && scam.scamPhoneNumber) {
        identifier = scam.scamPhoneNumber;
      } else if (scam.scamType === 'email' && scam.scamEmail) {
        identifier = scam.scamEmail;
      } else if (scam.scamType === 'business' && scam.scamBusinessName) {
        identifier = scam.scamBusinessName;
      } else {
        console.warn(`Skipping consolidation for scam #${insertedReport.id} - missing identifier`);
        continue;
      }
      
      // Check if we already have a consolidated entry for this scam
      let consolidatedScam = await db.query.consolidatedScams.findFirst({
        where: (
          scam.scamType === 'phone' 
            ? eq(consolidatedScams.phoneNumber, identifier) 
            : scam.scamType === 'email'
              ? eq(consolidatedScams.emailAddress, identifier)
              : eq(consolidatedScams.businessName, identifier)
        ),
      });
      
      // If not, create a new consolidated entry
      if (!consolidatedScam) {
        const consolidatedData = {
          scamType: scam.scamType,
          identifier: identifier,
          phoneNumber: scam.scamType === 'phone' ? identifier : null,
          emailAddress: scam.scamType === 'email' ? identifier : null,
          businessName: scam.scamType === 'business' ? identifier : null,
          reportCount: 1,
          firstReportedAt: new Date(),
          lastReportedAt: new Date(),
          isVerified: true
        };
        
        [consolidatedScam] = await db.insert(consolidatedScams).values(consolidatedData).returning();
        consolidated++;
      } else {
        // Update the existing consolidated entry
        await db
          .update(consolidatedScams)
          .set({ 
            reportCount: consolidatedScam.reportCount + 1,
            lastReportedAt: new Date()
          })
          .where(eq(consolidatedScams.id, consolidatedScam.id));
      }
      
      // Create the link between the report and the consolidated scam
      await db.insert(scamReportConsolidations).values({
        scamReportId: insertedReport.id,
        consolidatedScamId: consolidatedScam.id,
        createdAt: new Date()
      });
    }
    
    console.log(`Successfully imported ${added} scam reports`);
    console.log(`Created ${consolidated} new consolidated scams`);
  } catch (error) {
    console.error('Error seeding scams:', error);
  }
}

/**
 * Parses a CSV file and seeds the database with scam data
 * @param filePath Path to the CSV file containing scam data
 * @param defaultUserId Default user ID to use if not specified in the data
 */
async function seedScamsFromCsv(filePath: string, defaultUserId: number = 1) {
  try {
    console.log(`Reading scam data from ${filePath}...`);
    const csvData = fs.readFileSync(filePath, 'utf8');
    
    // Simple CSV parsing (for a more robust solution, consider using a CSV parser library)
    const rows = csvData.split('\n');
    const headers = rows[0].split(',').map(h => h.trim());
    
    const scams: ScamData[] = [];
    
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      
      const values = rows[i].split(',').map(v => v.trim());
      const scam: any = {};
      
      headers.forEach((header, index) => {
        if (header === 'hasProofDocument') {
          scam[header] = values[index].toLowerCase() === 'true' || values[index] === '1';
        } else if (header === 'userId') {
          scam[header] = parseInt(values[index]) || defaultUserId;
        } else {
          scam[header] = values[index];
        }
      });
      
      scams.push(scam as ScamData);
    }
    
    console.log(`Found ${scams.length} scams to import`);
    
    // Use the JSON import function to process the parsed data
    let added = 0;
    let consolidated = 0;

    for (const scam of scams) {
      // Prepare the scam report data
      const scamData = {
        userId: scam.userId || defaultUserId,
        scamType: scam.scamType,
        scamPhoneNumber: scam.scamPhoneNumber || null,
        scamEmail: scam.scamEmail || null,
        scamBusinessName: scam.scamBusinessName || null,
        incidentDate: new Date(scam.incidentDate),
        location: scam.location,
        description: scam.description,
        hasProofDocument: scam.hasProofDocument || false,
        proofDocumentPath: null,
        proofDocumentType: null,
        reportedAt: new Date(),
        isVerified: true, // Bulk imports are auto-verified
        verifiedBy: defaultUserId,
        verifiedAt: new Date()
      };
      
      // Insert the scam report
      const [insertedReport] = await db.insert(scamReports).values(scamData).returning();
      added++;
      
      // Get the identifier based on the scam type
      let identifier = '';
      if (scam.scamType === 'phone' && scam.scamPhoneNumber) {
        identifier = scam.scamPhoneNumber;
      } else if (scam.scamType === 'email' && scam.scamEmail) {
        identifier = scam.scamEmail;
      } else if (scam.scamType === 'business' && scam.scamBusinessName) {
        identifier = scam.scamBusinessName;
      } else {
        console.warn(`Skipping consolidation for scam #${insertedReport.id} - missing identifier`);
        continue;
      }
      
      // Check if we already have a consolidated entry for this scam
      let consolidatedScam = await db.query.consolidatedScams.findFirst({
        where: (
          scam.scamType === 'phone' 
            ? eq(consolidatedScams.phoneNumber, identifier) 
            : scam.scamType === 'email'
              ? eq(consolidatedScams.emailAddress, identifier)
              : eq(consolidatedScams.businessName, identifier)
        ),
      });
      
      // If not, create a new consolidated entry
      if (!consolidatedScam) {
        const consolidatedData = {
          scamType: scam.scamType,
          identifier: identifier,
          phoneNumber: scam.scamType === 'phone' ? identifier : null,
          emailAddress: scam.scamType === 'email' ? identifier : null,
          businessName: scam.scamType === 'business' ? identifier : null,
          reportCount: 1,
          firstReportedAt: new Date(),
          lastReportedAt: new Date(),
          isVerified: true
        };
        
        [consolidatedScam] = await db.insert(consolidatedScams).values(consolidatedData).returning();
        consolidated++;
      } else {
        // Update the existing consolidated entry
        await db
          .update(consolidatedScams)
          .set({ 
            reportCount: consolidatedScam.reportCount + 1,
            lastReportedAt: new Date()
          })
          .where(eq(consolidatedScams.id, consolidatedScam.id));
      }
      
      // Create the link between the report and the consolidated scam
      await db.insert(scamReportConsolidations).values({
        scamReportId: insertedReport.id,
        consolidatedScamId: consolidatedScam.id,
        createdAt: new Date()
      });
    }
    
    console.log(`Successfully imported ${added} scam reports`);
    console.log(`Created ${consolidated} new consolidated scams`);
  } catch (error) {
    console.error('Error seeding scams from CSV:', error);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node seed-scams.js <file-path> [default-user-id]');
  console.log('Example with JSON: node seed-scams.js ./data/scams.json 1');
  console.log('Example with CSV: node seed-scams.js ./data/scams.csv 1');
  process.exit(1);
}

const filePath = args[0];
const defaultUserId = args[1] ? parseInt(args[1]) : 1;

// Determine file type and call appropriate function
const fileExt = path.extname(filePath).toLowerCase();
if (fileExt === '.json') {
  seedScamsFromJson(filePath, defaultUserId).then(() => {
    console.log('JSON import complete');
    process.exit(0);
  });
} else if (fileExt === '.csv') {
  seedScamsFromCsv(filePath, defaultUserId).then(() => {
    console.log('CSV import complete');
    process.exit(0);
  });
} else {
  console.error('Unsupported file format. Please use JSON or CSV files.');
  process.exit(1);
}