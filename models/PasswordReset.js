const mongoose = require("mongoose");

const PasswordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    userType: {
      type: String,
      enum: ["employee", "company"],
      required: true, 
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

//  expired/unused reset tokens are auto-purged some time after expiry
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("PasswordReset", PasswordResetSchema);
