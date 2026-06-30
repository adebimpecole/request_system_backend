const express = require("express");
const crypto = require("crypto");
const Employee = require("../models/Employee");
const Company = require("../models/Company");
const Approvers = require("../models/Approvers");
const BlockedUser = require("../models/BlockedUser");
const Invite = require("../models/Invite");
const verifyRole = require("../middlewares/verifyRole");
const verifyToken = require("../middlewares/verifyToken");
const Request = require("../models/Request");

const router = express.Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Invite a new user by email — generates a one-time link valid for 24 hours
router.post("/invite", verifyToken, async (req, res) => {
  const { email, department, company_id, invited_by } = req.body;

  if (!email || !company_id) {
    return res.status(400).json({ message: "email and company_id are required" });
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

    return res.status(200).json({ message: "Invite created", inviteLink, expiresAt });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Resolve an invite token (used by the signup form to prefill + lock fields)
router.get("/invite/:token", async (req, res) => {
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

// Revoke or restore an employee's ability to submit requests
router.post("/:id/revoke", verifyToken, async (req, res) => {
  const { suspend } = req.body; // true = revoke, false = restore
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    employee.status = suspend ? "suspended" : "active";
    await employee.save();

    return res.status(200).json({ message: suspend ? "Request rights revoked" : "Request rights restored" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete employee — also blocks the email from rejoining the same company
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

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
router.post("/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  try {
    let employee = await Employee.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, useFindAndModify: false },
    );

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
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userid = req.params.id;

    const user =
      (await Employee.findById(userid)) || (await Company.findById(userid));

    if (!user) {
      return res.status(404).send("User not found");
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
});

// get employee requests
router.get("/requests/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const requests = await Request.find({ user_id: id });

    if (requests.length === 0) {
      return res.status(404).json({ msg: "No request has been made" });
    }

    return res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
