import { db } from '../server/db';
import { scamReports, users, consolidatedScams } from '../shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Utility to check table structure and sample data from the database
 */
async function checkTables() {
  try {
    console.log('----------------------------');
    console.log('Checking scam_reports table:');
    console.log('----------------------------');
    
    // Get table information
    const scamReportsInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'scam_reports'
      ORDER BY ordinal_position
    `);
    console.log('Table structure:');
    console.log(scamReportsInfo.rows);
    
    // Get sample data
    const sampleReports = await db.select().from(scamReports).limit(2);
    console.log('\nSample data:');
    console.log(JSON.stringify(sampleReports, null, 2));
    
    console.log('\n----------------------------');
    console.log('Checking users table:');
    console.log('----------------------------');
    
    // Get table information
    const usersInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.log('Table structure:');
    console.log(usersInfo.rows);
    
    // Get sample data
    const sampleUsers = await db.select().from(users).limit(2);
    console.log('\nSample data:');
    console.log(JSON.stringify(sampleUsers, null, 2));
    
    console.log('\n----------------------------');
    console.log('Checking consolidated_scams table:');
    console.log('----------------------------');
    
    // Get table information
    const consolidatedInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'consolidated_scams'
      ORDER BY ordinal_position
    `);
    console.log('Table structure:');
    console.log(consolidatedInfo.rows);
    
    // Get sample data
    const sampleConsolidated = await db.select().from(consolidatedScams).limit(2);
    console.log('\nSample data:');
    console.log(JSON.stringify(sampleConsolidated, null, 2));
    
  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    process.exit();
  }
}

// Execute the check
checkTables();