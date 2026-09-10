const express = require("express");
const Company = require("../models/Company");
const Approvers = require("../models/Approvers");
const Employee = require("../models/Employee");
const Request = require("../models/Request");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const requireRole = require("../middlewares/requireRole");
const { notifyUser } = require("../utils/socket");
const { logActivity } = require("../utils/auditLog");

const router = express.Router();

router.use(verifyToken, loadActor);

const notifyOfPendingWork = async (company_id, approval_index, authorityEmail, label) => {
  if (!authorityEmail) return;
  const employee = await Employee.findOne({ company_id, email: authorityEmail });
  if (!employee) return;

  const pending = await Request.find({
    company_id,
    approval_index,
    status: { $nin: ["approved", "rejected", "closed"] },
  });

  for (const r of pending) {
    notifyUser(String(employee._id), {
      type: "new_request",
      title: `You're now the ${label} approver`,
      body: `"${r.title}" is waiting on your ${label} approval.`,
      requestId: r.request_id,
      at: new Date().toISOString(),
    });
  }
};

// Add approvers
router.post("/add_approver", requireRole("admin"), async (req, res) => {
  const { company_id, approvers } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const company = await Company.findById(company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Approvers.findOneAndUpdate(
      { company_id },
      { $set: { approvers } },
      { new: true, upsert: true },
    );
    return res.status(200).json({
      message: "Approvers Saved",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error" + err);
  }
});

router.post("/add_role", requireRole("admin"), async (req, res) => {
  const { company_id, funding_authority, verification_authority } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  const updates = {};
  if (funding_authority !== undefined) updates.funding_authority = funding_authority;
  if (verification_authority !== undefined) updates.verification_authority = verification_authority;

  try {
    const company = await Company.findById(company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Approvers.findOneAndUpdate(
      { company_id },
      { $set: updates },
      { new: true, upsert: true },
    );

    if (funding_authority !== undefined) {
      await logActivity({
        company_id, actor_id: req.actor.id, actor_type: req.actor.type, actor_name: req.actor.name,
        action: "approver.funding_authority_assigned", target_type: "approver", target_id: company_id,
        target_label: funding_authority || "(unassigned)",
        message: `${req.actor.name} set the funding approver to ${funding_authority || "(unassigned)"}.`,
        metadata: { funding_authority },
      });
    }
    if (verification_authority !== undefined) {
      await logActivity({
        company_id, actor_id: req.actor.id, actor_type: req.actor.type, actor_name: req.actor.name,
        action: "approver.verification_authority_assigned", target_type: "approver", target_id: company_id,
        target_label: verification_authority || "(unassigned)",
        message: `${req.actor.name} set the verification approver to ${verification_authority || "(unassigned)"}.`,
        metadata: { verification_authority },
      });
    }

    await Promise.all([
      notifyOfPendingWork(company_id, 1, funding_authority, "funding"),
      notifyOfPendingWork(company_id, 3, verification_authority, "verification"),
    ]);

    return res.status(200).json({
      message: "Role Saved",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error" + err);
  }
});

// Promote an employee to approver or department head 
router.post("/assign", requireRole("admin"), async (req, res) => {
  const { company_id, employee_id, role } = req.body;
  const targetRole = role === "department_head" ? "department_head" : "approver";

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const employee = await Employee.findOne({ _id: employee_id, company_id });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Enforce one department head per department
    if (targetRole === "department_head") {
      const existing = await Employee.findOne({
        company_id,
        department: employee.department,
        role: "department_head",
        _id: { $ne: employee._id },
      });
      if (existing) {
        return res.status(409).json({
          message: `${existing.first_name} ${existing.last_name} is already the head of ${employee.department}. Unassign them first.`,
        });
      }
    }

    employee.role = targetRole;
    await employee.save();

    await Approvers.findOneAndUpdate(
      { company_id },
      { $addToSet: { approvers: { email: employee.email } } },
      { new: true, upsert: true },
    );

    await logActivity({
      company_id, actor_id: req.actor.id, actor_type: req.actor.type, actor_name: req.actor.name,
      action: "employee.role_assigned", target_type: "employee", target_id: String(employee._id),
      target_label: `${employee.first_name} ${employee.last_name}`,
      message: `${req.actor.name} made ${employee.first_name} ${employee.last_name} ${targetRole === "department_head" ? "department head" : "an approver"}${targetRole === "department_head" ? ` of ${employee.department}` : ""}.`,
      metadata: { role: targetRole, department: employee.department },
    });

    return res.status(200).json({ message: "Employee assigned as approver" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Demote an approver back to requester
router.post("/unassign", requireRole("admin"), async (req, res) => {
  const { company_id, employee_id } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const employee = await Employee.findOne({ _id: employee_id, company_id });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const previousRole = employee.role;
    employee.role = "requester";
    await employee.save();

    const approversDoc = await Approvers.findOne({ company_id });
    if (approversDoc) {
      approversDoc.approvers = approversDoc.approvers.filter((a) => a.email !== employee.email);
      if (approversDoc.funding_authority === employee.email) approversDoc.funding_authority = "";
      if (approversDoc.verification_authority === employee.email) approversDoc.verification_authority = "";
      await approversDoc.save();
    }

    await logActivity({
      company_id, actor_id: req.actor.id, actor_type: req.actor.type, actor_name: req.actor.name,
      action: "employee.role_unassigned", target_type: "employee", target_id: String(employee._id),
      target_label: `${employee.first_name} ${employee.last_name}`,
      message: `${req.actor.name} removed ${employee.first_name} ${employee.last_name} as ${previousRole === "department_head" ? "department head" : "an approver"}.`,
      metadata: { previousRole },
    });

    return res.status(200).json({ message: "Employee removed as approver" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/get_approvers", async (req, res) => {
  const { company_id } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const company = await Company.findById(company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const approvers = await Approvers.findOne({ company_id });
    return res.status(200).json({
      message: "Approvers fetched",
      approvers,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
