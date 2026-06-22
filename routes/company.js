const express = require("express");
const Company = require("../models/Company");
const verifyToken = require("../middlewares/verifyToken");
const verifyRole = require("../middlewares/verifyRole");
const Employee = require("../models/Employee");
const Request = require("../models/Request");

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
      { new: true, useFindAndModify: false } // Return the updated user
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
router.get("/get_company/:code", async (req, res) => {
  try {
    const company_code = req.params.code;
    const company = await Company.findById(company_code);

    if (!company) {
      return res
        .status(404)
        .json({ message: "Company not found", status: 404 });
    }

    return res.status(200).json(company);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: 500 });
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

module.exports = router;
