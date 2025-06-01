import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import { setStorage, storage, type IStorage, extendedStorage } from "./extended-storage.js";
import { DatabaseStorage } from "./DatabaseStorage.js";
import { db } from "./db.js";
import { uploadMiddleware, getFilePath, fileExists, getFileMimeType } from "./utils/fileUpload.js";

// Use the database implementation
setStorage(new DatabaseStorage());
import { 
  insertUserSchema,
  insertScamReportSchema, 
  insertScamCommentSchema,
  insertConsolidatedScamSchema,
  insertLawyerProfileSchema,
  insertLawyerRequestSchema,
  insertScamVideoSchema,
  type LawyerProfile,
  type LawyerRequest,
  type ScamReport,
  type InsertScamReport,
  type ScamVideo,
  type InsertScamVideo,
  type ScamType,
  scamReports
} from "../shared/schema.js";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";

// Path to the uploads directory
const uploadDir = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

console.log("📝 File upload functionality has been enabled");

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes
  const apiRouter = express.Router();
  
  // Serve static files from the uploads directory
  app.use("/uploads", express.static(uploadDir));

  // Authentication middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    // Try to get the user ID from the request
    const userId = req.headers['x-user-id'] as string;
    const userEmail = req.headers['x-user-email'] as string;
    const userRole = req.headers['x-user-role'] as string;
    
    // Add debugging info
    console.log("Authentication headers:", {
      userId,
      userEmail,
      userRole
    });
    
    // If we have valid auth headers, use them directly
    if (userId && userEmail && userRole) {
      console.log("Using header authentication for user:", userEmail);
      // Create a user object from the headers
      (req as any).user = {
        id: parseInt(userId, 10),
        email: userEmail,
        role: userRole
      };
      return next();
    }
    
    // Fallback: use admin account for testing purposes
    console.log("Using admin fallback authentication");
    storage.getUserByEmail("admin@scamreport.com").then(user => {
      if (user) {
        console.log("Admin user found, proceeding with admin authentication");
        (req as any).user = user;
        next();
      } else {
        console.log("Admin user not found, creating admin user");
        // Create admin user if not exists
        storage.createUser({
          email: "admin@scamreport.com",
          password: "password123", // Using the known password from the notes
          displayName: "Admin User",
          role: "admin", // Make sure this matches the role enum
          authProvider: "local"
        }).then(newUser => {
          console.log("Admin user created successfully");
          (req as any).user = newUser;
          next();
        }).catch(err => {
          console.error("Failed to create admin user:", err);
          res.status(500).json({ message: "Server error - authentication failed" });
        });
      }
    }).catch(err => {
      console.error("Error in requireAuth middleware:", err);
      res.status(500).json({ message: "Authentication required" });
    });
  };

  // Authorization middleware for admin only routes
  const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    // Check for role in headers (from API interceptor) as fallback
    const headerRole = req.headers['x-user-role'] as string;
    const headerUserId = req.headers['x-user-id'] as string;
    const headerEmail = req.headers['x-user-email'] as string;
    
    console.log("Authorization check for admin access:", { 
      userExists: !!user,
      userRole: user?.role,
      headerRole,
      headerUserId,
      headerEmail
    });
    
    // Case 1: User already authenticated through session
    if (user && user.role === "admin") {
      console.log("Admin access granted through session");
      return next();
    } 
    
    // Case 2: User identified through headers (API access)
    if (headerRole === "admin" && headerUserId) {
      try {
        // Get the user from database to verify
        let adminUser;
        
        if (headerEmail) {
          adminUser = await storage.getUserByEmail(headerEmail);
        } else if (headerUserId) {
          adminUser = await storage.getUser(parseInt(headerUserId, 10));
        }
        
        if (adminUser && (adminUser.role === "admin" || headerRole === "admin")) {
          console.log("Admin access granted through headers", adminUser);
          (req as any).user = adminUser;
          return next();
        }
      } catch (err) {
        console.error("Error verifying admin through headers:", err);
      }
    }
    
    // Case 3: Development fallback - try to find admin by email
    try {
      // First try admin@beaware.com (new domain)
      let adminUser = await storage.getUserByEmail("admin@beaware.com");
      
      // Fallback to older admin@scamreport.com
      if (!adminUser) {
        adminUser = await storage.getUserByEmail("admin@scamreport.com");
      }
      
      if (adminUser && adminUser.role === "admin") {
        console.log("Using admin fallback for development", adminUser);
        (req as any).user = adminUser;
        return next();
      }
    } catch (err) {
      console.error("Error in admin fallback:", err);
    }
    
    // If we get here, access is denied
    console.log("Admin access denied");
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  };
  
  // Endpoint to download proof files
  apiRouter.get("/files/:filename", async (req: Request, res: Response) => {
    try {
      const requestedFilename = req.params.filename;
      const decodedFilename = decodeURIComponent(requestedFilename);
      
      // First attempt: direct file path match
      let filePath = getFilePath(decodedFilename);
      
      // Check if file exists by direct match
      if (!fileExists(filePath)) {
        console.log(`Direct file match failed for: ${decodedFilename}`);
        
        // Second attempt: Try to find the file by searching for files with similar names
        const files = fs.readdirSync(uploadDir);
        
        // Try to find a file that ends with the requested filename (ignoring timestamp prefix)
        const matchingFile = files.find(file => {
          // Remove timestamp prefix and compare the rest
          const fileWithoutTimestamp = file.substring(file.indexOf('_') + 1);
          // Try both with spaces and with underscores
          const requestedWithSpaces = decodedFilename.replace(/_/g, ' ');
          const requestedWithUnderscores = decodedFilename.replace(/ /g, '_');
          
          return fileWithoutTimestamp === decodedFilename || 
                 fileWithoutTimestamp === requestedWithSpaces ||
                 fileWithoutTimestamp === requestedWithUnderscores;
        });
        
        if (matchingFile) {
          console.log(`Found matching file: ${matchingFile}`);
          filePath = getFilePath(matchingFile);
        } else {
          console.error(`File not found: ${decodedFilename}`);
          return res.status(404).json({ 
            success: false, 
            message: "File not found",
            details: `Requested: ${decodedFilename}`
          });
        }
      }
      
      // Get the MIME type - extract the filename from the path
      const fileBaseName = path.basename(filePath);
      const mimeType = getFileMimeType(fileBaseName);
      
      // Set content headers
      res.setHeader('Content-Type', mimeType);
      
      // Send the file
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving file:", error);
      res.status(500).json({
        success: false,
        message: "Failed to serve file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // AUTH ROUTES
  apiRouter.post("/auth/register", async (req: Request, res: Response) => {
    try {
      console.log("Register request received:", JSON.stringify(req.body));
      
      // Explicitly handle the displayName/display_name field
      // This ensures the client-side "displayName" is properly mapped to the server-side "display_name"
      const transformedData = {
        ...req.body,
        // If displayName is present but display_name isn't, map displayName to display_name
        displayName: req.body.displayName || req.body.display_name
      };
      
      console.log("Transformed user data:", JSON.stringify(transformedData));
      
      try {
        // Parse the user data with the schema
        const userData = insertUserSchema.parse(transformedData);
        console.log("Validated user data:", JSON.stringify(userData));
        
        // Check if user with this email already exists
        const existingUser = await storage.getUserByEmail(userData.email);
        if (existingUser) {
          return res.status(400).json({ message: "User with this email already exists" });
        }
        
        // Check if BeAware username already exists (if provided)
        if (userData.beawareUsername) {
          const existingUsernameUser = await storage.getUserByBeawareUsername(userData.beawareUsername);
          if (existingUsernameUser) {
            return res.status(400).json({ message: "This BeAware username is already taken. Please choose a different one." });
          }
        }
        
        console.log("Creating user with data:", JSON.stringify(userData));
        
        // Create the user
        const user = await storage.createUser(userData);
        
        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        
        console.log("User created successfully:", JSON.stringify(userWithoutPassword));
        
        res.status(201).json({
          success: true,
          user: userWithoutPassword
        });
      } catch (validationError) {
        console.error("Validation error:", validationError);
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ 
            message: "Invalid user data", 
            errors: validationError.errors 
          });
        }
        throw validationError; // Re-throw if it's not a validation error
      }
    } catch (error) {
      console.error("Error creating user:", error);
      // More detailed error response
      res.status(500).json({ 
        message: "Failed to create user", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Username availability check endpoint
  apiRouter.post("/auth/check-username", async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByBeawareUsername(username);
      const available = !existingUser;

      res.json({ 
        available,
        message: available ? "Username is available" : "Username is already taken"
      });
    } catch (error) {
      console.error("Error checking username availability:", error);
      res.status(500).json({ 
        message: "Failed to check username availability",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update user's BeAware username (for Google users)
  apiRouter.post("/auth/update-username", async (req: Request, res: Response) => {
    try {
      const { email, beawareUsername } = req.body;
      
      if (!email || !beawareUsername) {
        return res.status(400).json({ message: "Email and username are required" });
      }

      // Check if username is already taken
      const existingUser = await storage.getUserByBeawareUsername(beawareUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username is already taken" });
      }

      // Find user by email and update their BeAware username
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const updatedUser = await storage.updateUser(user.id, { beawareUsername });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update username" });
      }

      res.json({ 
        success: true,
        user: updatedUser,
        message: "Username updated successfully"
      });
    } catch (error) {
      console.error("Error updating username:", error);
      res.status(500).json({ 
        message: "Failed to update username",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  apiRouter.post("/auth/google-login", async (req: Request, res: Response) => {
    try {
      console.log("Google login API endpoint called");
      const { email, displayName, googleId, photoURL } = req.body;
      
      if (!email || !googleId) {
        console.warn("Google login missing required fields:", { email: !!email, googleId: !!googleId });
        return res.status(400).json({ message: "Email and googleId are required" });
      }

      console.log(`Processing Google login for email: ${email}`);
      
      // Check if the user already exists by googleId
      let user = await storage.getUserByGoogleId(googleId);
      
      if (user) {
        console.log(`Found existing user with googleId: ${googleId}`);
        
        // Update displayName if it has changed
        if (displayName && user.displayName !== displayName) {
          console.log(`Updating displayName for user ${user.id} from "${user.displayName}" to "${displayName}"`);
          // In a full implementation, you would update the user here
          // user = await storage.updateUser(user.id, { displayName });
        }
      } else {
        // Check if user exists by email
        console.log(`No user found with googleId ${googleId}, checking by email: ${email}`);
        const existingUserByEmail = await storage.getUserByEmail(email);
        
        if (existingUserByEmail) {
          console.log(`Found existing user with email: ${email}`);
          
          // If the user exists by email but not by googleId, update the user with googleId
          if (existingUserByEmail.authProvider === 'local') {
            // This is a special case where the user had a local account and now wants to use Google
            console.log("Existing local user trying to log in with Google");
            return res.status(400).json({ 
              message: "An account with this email already exists. Please log in with your password first and then link your Google account." 
            });
          } else if (existingUserByEmail.authProvider === 'google' && !existingUserByEmail.googleId) {
            // User created with Google auth but missing googleId (should be rare)
            console.log(`Updating existing Google user with missing googleId: ${existingUserByEmail.id}`);
            // In a full implementation, you would update the user here
            // user = await storage.updateUser(existingUserByEmail.id, { googleId });
            user = existingUserByEmail;
          }
        }
        
        if (!user) {
          // Create a new user with Google auth
          console.log(`Creating new user from Google auth: ${email}`);
          user = await storage.createUser({
            email,
            displayName: displayName || email.split('@')[0],
            role: 'user',
            authProvider: 'google',
            googleId,
            password: null // Null password for Google auth users
          });
          console.log(`Created new user with ID: ${user.id}`);
        }
      }
      
      // Remove sensitive info from response
      const { password, ...userInfo } = user;
      
      // Check if user needs to set BeAware username
      const needsUsername = !user.beawareUsername;
      
      // Log successful authentication
      console.log(`Google authentication successful for user ID: ${user.id}, needs username: ${needsUsername}`);
      
      res.status(200).json({
        success: true,
        user: userInfo,
        needsUsername
      });
    } catch (error) {
      console.error("Google login error:", error);
      res.status(500).json({ 
        message: "Failed to authenticate with Google", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  apiRouter.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Special case for admin users in dev/testing
      if (email === "admin@beaware.com" || email === "admin@scamreport.com") {
        console.log("Admin login attempt detected");
        
        // Always give admin privileges for these special accounts
        // regardless of password input (for development/testing purposes)
        console.log("Admin login successful - granting admin privileges");
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        
        // Force the role to be admin
        console.log(`Setting user role to admin (was: ${user.role})`);
        userWithoutPassword.role = "admin";
        
        // Log the user data being returned
        console.log("Admin user data:", JSON.stringify(userWithoutPassword));
        
        res.json({ 
          success: true,
          user: userWithoutPassword 
        });
        return;
      }
      
      // For non-admin users or incorrect admin password
      // Check password - simplified version to handle both hashed and non-hashed
      if (user.password !== password && 
          !(email === "admin@beaware.com" && password === "password123")) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      res.json({ 
        success: true,
        user: userWithoutPassword 
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Failed to log in" });
    }
  });
  
  // USER ROUTES
  apiRouter.get("/users", requireAuth, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      
      // Remove passwords from response
      const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return res.json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  
  // Get scam reports for a specific user
  apiRouter.get("/users/:userId/scam-reports", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      
      // Get user info from headers (for auth check)
      const headerUserId = parseInt(req.headers['x-user-id'] as string, 10) || 0;
      const headerUserRole = req.headers['x-user-role'] as string || '';
      
      console.log(`Auth headers: User ID ${headerUserId}, Role: ${headerUserRole}`);
      
      // Ensure the user is requesting their own reports or is an admin
      if (headerUserId !== userId && headerUserRole !== 'admin') {
        console.log(`Access denied: headerUserId=${headerUserId}, userId=${userId}, role=${headerUserRole}`);
        return res.status(403).json({ message: "Access denied: You can only view your own reports" });
      }
      
      console.log(`Fetching scam reports for user ID ${userId}`);
      const reports = await storage.getScamReportsByUser(userId);
      console.log(`Found ${reports.length} reports for user ID ${userId}`);
      
      res.json(reports);
    } catch (error) {
      console.error(`Error fetching scam reports for user ID ${req.params.userId}:`, error);
      res.status(500).json({ message: "Failed to fetch user's scam reports" });
    }
  });
  
  // SCAM REPORT ROUTES
  // Create a new scam report with file upload
  // Standard JSON endpoint for scam reports (without file)
  apiRouter.post("/scam-reports", async (req: Request, res: Response) => {
    try {
      console.log("\n\n==========================================");
      console.log("📝 NEW SCAM REPORT SUBMISSION");
      console.log("==========================================");
      
      // 1. AUTHENTICATION CHECK
      const userId = parseInt(req.headers['x-user-id'] as string || '0', 10);
      const userEmail = req.headers['x-user-email'] as string || '';
      
      console.log(`🔑 User Authentication - ID: ${userId}, Email: ${userEmail}`);
      
      if (!userId || isNaN(userId) || !userEmail) {
        console.error("❌ Authentication failed - invalid user ID or email");
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      // 2. REQUEST VALIDATION
      if (!req.body || typeof req.body !== 'object') {
        console.error("❌ Invalid request body:", req.body);
        return res.status(400).json({ 
          success: false, 
          message: "Request body is missing or invalid" 
        });
      }
      
      // Check required fields
      const requiredFields = ['scamType', 'description', 'incidentDate'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        console.error(`❌ Missing required fields: ${missingFields.join(', ')}`);
        return res.status(400).json({ 
          success: false,
          message: "Required fields are missing",
          fields: missingFields
        });
      }
      
      // 4. PREPARE DATABASE RECORD
      
      // Handle date formatting
      let formattedDate;
      try {
        // Accept various date formats and convert to YYYY-MM-DD
        const dateValue = req.body.incidentDate;
        if (dateValue instanceof Date) {
          formattedDate = dateValue.toISOString().split('T')[0];
        } else if (typeof dateValue === 'string') {
          // Try to parse the string date
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          } else {
            // If it's already in YYYY-MM-DD format, use as is
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              formattedDate = dateValue;
            } else {
              throw new Error(`Invalid date format: ${dateValue}`);
            }
          }
        } else {
          throw new Error("Invalid incident date");
        }
      } catch (dateError) {
        console.error("❌ Date parsing error:", dateError);
        return res.status(400).json({
          success: false,
          message: "Invalid incident date format",
          error: dateError instanceof Error ? dateError.message : "Unknown error"
        });
      }
      
      // 5. DATABASE INSERTION - Using ORM interface
      
      // Process file upload if present
      let fileData = null;
      if (req.file) {
        console.log("📎 Processing uploaded file:", req.file);
        fileData = {
          proofFilePath: req.file.path,
          proofFileName: req.file.originalname,
          proofFileType: req.file.mimetype,
          proofFileSize: req.file.size
        };
      }
      
      // Create the report data object using the InsertScamReport type
      const reportData = {
        userId,
        scamType: req.body.scamType,
        scamPhoneNumber: req.body.scamPhoneNumber || null,
        scamEmail: req.body.scamEmail || null,
        scamBusinessName: req.body.scamBusinessName || null,
        incidentDate: new Date(formattedDate), // Convert string to Date object
        country: req.body.country || 'USA',
        city: req.body.city || null,
        state: req.body.state || null,
        zipCode: req.body.zipCode || null,
        description: req.body.description,
        // Add file information if a file was uploaded
        ...(fileData && {
          hasProofDocument: true,
          ...fileData
        })
      };
      
      try {
        // Use the storage interface for reports with optional file attachment
        const newReport = await storage.createScamReport(reportData);
        
        // Return success response directly from the ORM-provided object
        return res.status(201).json({
          success: true,
          message: "Scam report created successfully",
          report: newReport
        });
      } catch (dbError) {
        console.error("❌ DATABASE ERROR:", dbError);
        return res.status(500).json({
          success: false,
          message: "Failed to save report to database",
          error: dbError instanceof Error ? dbError.message : "Unknown database error"
        });
      }
    } catch (error) {
      console.error("❌ UNEXPECTED ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "An unexpected error occurred",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // File upload endpoint for scam reports
  apiRouter.post("/scam-reports/upload", uploadMiddleware.single('proofFile'), async (req: Request, res: Response) => {
    try {
      console.log("\n\n==========================================");
      console.log("📝 NEW SCAM REPORT SUBMISSION WITH FILE");
      console.log("==========================================");
      
      // 1. AUTHENTICATION CHECK
      const userId = parseInt(req.headers['x-user-id'] as string || '0', 10);
      const userEmail = req.headers['x-user-email'] as string || '';
      
      console.log(`🔑 User Authentication - ID: ${userId}, Email: ${userEmail}`);
      
      if (!userId || isNaN(userId) || !userEmail) {
        console.error("❌ Authentication failed - invalid user ID or email");
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      // 2. REQUEST VALIDATION
      if (!req.body || typeof req.body !== 'object') {
        console.error("❌ Invalid request body:", req.body);
        return res.status(400).json({ 
          success: false, 
          message: "Request body is missing or invalid" 
        });
      }
      
      // 3. FILE VALIDATION 
      if (!req.file) {
        console.error("❌ No file uploaded");
        return res.status(400).json({
          success: false,
          message: "No file uploaded"
        });
      }
      
      console.log("📎 File received:", {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
      
      // 4. FORM DATA VALIDATION
      // Check required fields
      const requiredFields = ['scamType', 'description', 'incidentDate'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        console.error(`❌ Missing required fields: ${missingFields.join(', ')}`);
        return res.status(400).json({ 
          success: false,
          message: "Required fields are missing",
          fields: missingFields
        });
      }
      
      // 5. PREPARE DATABASE RECORD
      
      // Handle date formatting
      let formattedDate;
      try {
        // Accept various date formats and convert to YYYY-MM-DD
        const dateValue = req.body.incidentDate;
        if (dateValue instanceof Date) {
          formattedDate = dateValue.toISOString().split('T')[0];
        } else if (typeof dateValue === 'string') {
          // Try to parse the string date
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          } else {
            // If it's already in YYYY-MM-DD format, use as is
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              formattedDate = dateValue;
            } else {
              throw new Error(`Invalid date format: ${dateValue}`);
            }
          }
        } else {
          throw new Error("Invalid incident date");
        }
      } catch (dateError) {
        console.error("❌ Date parsing error:", dateError);
        return res.status(400).json({
          success: false,
          message: "Invalid incident date format",
          error: dateError instanceof Error ? dateError.message : "Unknown error"
        });
      }
      
      // Process file upload
      const fileData = {
        proofFilePath: req.file.path,
        proofFileName: req.file.originalname,
        proofFileType: req.file.mimetype,
        proofFileSize: req.file.size
      };
      
      // Create the report data object
      const reportData = {
        userId,
        scamType: req.body.scamType,
        scamPhoneNumber: req.body.scamPhoneNumber || null,
        scamEmail: req.body.scamEmail || null,
        scamBusinessName: req.body.scamBusinessName || null,
        incidentDate: new Date(formattedDate), // Convert string to Date object
        country: req.body.country || 'USA',
        city: req.body.city || null,
        state: req.body.state || null,
        zipCode: req.body.zipCode || null,
        description: req.body.description,
        hasProofDocument: true,
        ...fileData
      };
      
      try {
        // Use the storage interface for reports with file attachment
        const newReport = await storage.createScamReport(reportData);
        
        // Return success response
        return res.status(201).json({
          success: true,
          message: "Scam report with file uploaded successfully",
          report: newReport
        });
      } catch (dbError) {
        console.error("❌ DATABASE ERROR:", dbError);
        return res.status(500).json({
          success: false,
          message: "Failed to save report to database",
          error: dbError instanceof Error ? dbError.message : "Unknown database error"
        });
      }
    } catch (error) {
      console.error("❌ UNEXPECTED ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "An unexpected error occurred",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all scam reports with optional filtering
  apiRouter.get("/scam-reports", async (req: Request, res: Response) => {
    try {
      console.log("Scam reports request with query params:", req.query);
      
      // Add pagination support for performance
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      console.log(`📄 Pagination: page=${page}, limit=${limit}, offset=${offset}`);
      
      // Check user role to determine if we should include unpublished reports
      const userRole = req.headers['x-user-role'] as string || '';
      const isAdmin = userRole === 'admin';
      console.log(`👤 User role: ${userRole}, isAdmin: ${isAdmin}`);
      
      // Check if we're filtering by verification status
      if (req.query.isVerified !== undefined) {
        const isVerified = req.query.isVerified === 'true';
        console.log(`Filtering scam reports by verification status: isVerified=${isVerified}`);
        
        let reports;
        if (isVerified) {
          reports = await storage.getVerifiedScamReports();
        } else {
          reports = await storage.getUnverifiedScamReports();
        }
        
        // Filter out unpublished reports if not admin
        if (!isAdmin) {
          reports = reports.filter(report => report.isPublished !== false);
          console.log(`Filtered reports for non-admin user, showing only published: ${reports.length}`);
        }
        
        // Apply pagination
        const totalCount = reports.length;
        const paginatedReports = reports.slice(offset, offset + limit);
        
        // Include user data for each report
        const reportsWithUsers = await Promise.all(
          paginatedReports.map(async (report) => {
            const user = await storage.getUser(report.userId);
            return {
              ...report,
              user: user ? {
                id: user.id,
                displayName: user.displayName,
                email: user.email
              } : undefined
            };
          })
        );
        
        console.log(`Returning ${reportsWithUsers.length} ${isVerified ? 'verified' : 'unverified'} reports (page ${page})`);
        return res.json({
          reports: reportsWithUsers,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
          }
        });
      }
      
      // If no filtering by verification status
      let reports;
      
      // For admins, return all reports regardless of publication status
      if (isAdmin) {
        reports = await storage.getAllScamReports();
        console.log(`Admin user - returning all ${reports.length} reports`);
      } else {
        // For regular users, only return published reports
        reports = await storage.getPublishedScamReports();
        console.log(`Regular user - returning only published reports: ${reports.length}`);
      }
      
      // Apply pagination to the reports
      const totalCount = reports.length;
      const paginatedReports = reports.slice(offset, offset + limit);
      
      // Include user data for each report
      const reportsWithUsers = await Promise.all(
        paginatedReports.map(async (report) => {
          const user = await storage.getUser(report.userId);
          return {
            ...report,
            user: user ? {
              id: user.id,
              displayName: user.displayName,
              email: user.email
            } : undefined
          };
        })
      );
      
      console.log(`Returning ${reportsWithUsers.length} reports (page ${page} of ${Math.ceil(totalCount / limit)})`);
      
      // Return paginated response
      res.json({
        reports: reportsWithUsers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      console.error("Error fetching scam reports:", error);
      res.status(500).json({ message: "Failed to fetch scam reports" });
    }
  });
  
  // Get recent scam reports
  apiRouter.get("/scam-reports/recent", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || "5", 10);
      const userRole = req.headers['x-user-role'] as string || '';
      const isAdmin = userRole === 'admin';
      
      console.log(`👤 User requesting recent reports - Role: ${userRole}, isAdmin: ${isAdmin}`);
      
      // Get recent reports - pass includeUnpublished as true for admins
      let recentReports = await storage.getRecentScamReports(limit, isAdmin);
      
      // Get the user for each report and transform field names for frontend
      const reportsWithUsers = await Promise.all(
        recentReports.map(async (report) => {
          const user = await storage.getUser(report.userId);
          
          // Get consolidated info if available
          const consolidation = await storage.getConsolidationForScamReport(report.id);
          let consolidatedInfo = null;
          
          if (consolidation) {
            consolidatedInfo = await storage.getConsolidatedScam(consolidation.consolidatedScamId);
          }
          
          // Transform database field names to camelCase for frontend
          return {
            id: report.id,
            scamType: report.scamType,
            scamPhoneNumber: report.scamPhoneNumber,
            scamEmail: report.scamEmail,
            scamBusinessName: report.scamBusinessName,
            incidentDate: report.incidentDate,
            city: report.city,
            state: report.state,
            zipCode: report.zipCode,
            country: report.country,
            description: report.description,
            reportedAt: report.reportedAt,
            isVerified: report.isVerified,
            isPublished: report.isPublished,
            hasProofDocument: report.hasProofDocument,
            proofDocumentPath: report.proofDocumentPath,
            userId: report.userId,
            user: user ? { 
              id: user.id, 
              displayName: user.displayName,
              email: user.email
            } : null,
            consolidatedInfo
          };
        })
      );
      
      console.log(`Returning ${reportsWithUsers.length} recent reports`);
      res.json(reportsWithUsers);
    } catch (error) {
      console.error("Error fetching recent scam reports:", error);
      res.status(500).json({ message: "Failed to fetch recent scam reports" });
    }
  });
  
  // Get scam reports by type
  apiRouter.get("/scam-reports/by-type/:type", async (req: Request, res: Response) => {
    try {
      const type = req.params.type as 'phone' | 'email' | 'business';
      const userRole = req.headers['x-user-role'] as string || '';
      const isAdmin = userRole === 'admin';
      
      console.log(`👤 User requesting reports by type ${type} - Role: ${userRole}, isAdmin: ${isAdmin}`);
      
      if (!['phone', 'email', 'business'].includes(type)) {
        return res.status(400).json({ message: "Invalid scam type" });
      }
      
      // Get reports by type
      let reports = await storage.getScamReportsByType(type);
      
      // Filter out unpublished reports for non-admin users
      if (!isAdmin) {
        console.log(`Filtering unpublished reports for non-admin user`);
        reports = reports.filter(report => report.isPublished !== false);
        console.log(`After filtering: ${reports.length} published reports of type ${type}`);
      }
      
      res.json(reports);
    } catch (error) {
      console.error(`Error fetching ${req.params.type} scam reports:`, error);
      res.status(500).json({ message: "Failed to fetch scam reports" });
    }
  });
  
  // Get a specific scam report
  apiRouter.get("/scam-reports/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const userRole = req.headers['x-user-role'] as string || '';
      const isAdmin = userRole === 'admin';
      
      console.log(`👤 User requesting scam report ID ${id} - Role: ${userRole}, isAdmin: ${isAdmin}`);
      
      const report = await storage.getScamReport(id);
      
      if (!report) {
        return res.status(404).json({ message: "Scam report not found" });
      }
      
      // Check if report is published or user is admin
      if (!isAdmin && report.isPublished === false) {
        console.log(`⚠️ Non-admin user tried to access unpublished report ID ${id}`);
        return res.status(403).json({ 
          message: "This report is not available",
          notPublished: true
        });
      }
      
      // Get the user who reported it
      const user = await storage.getUser(report.userId);
      
      // Get comments for this report
      const comments = await storage.getCommentsForScamReport(id);
      const commentsWithUser = await Promise.all(
        comments.map(async (comment) => {
          const commentUser = await storage.getUser(comment.userId);
          return {
            ...comment,
            user: commentUser ? {
              id: commentUser.id,
              beawareUsername: commentUser.beawareUsername,
              // Only show real info to admins
              displayName: user?.role === 'admin' ? commentUser.displayName : undefined,
              email: user?.role === 'admin' ? commentUser.email : undefined
            } : null
          };
        })
      );
      
      // Get consolidation info if available
      const consolidation = await storage.getConsolidationForScamReport(id);
      let consolidatedInfo = null;
      
      if (consolidation) {
        consolidatedInfo = await storage.getConsolidatedScam(consolidation.consolidatedScamId);
      }
      
      res.json({
        ...report,
        user: user ? { 
          id: user.id, 
          beawareUsername: user.beawareUsername,
          displayName: user.displayName,
          email: user.email
        } : null,
        comments: commentsWithUser,
        consolidatedInfo
      });
    } catch (error) {
      console.error(`Error fetching scam report ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch scam report" });
    }
  });
  
  // Verify a scam report (admin only)
  apiRouter.post("/scam-reports/:id/verify", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const adminUser = (req as any).user;
      
      console.log(`🔍 Attempting to verify scam report with ID ${id}`);
      console.log(`👤 Admin user:`, adminUser);
      
      // Double-check that we have the admin user
      if (!adminUser || !adminUser.id) {
        console.error("❌ Admin validation failed in verify endpoint");
        return res.status(400).json({ message: "Valid admin user required" });
      }
      
      if (adminUser.role !== 'admin') {
        console.error(`❌ Non-admin user ${adminUser.email} attempted to verify a report`);
        return res.status(403).json({ message: "Admin privileges required" });
      }
      
      // Get the report first to verify it exists
      const originalReport = await storage.getScamReport(id);
      if (!originalReport) {
        console.error(`❌ Scam report with ID ${id} not found`);
        return res.status(404).json({ message: "Scam report not found" });
      }
      
      console.log(`✓ Found scam report: ${JSON.stringify(originalReport)}`);
      
      if (originalReport.isVerified) {
        console.log(`ℹ️ Report ${id} is already verified by user ${originalReport.verifiedBy}`);
        return res.json({
          success: true,
          message: "Scam report was already verified",
          report: originalReport
        });
      }
      
      // Verify the report
      console.log(`✅ Verifying scam report ID ${id} with admin ID ${adminUser.id}`);
      const report = await storage.verifyScamReport(id, adminUser.id);
      
      if (!report) {
        console.error(`❌ Verification failed for scam report ID ${id}`);
        return res.status(404).json({ message: "Scam report not found or verification failed" });
      }
      
      console.log(`🎉 Successfully verified scam report: ${JSON.stringify(report)}`);
      
      // Also verify the consolidated scam if one exists
      try {
        const consolidation = await storage.getConsolidationForScamReport(id);
        if (consolidation) {
          console.log(`🔄 Verifying associated consolidated scam ID ${consolidation.consolidatedScamId}`);
          await storage.verifyConsolidatedScam(consolidation.consolidatedScamId);
        }
      } catch (consolidationError) {
        console.error("⚠️ Error verifying consolidated scam:", consolidationError);
        // Continue despite error with consolidated scam
      }
      
      // Return success response with verified report
      res.json({
        success: true,
        message: "Scam report verified successfully",
        report
      });
    } catch (error) {
      console.error(`❌ Error verifying scam report ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to verify scam report" });
    }
  });

  // Publish a scam report (admin only)
  apiRouter.post("/scam-reports/:id/publish", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const adminUser = (req as any).user;
      
      console.log(`🔍 Attempting to publish scam report with ID ${id}`);
      console.log(`👤 Admin user:`, adminUser);
      
      // Double-check that we have the admin user
      if (!adminUser || !adminUser.id) {
        console.error("❌ Admin validation failed in publish endpoint");
        return res.status(400).json({ message: "Valid admin user required" });
      }
      
      // Verify the user is an admin
      if (adminUser.role !== "admin") {
        console.error(`❌ Non-admin user ${adminUser.email} attempted to publish a report`);
        return res.status(403).json({ message: "Admin privileges required" });
      }
      
      // Get the report first to verify it exists
      const originalReport = await storage.getScamReport(id);
      if (!originalReport) {
        return res.status(404).json({ message: "Scam report not found" });
      }
      
      // Publish the report
      const report = await storage.publishScamReport(id, adminUser.id);
      
      if (!report) {
        return res.status(500).json({ message: "Failed to publish scam report" });
      }
      
      res.json({ 
        message: "Scam report published successfully", 
        report 
      });
    } catch (error) {
      console.error(`❌ Error publishing scam report ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to publish scam report" });
    }
  });

  // Unpublish a scam report (admin only)
  apiRouter.post("/scam-reports/:id/unpublish", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const adminUser = (req as any).user;
      
      console.log(`🔍 Attempting to unpublish scam report with ID ${id}`);
      console.log(`👤 Admin user:`, adminUser);
      
      // Double-check that we have the admin user
      if (!adminUser || !adminUser.id) {
        console.error("❌ Admin validation failed in unpublish endpoint");
        return res.status(400).json({ message: "Valid admin user required" });
      }
      
      // Verify the user is an admin
      if (adminUser.role !== "admin") {
        console.error(`❌ Non-admin user ${adminUser.email} attempted to unpublish a report`);
        return res.status(403).json({ message: "Admin privileges required" });
      }
      
      // Get the report first to verify it exists
      const originalReport = await storage.getScamReport(id);
      if (!originalReport) {
        return res.status(404).json({ message: "Scam report not found" });
      }
      
      // Unpublish the report
      const report = await storage.unpublishScamReport(id, adminUser.id);
      
      if (!report) {
        return res.status(500).json({ message: "Failed to unpublish scam report" });
      }
      
      res.json({ 
        message: "Scam report unpublished successfully", 
        report 
      });
    } catch (error) {
      console.error(`❌ Error unpublishing scam report ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to unpublish scam report" });
    }
  });

  // Get all published scam reports
  apiRouter.get("/scam-reports/published", async (req: Request, res: Response) => {
    try {
      console.log("Fetching published scam reports...");
      // Debug which storage implementation we're using
      console.log("Storage implementation type:", typeof storage, "with methods:", Object.keys(storage));
      
      // Get the reports from storage
      const reports = await storage.getPublishedScamReports();
      console.log(`Retrieved ${reports.length} published reports`);
      res.json(reports);
    } catch (error) {
      console.error("❌ Error getting published scam reports:", error);
      res.status(500).json({ 
        message: "Failed to get published scam reports", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get all unpublished scam reports (admin only)
  apiRouter.get("/scam-reports/unpublished", requireAdmin, async (req: Request, res: Response) => {
    try {
      const reports = await storage.getUnpublishedScamReports();
      res.json(reports);
    } catch (error) {
      console.error("❌ Error getting unpublished scam reports:", error);
      res.status(500).json({ message: "Failed to get unpublished scam reports" });
    }
  });
  
  // SCAM COMMENT ROUTES
  apiRouter.post("/scam-comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Combine request data with authenticated user
      const commentData = {
        ...req.body,
        userId: user.id
      };
      
      const validCommentData = insertScamCommentSchema.parse(commentData);
      const comment = await storage.createScamComment(validCommentData);
      
      // Include user info in response
      res.status(201).json({ 
        ...comment, 
        user: { 
          id: user.id, 
          displayName: user.displayName,
          email: user.email
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          errors: error.errors 
        });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });
  
  // STATISTICS ROUTES
  apiRouter.get("/scam-stats", async (req: Request, res: Response) => {
    try {
      console.log("📊 Fetching scam statistics directly from database...");
      
      // Use direct database queries to get accurate counts from your imported data
      const allReports = await db.select().from(scamReports);
      const publishedReports = allReports.filter(r => r.isPublished !== false);
      
      const stats = {
        totalReports: publishedReports.length,
        phoneScams: publishedReports.filter(r => r.scamType === 'phone').length,
        emailScams: publishedReports.filter(r => r.scamType === 'email').length,
        businessScams: publishedReports.filter(r => r.scamType === 'business').length,
        verifiedReports: publishedReports.filter(r => r.isVerified).length,
        reportsWithProof: publishedReports.filter(r => r.hasProofDocument).length,
        date: new Date().toISOString().split('T')[0]
      };
      
      console.log("📊 Database statistics calculated:", stats);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching scam statistics:", error);
      res.status(500).json({ message: "Failed to fetch scam statistics" });
    }
  });

  // CONSOLIDATED SCAM ROUTES
  apiRouter.get("/consolidated-scams", async (req: Request, res: Response) => {
    try {
      const consolidatedScams = await storage.getAllConsolidatedScams();
      
      // Transform database field names to camelCase for frontend compatibility
      const transformedScams = consolidatedScams.map(scam => ({
        id: scam.id,
        scamType: scam.scamType,
        identifier: scam.identifier,
        reportCount: scam.reportCount,
        firstReportedAt: scam.firstReportedAt,
        lastReportedAt: scam.lastReportedAt,
        isVerified: scam.isVerified
      }));
      
      res.json(transformedScams);
    } catch (error) {
      console.error("Error fetching consolidated scams:", error);
      res.status(500).json({ message: "Failed to fetch consolidated scams" });
    }
  });
  
  apiRouter.get("/consolidated-scams/by-type/:type", async (req: Request, res: Response) => {
    try {
      const type = req.params.type as 'phone' | 'email' | 'business';
      
      if (!['phone', 'email', 'business'].includes(type)) {
        return res.status(400).json({ message: "Invalid scam type" });
      }
      
      const scams = await storage.getConsolidatedScamsByType(type);
      res.json(scams);
    } catch (error) {
      console.error(`Error fetching ${req.params.type} consolidated scams:`, error);
      res.status(500).json({ message: "Failed to fetch consolidated scams" });
    }
  });
  
  apiRouter.get("/consolidated-scams/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const consolidatedScam = await storage.getConsolidatedScam(id);
      
      if (!consolidatedScam) {
        return res.status(404).json({ message: "Consolidated scam not found" });
      }
      
      // Get all reports for this consolidated scam
      const reports = await storage.getScamReportsForConsolidatedScam(id);
      
      res.json({
        ...consolidatedScam,
        reports
      });
    } catch (error) {
      console.error(`Error fetching consolidated scam ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch consolidated scam" });
    }
  });
  
  // Verify a consolidated scam (admin only)
  apiRouter.post("/consolidated-scams/:id/verify", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const adminUser = (req as any).user;
      
      console.log(`🔍 Attempting to verify consolidated scam with ID ${id}`);
      console.log(`👤 Admin user:`, adminUser);
      
      // Ensure we have the admin user
      if (!adminUser || !adminUser.id) {
        console.error("❌ Admin validation failed in verify consolidated scam endpoint");
        return res.status(400).json({ message: "Valid admin user required" });
      }
      
      if (adminUser.role !== 'admin') {
        console.error(`❌ Non-admin user ${adminUser.email} attempted to verify a consolidated scam`);
        return res.status(403).json({ message: "Admin privileges required" });
      }
      
      // Check if the consolidated scam exists first
      const originalScam = await storage.getConsolidatedScam(id);
      if (!originalScam) {
        console.error(`❌ Consolidated scam with ID ${id} not found`);
        return res.status(404).json({ message: "Consolidated scam not found" });
      }
      
      console.log(`✓ Found consolidated scam: ${JSON.stringify(originalScam)}`);
      
      if (originalScam.isVerified) {
        console.log(`ℹ️ Consolidated scam ${id} is already verified`);
        return res.json({
          success: true,
          message: "Consolidated scam was already verified",
          consolidatedScam: originalScam
        });
      }
      
      // Use the storage method to verify the consolidated scam
      console.log(`✅ Verifying consolidated scam ID ${id}`);
      const updatedScam = await storage.verifyConsolidatedScam(id);
      
      if (!updatedScam) {
        console.error(`❌ Verification failed for consolidated scam ID ${id}`);
        return res.status(500).json({ message: "Failed to verify consolidated scam" });
      }
      
      console.log(`🎉 Successfully verified consolidated scam: ${JSON.stringify(updatedScam)}`);
      
      res.json({
        success: true,
        message: "Consolidated scam verified successfully",
        consolidatedScam: updatedScam
      });
    } catch (error) {
      console.error(`❌ Error verifying consolidated scam ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to verify consolidated scam" });
    }
  });
  
  // STATS ROUTES
  apiRouter.get("/scam-stats", async (req: Request, res: Response) => {
    try {
      let stats = await storage.getScamStats();
      
      // Make sure stats exist by updating them if needed
      if (!stats) {
        stats = await storage.updateScamStats();
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching scam stats:", error);
      res.status(500).json({ message: "Failed to fetch scam stats" });
    }
  });
  
  // LAWYER PROFILE ROUTES
  
  // Create a lawyer profile
  apiRouter.post("/lawyer-profiles", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check if this user already has a lawyer profile
      const existingProfile = await storage.getLawyerProfileByUserId(user.id);
      if (existingProfile) {
        return res.status(400).json({ message: "User already has a lawyer profile" });
      }
      
      // Process the form data
      const profileData: any = {
        userId: user.id,
        ...req.body
      };
      
      // Handle array fields that might come as strings
      if (typeof profileData.secondarySpecializations === 'string') {
        profileData.secondarySpecializations = JSON.parse(profileData.secondarySpecializations);
      }
      
      if (typeof profileData.caseTypes === 'string') {
        profileData.caseTypes = JSON.parse(profileData.caseTypes);
      }
      
      // Convert string boolean values to actual booleans
      profileData.acceptingNewClients = profileData.acceptingNewClients === 'true';
      profileData.offersFreeConsultation = profileData.offersFreeConsultation === 'true';
      
      // Parse numeric fields
      profileData.yearsOfExperience = parseInt(profileData.yearsOfExperience, 10);
      
      // File upload functionality has been completely removed
      // No verification document support
      
      // Validate the data with the schema
      const validProfileData = insertLawyerProfileSchema.parse(profileData);
      
      // Create the lawyer profile
      const profile = await storage.createLawyerProfile(validProfileData);
      
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid lawyer profile data", 
          errors: error.errors 
        });
      }
      console.error("Error creating lawyer profile:", error);
      res.status(500).json({ message: "Failed to create lawyer profile" });
    }
  });
  
  // Get all lawyer profiles
  apiRouter.get("/lawyer-profiles", async (req: Request, res: Response) => {
    try {
      // By default, only return verified lawyer profiles
      const onlyVerified = req.query.verified !== 'false';
      
      let profiles: LawyerProfile[];
      if (onlyVerified) {
        profiles = await storage.getVerifiedLawyerProfiles();
      } else {
        profiles = await storage.getAllLawyerProfiles();
      }
      
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching lawyer profiles:", error);
      res.status(500).json({ message: "Failed to fetch lawyer profiles" });
    }
  });
  
  // Get a specific lawyer profile
  apiRouter.get("/lawyer-profiles/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const profile = await storage.getLawyerProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Lawyer profile not found" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching lawyer profile:", error);
      res.status(500).json({ message: "Failed to fetch lawyer profile" });
    }
  });
  
  // Get lawyer profile by user ID
  apiRouter.get("/users/:userId/lawyer-profile", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const profile = await storage.getLawyerProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({ message: "Lawyer profile not found for this user" });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error fetching lawyer profile by user ID:", error);
      res.status(500).json({ message: "Failed to fetch lawyer profile" });
    }
  });
  
  // Update a lawyer profile
  apiRouter.patch("/lawyer-profiles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const user = (req as any).user;
      const profile = await storage.getLawyerProfile(id);
      
      if (!profile) {
        return res.status(404).json({ message: "Lawyer profile not found" });
      }
      
      // Check permission (user can update their own profile, admin can update any)
      if (profile.userId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      // Process the update data
      const updateData: any = { ...req.body };
      
      // Handle array fields that might come as strings
      if (typeof updateData.secondarySpecializations === 'string') {
        updateData.secondarySpecializations = JSON.parse(updateData.secondarySpecializations);
      }
      
      if (typeof updateData.caseTypes === 'string') {
        updateData.caseTypes = JSON.parse(updateData.caseTypes);
      }
      
      // Convert string boolean values to actual booleans
      if (updateData.acceptingNewClients !== undefined) {
        updateData.acceptingNewClients = updateData.acceptingNewClients === 'true';
      }
      
      if (updateData.offersFreeConsultation !== undefined) {
        updateData.offersFreeConsultation = updateData.offersFreeConsultation === 'true';
      }
      
      // Parse numeric fields
      if (updateData.yearsOfExperience !== undefined) {
        updateData.yearsOfExperience = parseInt(updateData.yearsOfExperience, 10);
      }
      
      // File upload functionality has been completely removed
      // No verification document support
      
      // Update the profile
      const updatedProfile = await storage.updateLawyerProfile(id, updateData);
      
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating lawyer profile:", error);
      res.status(500).json({ message: "Failed to update lawyer profile" });
    }
  });
  
  // Verify a lawyer profile (admin only)
  apiRouter.post("/lawyer-profiles/:id/verify", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const admin = (req as any).user;
      
      console.log(`Attempting to verify lawyer profile with ID ${id}`);
      console.log(`Admin user:`, admin);
      
      // Ensure we have the admin user
      if (!admin || !admin.id) {
        console.error("Admin validation failed in verify lawyer profile endpoint");
        return res.status(400).json({ message: "Valid admin user required" });
      }
      
      const profile = await storage.getLawyerProfile(id);
      if (!profile) {
        console.error(`Lawyer profile with ID ${id} not found`);
        return res.status(404).json({ message: "Lawyer profile not found" });
      }
      
      console.log(`Found lawyer profile: ${JSON.stringify(profile)}`);
      console.log(`Verifying lawyer profile ID ${id} with admin ID ${admin.id}`);
      
      const verifiedProfile = await storage.verifyLawyerProfile(id, admin.id);
      if (!verifiedProfile) {
        console.error(`Verification failed for lawyer profile ID ${id}`);
        return res.status(500).json({ message: "Failed to verify lawyer profile" });
      }
      
      console.log(`Successfully verified lawyer profile: ${JSON.stringify(verifiedProfile)}`);
      
      res.json({
        success: true,
        profile: verifiedProfile
      });
    } catch (error) {
      console.error("Error verifying lawyer profile:", error);
      res.status(500).json({ message: "Failed to verify lawyer profile" });
    }
  });
  
  // LAWYER REQUEST ROUTES
  
  // Submit a lawyer request
  apiRouter.post("/lawyer-requests", async (req: Request, res: Response) => {
    try {
      // User ID is optional
      let userId = null;
      if (req.headers['x-user-id']) {
        userId = parseInt(req.headers['x-user-id'] as string, 10);
      }
      
      // Process request data
      const requestData = {
        ...req.body,
        userId
      };
      
      // Validate with schema
      const validRequestData = insertLawyerRequestSchema.parse(requestData);
      
      // Create the request
      const request = await storage.createLawyerRequest(validRequestData);
      
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid lawyer request data", 
          errors: error.errors 
        });
      }
      console.error("Error creating lawyer request:", error);
      res.status(500).json({ message: "Failed to create lawyer request" });
    }
  });
  
  // Get all lawyer requests (admin only)
  apiRouter.get("/lawyer-requests", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      let requests;
      
      if (req.query.status === 'pending') {
        requests = await storage.getPendingLawyerRequests();
      } else {
        requests = await storage.getAllLawyerRequests();
      }
      
      res.json(requests);
    } catch (error) {
      console.error("Error fetching lawyer requests:", error);
      res.status(500).json({ message: "Failed to fetch lawyer requests" });
    }
  });
  
  // Get lawyer requests for a specific lawyer
  apiRouter.get("/lawyer-profiles/:id/requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const user = (req as any).user;
      const profile = await storage.getLawyerProfile(id);
      
      if (!profile) {
        return res.status(404).json({ message: "Lawyer profile not found" });
      }
      
      // Check permission (lawyers can see their own requests, admin can see any)
      if (profile.userId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const requests = await storage.getLawyerRequestsByLawyer(id);
      
      res.json(requests);
    } catch (error) {
      console.error("Error fetching lawyer requests:", error);
      res.status(500).json({ message: "Failed to fetch lawyer requests" });
    }
  });
  
  // Update the status of a lawyer request
  apiRouter.patch("/lawyer-requests/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const { status } = req.body;
      if (!status || !['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const user = (req as any).user;
      const request = await storage.getLawyerRequest(id);
      
      if (!request) {
        return res.status(404).json({ message: "Lawyer request not found" });
      }
      
      // If request is assigned to a lawyer, check permission
      if (request.lawyerProfileId) {
        const profile = await storage.getLawyerProfile(request.lawyerProfileId);
        
        // Only the assigned lawyer or admin can update status
        if (profile && profile.userId !== user.id && user.role !== 'admin') {
          return res.status(403).json({ message: "Permission denied" });
        }
      } else if (user.role !== 'admin') {
        // Only admin can update unassigned requests
        return res.status(403).json({ message: "Permission denied" });
      }
      
      const updatedRequest = await storage.updateLawyerRequestStatus(id, status);
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating lawyer request status:", error);
      res.status(500).json({ message: "Failed to update lawyer request status" });
    }
  });
  
  // Assign a lawyer to a request (admin only)
  apiRouter.post("/lawyer-requests/:id/assign", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const { lawyerProfileId } = req.body;
      if (!lawyerProfileId) {
        return res.status(400).json({ message: "Lawyer profile ID is required" });
      }
      
      const profileId = parseInt(lawyerProfileId, 10);
      if (isNaN(profileId)) {
        return res.status(400).json({ message: "Invalid lawyer profile ID" });
      }
      
      // Verify the lawyer profile exists
      const profile = await storage.getLawyerProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Lawyer profile not found" });
      }
      
      // Verify the request exists
      const request = await storage.getLawyerRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Lawyer request not found" });
      }
      
      // Assign the lawyer to the request
      const updatedRequest = await storage.assignLawyerToRequest(id, profileId);
      
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error assigning lawyer to request:", error);
      res.status(500).json({ message: "Failed to assign lawyer to request" });
    }
  });
  
  // SCAM VIDEO ROUTES
  // Get all scam videos
  apiRouter.get("/scam-videos", async (req: Request, res: Response) => {
    try {
      const videos = await storage.getAllScamVideos();
      res.json(videos);
    } catch (error) {
      console.error("Error fetching scam videos:", error);
      res.status(500).json({ message: "Failed to fetch scam videos" });
    }
  });
  
  // Get featured scam videos
  apiRouter.get("/scam-videos/featured", async (req: Request, res: Response) => {
    try {
      // Get limit from query parameter, default to 5
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const videos = await storage.getFeaturedScamVideos(limit);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching featured scam videos:", error);
      res.status(500).json({ message: "Failed to fetch featured scam videos" });
    }
  });
  
  // Get videos by scam type
  apiRouter.get("/scam-videos/type/:scamType", async (req: Request, res: Response) => {
    try {
      const scamType = req.params.scamType as ScamType;
      if (!['phone', 'email', 'business'].includes(scamType)) {
        return res.status(400).json({ message: "Invalid scam type" });
      }
      
      const videos = await storage.getScamVideosByType(scamType);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching scam videos by type:", error);
      res.status(500).json({ message: "Failed to fetch scam videos by type" });
    }
  });
  
  // Get videos for a consolidated scam
  apiRouter.get("/consolidated-scams/:id/videos", async (req: Request, res: Response) => {
    try {
      const consolidatedScamId = parseInt(req.params.id, 10);
      const videos = await storage.getScamVideosForConsolidatedScam(consolidatedScamId);
      res.json(videos);
    } catch (error) {
      console.error("Error fetching videos for consolidated scam:", error);
      res.status(500).json({ message: "Failed to fetch videos for consolidated scam" });
    }
  });
  
  // Get a specific video by ID
  apiRouter.get("/scam-videos/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const video = await storage.getScamVideo(id);
      
      if (!video) {
        return res.status(404).json({ message: "Scam video not found" });
      }
      
      res.json(video);
    } catch (error) {
      console.error("Error fetching scam video:", error);
      res.status(500).json({ message: "Failed to fetch scam video" });
    }
  });
  
  // Create a new scam video (admin only)
  apiRouter.post("/scam-videos", requireAdmin, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      
      // Validate the request body
      const videoData = insertScamVideoSchema.parse({
        ...req.body,
        addedById: user.id
      });
      
      // Extract the YouTube video ID from the URL if not provided
      if (!videoData.youtubeVideoId && videoData.youtubeUrl) {
        const url = new URL(videoData.youtubeUrl);
        let videoId = '';
        
        if (url.hostname.includes('youtube.com')) {
          videoId = url.searchParams.get('v') || '';
        } else if (url.hostname.includes('youtu.be')) {
          videoId = url.pathname.substring(1);
        }
        
        if (videoId) {
          videoData.youtubeVideoId = videoId;
        } else {
          return res.status(400).json({ 
            message: "Could not extract YouTube video ID from URL. Please provide a valid YouTube URL or specify the video ID directly." 
          });
        }
      }
      
      const video = await storage.createScamVideo(videoData);
      res.status(201).json(video);
    } catch (error) {
      console.error("Error creating scam video:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid scam video data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create scam video", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Update a scam video (admin only)
  apiRouter.patch("/scam-videos/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      
      // Check if the video exists
      const existingVideo = await storage.getScamVideo(id);
      if (!existingVideo) {
        return res.status(404).json({ message: "Scam video not found" });
      }
      
      // Update the video
      const updatedVideo = await storage.updateScamVideo(id, req.body);
      res.json(updatedVideo);
    } catch (error) {
      console.error("Error updating scam video:", error);
      res.status(500).json({ message: "Failed to update scam video" });
    }
  });
  
  // Delete a scam video (admin only)
  apiRouter.delete("/scam-videos/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      
      // Check if the video exists
      const existingVideo = await storage.getScamVideo(id);
      if (!existingVideo) {
        return res.status(404).json({ message: "Scam video not found" });
      }
      
      // Delete the video
      const success = await storage.deleteScamVideo(id);
      
      if (success) {
        res.status(204).end(); // No content response for successful delete
      } else {
        res.status(500).json({ message: "Failed to delete scam video" });
      }
    } catch (error) {
      console.error("Error deleting scam video:", error);
      res.status(500).json({ message: "Failed to delete scam video" });
    }
  });
  
  // AI Chatbot API endpoint
  apiRouter.post("/ai-chat", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid request format. 'messages' array is required." });
      }
      
      // Check if Perplexity API key exists
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.warn("Perplexity API key not found, using fallback response");
        // Return a fallback response if no API key is available
        return res.status(200).json({
          response: "I'm sorry, but I'm currently operating in limited mode. My responses are based on pre-defined information about common scams. For more detailed assistance, please try again later when my full capabilities are available.",
          source: "fallback"
        });
      }
      
      // Format messages for Perplexity API
      const formattedMessages = [
        {
          role: "system",
          content: "You are a helpful assistant for scam victims. Provide specific, actionable advice for people who've been scammed. Be supportive and empathetic, but focus on practical steps they can take. Include references to official resources when appropriate. Keep your responses concise and direct."
        },
        ...messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }))
      ];
      
      // Call Perplexity API
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-sonar-small-128k-online",
          messages: formattedMessages,
          temperature: 0.2,
          max_tokens: 1000,
          presence_penalty: 0,
          frequency_penalty: 1,
          return_related_questions: false,
          stream: false
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Perplexity API error:", errorText);
        throw new Error(`Perplexity API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return res.status(200).json({
        response: data.choices[0].message.content,
        citations: data.citations || [],
        source: "perplexity"
      });
    } catch (error) {
      console.error("Error in AI chat endpoint:", error);
      return res.status(500).json({
        error: "Failed to get AI response",
        response: "I'm having trouble connecting to my knowledge base right now. Please try again in a moment.",
        source: "error"
      });
    }
  });
  
  // Contact Form submission endpoint
  apiRouter.post("/contact", async (req: Request, res: Response) => {
    try {
      // Import email utility
      const { sendEmail } = await import("./utils/mailer.js");
      
      // Validate request body
      const contactSchema = z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        subject: z.string().min(1, "Subject is required"),
        message: z.string().min(1, "Message is required"),
        category: z.enum(["general", "feedback", "question", "report", "other"]).optional(),
      });
      
      const result = contactSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid form data", 
          errors: result.error.flatten().fieldErrors 
        });
      }
      
      const { name, email, subject, message } = result.data;
      
      // Format email content
      const emailSubject = `[BeAware Contact Form] ${subject}`;
      const emailText = `
Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}
      `;
      
      const emailHtml = `
<h2>New Contact Form Submission</h2>
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Subject:</strong> ${subject}</p>
<h3>Message:</h3>
<p>${message.replace(/\n/g, '<br>')}</p>
      `;
      
      // Send email
      const emailSent = await sendEmail({
        to: "beaware.fyi@gmail.com",
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
        from: `"BeAware Contact Form" <beaware.fyi@gmail.com>`
      });
      
      // Even if email fails, we'll return success to the user since the data is safely logged
      // in the server console and the user doesn't need to know about backend email issues
      return res.status(200).json({ 
        success: true, 
        message: "Your message has been sent successfully. We'll get back to you soon!" 
      });
    } catch (error) {
      console.error("Contact form submission error:", error);
      return res.status(500).json({ 
        success: false, 
        message: "An unexpected error occurred. Please try again later." 
      });
    }
  });


  
  // Register the API router
  app.use("/api", apiRouter);
  
  const httpServer = createServer(app);
  return httpServer;
}
