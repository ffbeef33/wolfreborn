// File: /api/debug.js
// export default function handler(request, response) { // Dùng nếu cấu hình Vercel là ES Module
module.exports = (request, response) => { // Dùng nếu cấu hình Vercel là CommonJS
  try {
    const envVars = {
      // Firebase
      hasDatabaseUrl: !!process.env.FIREBASE_DATABASE_URL,
      databaseUrlLength: process.env.FIREBASE_DATABASE_URL?.length || 0,
      hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      firebaseServiceAccountKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,
      isFirebaseKeyValidJson: false,
      firebaseParseError: null,

      // Google Sheets
      hasSheetId: !!process.env.GOOGLE_SHEET_ID,
      sheetIdLength: process.env.GOOGLE_SHEET_ID?.length || 0,
      hasGoogleServiceAccountKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
      googleServiceAccountKeyLength: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS?.length || 0,
      isGoogleKeyValidJson: false,
      googleParseError: null,

      // Super Admin (Optional)
      hasSuperAdminPassword: !!process.env.SUPER_ADMIN_PASSWORD,
    };

    // Try parsing Firebase Key
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          envVars.isFirebaseKeyValidJson = true;
      }
    } catch (e) {
      envVars.firebaseParseError = e.message;
    }

    // Try parsing Google Key
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
          JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
          envVars.isGoogleKeyValidJson = true;
      }
    } catch (e) {
      envVars.googleParseError = e.message;
    }

    response.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for debug
    response.status(200).json({
      message: "Environment Variable Check",
      variables: envVars,
    });

  } catch (error) {
    response.status(500).json({
      error: "Failed to run debug check",
      details: error.message,
    });
  }
};