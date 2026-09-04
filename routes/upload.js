const express = require("express");
const { Readable } = require("stream");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const Upload = require("../models/Upload");

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNED_URL_TTL_SECONDS = 5 * 60; // 5 minutes 

// Document + image types only 
const FORMAT_BY_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png", 
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

router.use(verifyToken, loadActor);

const upload = multer({
  storage: multer.memoryStorage(), 
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!FORMAT_BY_MIME[file.mimetype]) {
      return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
    cb(null, true);
  },
});

const uploadBufferToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });

// Upload a file
router.post("/", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      if (err.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(400).json({ message: "Unsupported file type. Allowed: PDF, JPG, PNG, WEBP, DOC(X), XLS(X)." });
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File is too large. Maximum size is 10MB." });
      }
      console.error(err.message);
      return res.status(500).json({ message: "Upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const format = FORMAT_BY_MIME[req.file.mimetype];
    const resourceType = req.file.mimetype.startsWith("image/") ? "image" : "raw";

    try {
      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: `requisitions/${req.actor.company_id}`,
        resource_type: resourceType,
        format,
        type: "authenticated", 
      });

      const doc = await Upload.create({
        company_id: req.actor.company_id,
        uploaded_by: req.actor.id,
        uploader_type: req.actor.type,
        original_name: req.file.originalname,
        public_id: result.public_id,
        resource_type: result.resource_type,
        format,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      return res.status(201).json({
        id: doc._id,
        url: `/api/upload/${doc._id}`,
        original_name: doc.original_name,
        mimetype: doc.mimetype,
        size: doc.size,
      });
    } catch (e) {
      console.error(e.message);
      return res.status(500).json({ message: "Upload failed" });
    }
  });
});

// Resolve a previously uploaded file to a signed, short-lived Cloudinary URL
router.get("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "File not found" });
  }

  try {
    const doc = await Upload.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "File not found" });

    if (String(doc.company_id) !== req.actor.company_id) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }

    const signedUrl = cloudinary.utils.private_download_url(doc.public_id, doc.format, {
      resource_type: doc.resource_type,
      type: "authenticated",
      attachment: true,
      expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
    });

    return res.status(200).json({
      url: signedUrl,
      original_name: doc.original_name,
      mimetype: doc.mimetype,
      size: doc.size,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router; 
