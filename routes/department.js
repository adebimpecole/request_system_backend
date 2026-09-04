const express = require("express");
const mongoose = require("mongoose");
const Company = require("../models/Company");
const Departments = require("../models/Departments");
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
