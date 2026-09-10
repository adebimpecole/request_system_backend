const AuditLog = require("../models/AuditLog");

const logActivity = async ({ company_id, actor_id, actor_type, actor_name, action, target_type, target_id, target_label, message, metadata }) => {
  try {
    await AuditLog.create({
      company_id,
      actor_id,
      actor_type,
      actor_name,
      action,
      target_type,
      target_id: target_id ? String(target_id) : "",
      target_label: target_label || "",
      message,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("[audit]", e.message);
  }
};

module.exports = { logActivity };
