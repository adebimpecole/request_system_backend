const express = require("express");
const mongoose = require("mongoose");
const Company = require("../models/Company");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const verifySameCompany = require("../middlewares/verifySameCompany");
const requireRole = require("../middlewares/requireRole");
const Employee = require("../models/Employee");
const Request = require("../models/Request");
const Approvers = require("../models/Approvers");
const Departments = require("../models/Departments");
const { logActivity } = require("../utils/auditLog");
const validate = require("../middlewares/validate");
const schemas = require("../middlewares/schemas");

const router = express.Router();

router.use(verifyToken, loadActor);

// Update company info
router.put("/:id", validate(schemas.updateCompany), async (req, res) => {
  const companyId = req.params.id;

  if (req.actor.type !== "company" || req.actor.id !== companyId) {
    return res.status(403).json({ message: "You can only update your own company" });
  }

  const updates = req.body;

  try {
    const before = await Company.findById(companyId).select("budget");

    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: updates },
      { new: true, useFindAndModify: false },
    ).select("-password");

    if (!company) {
      return res.status(404).json({ msg: "User not found" });
    }

    if (updates.budget !== undefined && before?.budget !== company.budget) {
      await logActivity({
        company_id: companyId,
        actor_id: req.actor.id,
        actor_type: req.actor.type,
        actor_name: req.actor.name,
        action: "company.budget_updated",
        target_type: "company",
        target_id: companyId,
        target_label: company.company_name,
        message: `${req.actor.name} changed the budget from $${(before?.budget || 0).toLocaleString()} to $${company.budget.toLocaleString()}.`,
        metadata: { before: before?.budget || 0, after: company.budget },
      });
    }

    return res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get company
router.get("/get_company/:code",  async (req, res) => {
  try {
    const { code } = req.params;

    let company = null;

    if (mongoose.Types.ObjectId.isValid(code)) {
      company = await Company.findById(code).select("-password");
    }

    if (!company) {
      company = await Company.findOne({ company_code: code }).select("-password");
    }

    if (!company) {
      return res.status(404).json({
        message: "Company not found",
        status: 404,
      });
    }

    if (String(company._id) !== req.actor.company_id) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }

    const approversDoc = await Approvers.findOne({ company_id: company._id });
    const approvers = approversDoc
      ? {
          approvers: approversDoc.approvers,
          funding_authority: approversDoc.funding_authority,
          verification_authority: approversDoc.verification_authority,
        }
      : {
          approvers: [],
          funding_authority: null,
          verification_authority: null,
        };

    const employeeDocs = await Employee.find({ company_id: company._id });
    const employees = employeeDocs.map((employee) => ({
      _id: employee._id,
      name: `${employee.first_name} ${employee.last_name}`,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      status: employee.status || "active",
    }));

    const departmentDoc = await Departments.findOne({ company_id: company._id });
    const departments = departmentDoc ? departmentDoc.departments : [];

    return res.status(200).json({ company, approvers, employees, departments });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      status: 500,
    });
  }
});

// get company requests

router.get("/requests/:id", verifySameCompany("params:id"), requireRole("admin", "department_head", "approver"), async (req, res) => {
  const id = req.params.id;
  try {
    const { page, limit } = req.query;

    if (page === undefined && limit === undefined) {
      const requests = await Request.find({ company_id: id });
      if (requests.length === 0) {
        return res.status(404).json({ msg: "No request has been made" });
      }
      return res.json(requests);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [data, total] = await Promise.all([
      Request.find({ company_id: id })
        .sort({ date_created: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Request.countDocuments({ company_id: id }),
    ]);

    return res.json({ data, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
