const express = require("express");
const crypto = require("crypto");
const Employee = require("../models/Employee");
const Company = require("../models/Company");
const Approvers = require("../models/Approvers");
const BlockedUser = require("../models/BlockedUser");
const Invite = require("../models/Invite");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const requireRole = require("../middlewares/requireRole");
const Request = require("../models/Request");
const { sendInviteEmail } = require("../utils/mailer");
const { sensitiveActionLimiter } = require("../middlewares/rateLimit");

const router = express.Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const UPDATABLE_EMPLOYEE_FIELDS = ["first_name", "last_name", "department", "email"];


// Resolve an invite token
router.get("/invite/:token", sensitiveActionLimiter, async (req, res) => {
  try {
    const invite = await Invite.findOne({ token: req.params.token });

    if (!invite) return res.status(404).json({ message: "Invite not found" });
    if (invite.usedAt) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.expiresAt < new Date()) return res.status(410).json({ message: "This invite link has expired" });

    const company = await Company.findById(invite.company_id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    return res.status(200).json({
      email: invite.email,
      department: invite.department,
      company_code: company.company_code,
      company_name: company.company_name,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});


router.use(verifyToken, loadActor);

// Invite a new user by email
router.post("/invite", sensitiveActionLimiter, async (req, res) => {
  const { email, department, company_id, invited_by } = req.body;

  if (!email || !company_id) {
    return res.status(400).json({ message: "email and company_id are required" });
  }

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const company = await Company.findById(company_id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const existing = await Employee.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "An account with this email already exists" });

    const blocked = await BlockedUser.findOne({ email: email.toLowerCase(), company_id });
    if (blocked) return res.status(403).json({ message: "This email has been removed from the organization and cannot be re-invited" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await Invite.create({
      email: email.toLowerCase(),
      company_id,
      department: department || "",
      token,
      invitedBy: invited_by || null,
      expiresAt,
    });

    const inviteLink = `/employeesignup?invite=${token}`;

    //  forget email 
    sendInviteEmail({
      to: email.toLowerCase(),
      inviteLink,
      companyName: company.company_name,
      invitedByName: invited_by || null,
    }).catch((err) => console.error("[invite email]", err.message));

    return res.status(200).json({ message: "Invite created", inviteLink, expiresAt });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Revoke or restore employee ability to submit requests
router.post("/:id/revoke", requireRole("admin", "department_head"), async (req, res) => {
  const { suspend } = req.body; 
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    if (String(employee.company_id) !== req.actor.company_id) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }

    employee.status = suspend ? "suspended" : "active";
    await employee.save();

    return res.status(200).json({ message: suspend ? "Request rights revoked" : "Request rights restored" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete employee
router.delete("/:id", requireRole("admin", "department_head"), async (req, res) => {
  try {
    const target = await Employee.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "Employee not found" });

    if (String(target.company_id) !== req.actor.company_id) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }

    const employee = await Employee.findByIdAndDelete(req.params.id);

    await BlockedUser.findOneAndUpdate(
      { email: employee.email.toLowerCase(), company_id: employee.company_id },
      { email: employee.email.toLowerCase(), company_id: employee.company_id, reason: "removed" },
      { upsert: true },
    );

    // Strip them out of any approver assignments
    const approversDoc = await Approvers.findOne({ company_id: employee.company_id });
    if (approversDoc) {
      approversDoc.approvers = approversDoc.approvers.filter((a) => a.email !== employee.email);
      if (approversDoc.funding_authority === employee.email) approversDoc.funding_authority = "";
      if (approversDoc.verification_authority === employee.email) approversDoc.verification_authority = "";
      await approversDoc.save();
    }

    return res.status(200).json({ message: "Employee removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Update employee info 
router.post("/:id", async (req, res) => {
  const id = req.params.id;

  if (req.actor.type !== "employee" || req.actor.id !== id) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }

  const updates = {};
  for (const field of UPDATABLE_EMPLOYEE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  try {
    let employee = await Employee.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, useFindAndModify: false },
    ).select("-password");

    if (!employee) {
      return res.status(404).json({ msg: "User not found" });
    }

    return res.json(employee);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Get employee or company by ID 
router.get("/:id", async (req, res) => {
  try {
    const userid = req.params.id;

    if (req.actor.id !== userid) {
      return res.status(403).json({ message: "You can only view your own record" });
    }

    const user =
      (await Employee.findById(userid).select("-password")) ||
      (await Company.findById(userid).select("-password"));

    if (!user) {
      return res.status(404).send("User not found");
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
});

// get employee requests 
router.get("/requests/:id", async (req, res) => {
  const id = req.params.id;

  if (req.actor.id !== id) {
    return res.status(403).json({ message: "You can only view your own requests" });
  }

  try {
    const requests = await Request.find({ user_id: id });
    return res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
