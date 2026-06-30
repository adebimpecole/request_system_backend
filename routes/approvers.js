const express = require("express");
const Company = require("../models/Company");
const Approvers = require("../models/Approvers");
const Employee = require("../models/Employee");
const verifyToken = require("../middlewares/verifyToken");

const router = express.Router();

// Add approvers
router.post("/add_approver", verifyToken, async (req, res) => {
  const updates = req.body;

  try {
    // Check if the company exists in the Companies collection
    const company = await Company.findById(updates.company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Approvers.findOneAndUpdate(
      { company_id: updates.company_id },
      { $set: updates },
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

router.post("/add_role", verifyToken, async (req, res) => {
  const updates = req.body;

  try {
    // Check if the company exists in the Companies collection
    const company = await Company.findById(updates.company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Approvers.findOneAndUpdate(
      { company_id: updates.company_id },
      { $set: updates },
      { new: true, upsert: true },
    );
    return res.status(200).json({
      message: "Role Saved",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error" + err);
  }
});

// Promote an employee to approver (or department_head — also a first-tier approver)
router.post("/assign", verifyToken, async (req, res) => {
  const { company_id, employee_id, role } = req.body;
  const targetRole = role === "department_head" ? "department_head" : "approver";

  try {
    const employee = await Employee.findOne({ _id: employee_id, company_id });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    employee.role = targetRole;
    await employee.save();

    await Approvers.findOneAndUpdate(
      { company_id },
      { $addToSet: { approvers: { email: employee.email } } },
      { new: true, upsert: true },
    );

    return res.status(200).json({ message: "Employee assigned as approver" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Demote an approver back to requester
router.post("/unassign", verifyToken, async (req, res) => {
  const { company_id, employee_id } = req.body;

  try {
    const employee = await Employee.findOne({ _id: employee_id, company_id });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    employee.role = "requester";
    await employee.save();

    const approversDoc = await Approvers.findOne({ company_id });
    if (approversDoc) {
      approversDoc.approvers = approversDoc.approvers.filter((a) => a.email !== employee.email);
      if (approversDoc.funding_authority === employee.email) approversDoc.funding_authority = "";
      if (approversDoc.verification_authority === employee.email) approversDoc.verification_authority = "";
      await approversDoc.save();
    }

    return res.status(200).json({ message: "Employee removed as approver" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/get_approvers", verifyToken, async (req, res) => {
  const { company_id } = req.body;
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

// router.post("/add_approver", async (req, res) => {
//     const updates = req.body;

//     try {
//       // Check if the company exists in the Companies collection
//       const company = await Company.findById(updates.companyid);

//       if (!company) {
//         return res.status(404).json({ message: "Company not found" });
//       }

//       await Approvers.findOneAndUpdate(
//         { companyid: updates.companyid },
//         { $set: updates.fundingAuthority },
//         { new: true, upsert: true }
//       ).then((err) => {
//         if (err) {
//           return res.status(200).json({
//             message: "Approvers Saved",
//           });
//         }
//         return res.json(doc);
//       })
//       .catch((err) => {
//         return res.status(500).json({
//           message: "Error saving approvers!",
//         });
//       })
//     } catch (err) {
//       console.error(err.message);
//       res.status(500).send("Server error");
//     }
//   });

module.exports = router;
