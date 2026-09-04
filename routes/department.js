const express = require("express");
const mongoose = require("mongoose");
const Company = require("../models/Company");
const Departments = require("../models/Departments");
const Employee = require("../models/Employee");
const Request = require("../models/Request");
const Invite = require("../models/Invite");
const Approvers = require("../models/Approvers");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();

// Update department info
router.post("/add_department", verifyToken, loadActor, requireRole("admin", "approver"), async (req, res) => {
  const { company_id, departments } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const company = await Company.findById(company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // block the removal until emplyees under it are moved to another department.
    const existing = await Departments.findOne({ company_id });
    const oldNames = (existing?.departments || []).map((d) => d.name);
    const newNames = (departments || []).map((d) => d.name);
    const removedNames = oldNames.filter((n) => !newNames.includes(n));

    if (removedNames.length > 0) {
      const stillAssigned = await Employee.find({ company_id, department: { $in: removedNames } }).select("department");
      if (stillAssigned.length > 0) {
        const counts = {};
        stillAssigned.forEach((e) => { counts[e.department] = (counts[e.department] || 0) + 1; });
        const summary = Object.entries(counts).map(([d, n]) => `${d} (${n} member${n === 1 ? "" : "s"})`).join(", ");
        return res.status(400).json({
          message: `Can't remove a department that still has members: ${summary}. Merge it into another department first.`,
        });
      }
    }

    await Departments.findOneAndUpdate(
      { company_id },
      { $set: { departments } },
      { new: true, upsert: true },
    );
    return res.status(200).json({ message: "Department Saved" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Merge one department into another
router.post("/merge", verifyToken, loadActor, requireRole("admin"), async (req, res) => {
  const { company_id, from, into } = req.body;

  if (req.actor.company_id !== String(company_id)) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  if (!from || !into || from === into) {
    return res.status(400).json({ message: "Choose two different departments to merge." });
  }

  try {
    const deptDoc = await Departments.findOne({ company_id });
    const names = (deptDoc?.departments || []).map((d) => d.name);
    if (!names.includes(from) || !names.includes(into)) {
      return res.status(404).json({ message: "One or both departments were not found." });
    }

    // Only one department_head can survive the merge
    const [headOfFrom, headOfInto] = await Promise.all([
      Employee.findOne({ company_id, department: from, role: "department_head" }),
      Employee.findOne({ company_id, department: into, role: "department_head" }),
    ]);

    const [empResult, reqResult] = await Promise.all([
      Employee.updateMany({ company_id, department: from }, { $set: { department: into } }),
      Request.updateMany({ company_id, department: from }, { $set: { department: into } }),
      Invite.updateMany({ company_id, department: from, usedAt: null }, { $set: { department: into } }),
    ]);

    let demoted = null;
    if (headOfFrom && headOfInto) {
      // if both departments have a head, the head of the department that is being merged into the other one will be demoted to requester
      headOfFrom.role = "requester";
      await headOfFrom.save();
      demoted = { id: headOfFrom._id, name: `${headOfFrom.first_name} ${headOfFrom.last_name}` };

      const approversDoc = await Approvers.findOne({ company_id });
      if (approversDoc) {
        approversDoc.approvers = approversDoc.approvers.filter((a) => a.email !== headOfFrom.email);
        if (approversDoc.funding_authority === headOfFrom.email) approversDoc.funding_authority = "";
        if (approversDoc.verification_authority === headOfFrom.email) approversDoc.verification_authority = "";
        await approversDoc.save();
      }
    }
    // If only `from` had a head, they keep the role 

    await Departments.findOneAndUpdate(
      { company_id },
      { $pull: { departments: { name: from } } },
    );

    return res.status(200).json({
      message: "Departments merged",
      employeesMoved: empResult.modifiedCount,
      requestsMoved: reqResult.modifiedCount,
      demoted,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// get departments
router.get("/get_department/:code", async (req, res) => {
  try {
    const { code } = req.params;

    let company = null;

    if (mongoose.Types.ObjectId.isValid(code)) {
      company = await Company.findById(code);
    }

    if (!company) {
      company = await Company.findOne({ company_code: code });
    }

    if (!company) {
      return res.status(404).json({ message: "Invalid code", status: 404 });
    }

    const department = await Departments.findOne({ company_id: company.id });

    if (!department) {
      return res
        .status(404)
        .json({ message: "Department not found", status: 404 });
    }

    return res.status(200).json(department.departments);
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      status: 500,
    });
  }
});

module.exports = router;
