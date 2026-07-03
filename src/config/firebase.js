const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create local uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Disk Storage Configuration for local fallback
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// File validation helper (Images only, max 5MB)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only images (JPEG, JPG, PNG, GIF, WEBP) are allowed!'));
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// Upload helper function
// In production, this can connect to Firebase Admin Storage.
// In development/local fallback, it returns the local relative path.
async function getFileUrl(file) {
  if (!file) return null;

  // If Firebase is configured via env, we would upload here.
  // For local fallback:
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    console.log('Firebase credentials detected. In production, this uploads to Firebase Storage.');
    // Placeholder for actual Firebase Admin Storage upload logic:
    // const bucket = admin.storage().bucket();
    // const blob = bucket.file(`posts/${file.filename}`);
    // ...
    // return publicUrl;
  }

  // Fallback: return the local URL relative to the client
  return `/uploads/${file.filename}`;
}

module.exports = {
  upload,
  getFileUrl,
};
