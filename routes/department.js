const express = require("express");
const Company = require("../models/Company");
const Departments = require("../models/Departments");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

// Update department info
router.post("/add_department", verifyToken, async (req, res) => {
  const updates = req.body;

  try {
    // Check if the company exists in the Companies collection
    const company = await Company.findById(updates.company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Departments.findOneAndUpdate(
      { company_id: updates.company_id },
      { $set: updates },
      { new: true, upsert: true }
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
    const company_code = req.params.code;
    const company = await Company.findOne({ company_code });
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
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: 500 });
  }
});

module.exports = router;
