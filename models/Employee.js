const mongoose = require("mongoose");

const EmployeeSchema = new mongoose.Schema({
  first_name: {
    type: String,
    required: true,
  },
  last_name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: [true, "Please provide an Email!"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, "Please enter a valid email address"],
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },
  department: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: "requester",
  },
  status: {
    type: String,
    enum: ["active", "suspended"],
    default: "active",
  },
  profile_picture: {
    type: String,
    default: "",
  },
  messages: [
    {
      title: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
    },
  ],
  password: {
    type: String,
    required: [true, "Please provide a password!"],
  },
});

EmployeeSchema.index({ company_id: 1, department: 1, role: 1 });

module.exports = mongoose.model("Employee", EmployeeSchema);
