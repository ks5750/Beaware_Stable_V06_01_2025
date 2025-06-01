/**
 * Migration script to add BeAware usernames to existing users
 * This script generates unique BeAware usernames for users who don't have them
 */

import { db } from "../server/db.js";
import { users } from "../shared/schema.js";
import { eq, isNull } from "drizzle-orm";

async function addBeawareUsernames() {
  console.log("🔄 Adding BeAware usernames to existing users...");
  
  try {
    // First, let's see what users we have
    const allUsers = await db.select().from(users);
    console.log(`Found ${allUsers.length} existing users`);
    
    for (const user of allUsers) {
      // Generate a unique BeAware username based on their display name or email
      let baseUsername = user.displayName
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 15);
      
      // If the base username is too short, use part of email
      if (baseUsername.length < 3) {
        const emailPart = user.email.split('@')[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
        baseUsername = emailPart.substring(0, 15);
      }
      
      let attempts = 0;
      let uniqueUsername = baseUsername;
      
      // Keep trying until we find a unique username
      while (attempts < 100) {
        const existingUser = await db.select()
          .from(users)
          .where(eq(users.beawareUsername, uniqueUsername))
          .limit(1);
        
        if (existingUser.length === 0) {
          // Username is available
          break;
        }
        
        attempts++;
        uniqueUsername = `${baseUsername}${attempts}`;
      }
      
      if (attempts >= 100) {
        console.error(`Could not generate unique username for user ${user.id}`);
        continue;
      }
      
      // Update the user with the BeAware username
      await db.update(users)
        .set({ beawareUsername: uniqueUsername })
        .where(eq(users.id, user.id));
      
      console.log(`✓ User ${user.id} (${user.email}) -> @${uniqueUsername}`);
    }
    
    console.log("✅ Successfully added BeAware usernames to all users");
    
  } catch (error) {
    console.error("❌ Error adding BeAware usernames:", error);
    throw error;
  }
}

// Run the migration
addBeawareUsernames()
  .then(() => {
    console.log("🎉 Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  });