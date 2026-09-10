const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    actor_type: {
      type: String,
      enum: ["employee", "company"],
      required: true,
    },
    // Denormalized so the log stays readable even if the actor is later
    // deleted, renamed, or moves department.
    actor_name: {
      type: String,
      required: true,
    },
    // Dotted category, e.g. "request.approved", "employee.invited" — lets the
    // frontend group/filter/icon-match without parsing the message text.
    action: {
      type: String,
      required: true,
    },
    target_type: {
      type: String,
      required: true, // "request" | "employee" | "department" | "approver" | "company"
    },
    target_id: {
      type: String,
      default: "",
    },
    target_label: {
      type: String,
      default: "", // e.g. request title, employee name — for display without a join
    },
    // Pre-rendered human-readable summary, written once at log time — keeps
    // rendering trivial and stable even if later code changes how similar
    // events are worded.
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

AuditLogSchema.index({ company_id: 1, createdAt: -1 });
AuditLogSchema.index({ target_type: 1, target_id: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
