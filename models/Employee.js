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
    match: [/.+@.+\..+/, "Please enter a valid email address"],
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: "requester",
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

module.exports = mongoose.model("Employee", EmployeeSchema);
