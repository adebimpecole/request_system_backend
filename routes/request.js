const express = require("express");
const Company = require("../models/Company");
const Employee = require("../models/Employee");
const Request = require("../models/Request");
const verifyToken = require("../middlewares/verifyToken"); // Assuming the middleware is in a file called 'verifyToken.js'
const verifyRole = require("../middlewares/verifyRole");

const router = express.Router();

// Create new request
router.post("/new_request", verifyToken, async (req, res) => {
  const request = req.body;
  console.log(req.body);
  try {
    // Create a new request
    const newRequest = await Request.create(request);

    // Send a success response with the newly created request
    return res.status(201).json({
      message: "Request created successfully",
      request: newRequest,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get request details
router.get("/page/:id", verifyToken, async (req, res) => {
  const request_id = req.params.id;
  try {
    const request = await Request.findOne({ request_id });
    const user = await Employee.findById(request.user_id);
    console.log(user);
    console.log(request);

    const data = {
      ...request.toObject(),
      user: user.first_name + " " + user.last_name,
    };

    res.render("request", data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
