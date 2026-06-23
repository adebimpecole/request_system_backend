const express = require("express");
const Employee = require("../models/Employee");
const Company = require("../models/Company");
const verifyRole = require("../middlewares/verifyRole");
const verifyToken = require("../middlewares/verifyToken");
const Request = require("../models/Request");

const router = express.Router();

// Delete employee
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
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
    // Find user by ID and update fields dynamically
    let company = await Employee.findByIdAndUpdate(
      id,
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

// Get employee or company by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userid = req.params.id;

    // Check both Employee and Company collections for the provided ID
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
