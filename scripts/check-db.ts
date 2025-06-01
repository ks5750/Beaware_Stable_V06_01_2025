import { pool, db } from '../server/db';
import { scamReports } from '../shared/schema';

async function checkDb() {
  try {
    console.log('Checking database connection...');
    
    // Get all scam reports
    const reports = await db.select().from(scamReports);
    console.log(`Found ${reports.length} scam reports`);
    
    if (reports.length > 0) {
      console.log('Sample report:', JSON.stringify(reports[0], null, 2));
    }
    
    console.log('Database check complete!');
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await pool.end();
  }
}

checkDb();