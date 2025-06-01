import * as schema from "../shared/schema.js";
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

// Detect which database to use based on environment
const isDatabaseUrlMssql = process.env.DATABASE_URL?.startsWith('mssql');

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Database setup with conditional import for SQL Server or PostgreSQL
let db: any;

if (isDatabaseUrlMssql) {
  // For MS SQL, we'd need to use dynamic imports here
  // This will be implemented when specifically needed for Azure
  console.log('SQL Server connection not implemented in ES module version');
  
  // Placeholder for future implementation
  /*
  // Example of how this would be implemented with dynamic imports
  import('mssql').then(({ default: sql }) => {
    import('drizzle-orm/mssql-core').then(({ drizzle }) => {
      const config = {
        user: process.env.MSSQL_USER || 'sa',
        password: process.env.MSSQL_PASSWORD,
        server: process.env.MSSQL_HOST || 'localhost',
        database: process.env.MSSQL_DATABASE || 'master',
        port: Number(process.env.MSSQL_PORT) || 1433,
        options: {
          encrypt: true,
          trustServerCertificate: true,
        }
      };

      const pool = new sql.ConnectionPool(config);
      pool.connect().then(() => {
        console.log('Connected to SQL Server');
        db = drizzle(pool, { schema });
      }).catch(err => {
        console.error('SQL Server connection error:', err);
      });
    });
  });
  */
} else {
  // PostgreSQL setup (for local development)
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  console.log('Connected to PostgreSQL');
}

export { db };