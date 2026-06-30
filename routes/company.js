const express = require("express");
const Company = require("../models/Company");
const verifyToken = require("../middlewares/verifyToken");
const verifyRole = require("../middlewares/verifyRole");
const Employee = require("../models/Employee");
const Request = require("../models/Request");
const Approvers = require("../models/Approvers");
const Departments = require("../models/Departments");

const router = express.Router();

// Update company info
router.put("/:id", async (req, res) => {
  const companyId = req.params.id;
  const updates = req.body;

  try {
    // Find user by ID and update fields dynamically
    let company = await Company.findByIdAndUpdate(
      companyId,
      { $set: updates },
      { new: true, useFindAndModify: false }, // Return the updated user
    );

    if (!company) {
      return res.status(404).json({ msg: "User not found" });
    }

    return res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get employees
router.get("/:id", verifyToken, verifyRole, async (req, res) => {
  const id = req.params.id;
  try {
    const employees = await Employee.find({ company_id: id });

    if (employees.length === 0) {
      return res
        .status(404)
        .json({ msg: "No employee exists for this company" });
    }

    return res.json(employees);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get company
const mongoose = require("mongoose");

router.get("/get_company/:code", async (req, res) => {
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
      return res.status(404).json({
        message: "Company not found",
        status: 404,
      });
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
router.get("/requests/:id", verifyToken, verifyRole, async (req, res) => {
  const id = req.params.id;
  try {
    const requests = await Request.find({ company_id: id });

    if (requests.length === 0) {
      return res.status(404).json({ msg: "No request has been made" });
    }

    return res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get company emplyees
router.get("/employees/:id", verifyToken, verifyRole, async (req, res) => {
  const id = req.params.id;
  try {
    const employees = await Employee.find({ company_id: id });

    if (employees.length === 0) {
      return res
        .status(404)
        .json({ msg: "No employee exists for this company" });
    }

    return res.json(employees);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
