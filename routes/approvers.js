const express = require("express");
const Company = require("../models/Company");
const Approvers = require("../models/Approvers");
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

router.get("/get_approvers", verifyToken, async (req, res) => {
  const updates = req.body.data;
  console.log(req);
  try {
    // Check if the company exists in the Companies collection
    const company = await Company.findById(updates.company_id);

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    let approvers = await Approvers.findOne({ company_id: updates.company_id });
    return res.status(200).json({
      message: "Approvers Saved",
      approvers: approvers,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error" + err);
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
