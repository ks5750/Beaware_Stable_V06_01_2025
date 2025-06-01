/**
 * This script safely removes unused database tables
 * These are primarily Django-related tables that were part of the previous architecture
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

const UNUSED_TABLES = [
  // Django admin and session tables
  "django_migrations",
  "django_content_type",
  "auth_permission",
  "auth_group",
  "auth_group_permissions",
  "django_admin_log", 
  "django_session",
  "sessions",
  
  // Core app tables (duplicates of our current tables)
  "core_scamstat",
  "core_user",
  "core_user_groups",
  "core_user_user_permissions",
  "core_scamreport",
  "core_scamcomment", 
  "core_consolidatedscam",
  "core_scamreportconsolidation"
];

async function cleanupUnusedTables() {
  try {
    console.log("Starting database cleanup...");
    
    // Check each table exists before attempting to drop
    for (const tableName of UNUSED_TABLES) {
      console.log(`Checking for table: ${tableName}`);
      
      // Check if table exists
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        );
      `);
      
      const exists = result.rows[0]?.exists;
      
      if (exists) {
        console.log(`Dropping table: ${tableName}`);
        
        try {
          // Drop table if it exists
          await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(tableName)} CASCADE;`);
          console.log(`✅ Successfully dropped table: ${tableName}`);
        } catch (error) {
          console.error(`❌ Failed to drop table ${tableName}:`, error);
        }
      } else {
        console.log(`Table ${tableName} doesn't exist, skipping.`);
      }
    }
    
    console.log("Database cleanup completed!");
    console.log("The following tables should still exist:");
    console.log(" - users");
    console.log(" - scam_reports");
    console.log(" - scam_comments");
    console.log(" - consolidated_scams");
    console.log(" - scam_report_consolidations");
    console.log(" - scam_stats");
    console.log(" - lawyer_profiles");
    console.log(" - lawyer_requests");
    
  } catch (error) {
    console.error("Error during database cleanup:", error);
  }
}

// Run the cleanup
cleanupUnusedTables().catch(console.error);