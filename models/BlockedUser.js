const mongoose = require("mongoose");

const BlockedUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    reason: {
      type: String,
      default: "removed",
    },
  },
  { timestamps: true },
);

// A removed employee is blocked from re-registering/joining the same company by email
BlockedUserSchema.index({ email: 1, company_id: 1 }, { unique: true });

module.exports = mongoose.model("BlockedUser", BlockedUserSchema);
