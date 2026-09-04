const mongoose = require("mongoose");

const UploadSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      required: true, // employee or company id
    },
    uploader_type: {
      type: String,
      enum: ["employee", "company"],
      required: true,
    },
    original_name: {
      type: String,
      required: true,
    },
    public_id: {
      type: String,
      required: true,
      unique: true,
    },
    resource_type: {
      type: String,
      required: true, 
    },
    format: {
      type: String,
      required: true, 
    },
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Upload", UploadSchema);
