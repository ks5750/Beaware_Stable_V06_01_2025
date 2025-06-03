import express, { type Request, Response, NextFunction } from "express";
import * as path from "path";
import { registerRoutes } from "./routes.js";
// Import vite utilities conditionally to avoid production errors

// Simple logging function
const log = (message: string) => console.log(message);

// Import global deployment configuration 
import * as fs from 'fs';

// Read and parse deploy-config.js as a module
const configPath = path.join(process.cwd(), 'deploy-config.js');
let config = {
  server: { port: process.env.PORT || 5000, host: '0.0.0.0' },
  database: { url: process.env.DATABASE_URL },
  firebase: {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  },
  uploads: {
    enabled: true,
    maxFileSize: 10 * 1024 * 1024,
    allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    directory: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  },
  email: {
    enabled: !!process.env.EMAIL_PASSWORD,
    from: 'beaware.fyi@gmail.com',
    password: process.env.EMAIL_PASSWORD,
  },
  environment: {
    isReplit: !!process.env.REPL_ID || !!process.env.REPL_SLUG,
    isProduction: process.env.NODE_ENV === 'production',
    isDocker: fs.existsSync('/.dockerenv') || process.env.RUNNING_IN_DOCKER === 'true',
    isAzure: !!process.env.WEBSITE_SITE_NAME || !!process.env.WEBSITE_INSTANCE_ID,
  },
};

// Create a simple validation function
const validateConfig = () => {
  const issues = [];
  
  if (!config.database.url) {
    issues.push('DATABASE_URL is not defined');
  }
  
  if (!config.firebase.apiKey) {
    issues.push('VITE_FIREBASE_API_KEY is not defined');
  }
  
  if (!config.firebase.projectId) {
    issues.push('VITE_FIREBASE_PROJECT_ID is not defined');
  }
  
  if (!config.firebase.appId) {
    issues.push('VITE_FIREBASE_APP_ID is not defined');
  }
  
  if (issues.length > 0) {
    console.warn('⚠️ Configuration issues detected:');
    issues.forEach(issue => console.warn(`  - ${issue}`));
  } else {
    console.log('✅ Configuration validation passed');
  }
  
  return issues.length === 0;
};

// Simple function to log deployment info
const logDeploymentInfo = () => {
  console.log('🚀 Deployment environment detected:');
  if (config.environment.isReplit) console.log('  - Running on Replit');
  if (config.environment.isProduction) console.log('  - Running in production mode');
  if (config.environment.isDocker) console.log('  - Running in Docker container');
  if (config.environment.isAzure) console.log('  - Running on Azure');
  if (!config.environment.isReplit && !config.environment.isDocker && !config.environment.isAzure) console.log('  - Running locally');
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(config.uploads.directory)) {
    try {
      fs.mkdirSync(config.uploads.directory, { recursive: true });
      console.log(`Created uploads directory at ${config.uploads.directory}`);
    } catch (err: any) {
      console.error(`Failed to create uploads directory: ${err.message}`);
    }
  }
};

// Initialize the Express application
const app = express();

// Log deployment environment information
logDeploymentInfo();

// Ensure HTML is never sent when the client expects JSON
app.use((req, res, next) => {
  const requestPath = req.path;
  
  // If this is an API request, make sure we never send HTML responses
  if (requestPath.startsWith('/api')) {
    // Set content type to JSON for all API routes
    res.setHeader('Content-Type', 'application/json');
    
    // Intercept HTML error responses
    const originalSend = res.send;
    res.send = function(body) {
      // If the response is HTML but we're in an API route, convert to JSON error
      if (typeof body === 'string' && body.startsWith('<!DOCTYPE html>')) {
        console.error("Prevented HTML response in API route:", requestPath);
        return res.status(500).json({ 
          error: "Server Error", 
          message: "The server attempted to return HTML instead of JSON"
        });
      }
      return originalSend.call(this, body);
    };
  }
  next();
});

// Basic CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-user-id, x-user-email, x-user-role');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Changed to true for nested objects

// Apply MIME type headers for static files
app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (req.path.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  }
  next();
});

// Server is ready for routing

// Add diagnostics route for Docker troubleshooting
app.get('/api/diagnostics', (req, res) => {
  // Import the os module safely
  import('os').then(os => {
    res.json({
      firebase: {
        apiKeyExists: !!process.env.VITE_FIREBASE_API_KEY,
        projectIdExists: !!process.env.VITE_FIREBASE_PROJECT_ID,
        appIdExists: !!process.env.VITE_FIREBASE_APP_ID,
        // Show info for debugging only (not secure for production)
        apiKey: process.env.VITE_FIREBASE_API_KEY ? '[REDACTED]' : null,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
      },
      database: {
        databaseUrlExists: !!process.env.DATABASE_URL,
        pgHostExists: !!process.env.PGHOST,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        isDocker: config.environment.isDocker,
        isReplit: config.environment.isReplit,
        isAzure: config.environment.isAzure,
      },
      server: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        hostname: os.hostname(),
      }
    });
  }).catch((err: any) => {
    // Fallback if os module import fails
    res.json({
      firebase: {
        apiKeyExists: !!process.env.VITE_FIREBASE_API_KEY,
        projectIdExists: !!process.env.VITE_FIREBASE_PROJECT_ID,
        appIdExists: !!process.env.VITE_FIREBASE_APP_ID,
        apiKey: process.env.VITE_FIREBASE_API_KEY ? '[REDACTED]' : null,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
      },
      database: {
        databaseUrlExists: !!process.env.DATABASE_URL,
        pgHostExists: !!process.env.PGHOST,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        isDocker: config.environment.isDocker,
        isReplit: config.environment.isReplit,
        isAzure: config.environment.isAzure,
      },
      server: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: err.message || 'Unknown error'
      }
    });
  });
});

// Serve static files from the uploads directory
const uploadsDir = config.uploads.directory || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));
console.log(`Serving static files from: ${uploadsDir}`);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(process.cwd(), 'dist/public')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
    });
  }

  // Serve the app using configuration from deploy-config.js
  // This serves both the API and the client
  // Azure App Service uses the PORT environment variable
  const port = process.env.PORT || config.server.port || 5000;
  const host = config.server.host || "0.0.0.0";
  
  server.listen({
    port,
    host,
    reusePort: true,
  }, () => {
    log(`🚀 Server running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    
    // Validate configuration and show any warnings
    validateConfig();
  });
})();
