const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema({
  company_name: {
    type: String,
    required: [true, "Please provide a company name!"],
  },
  email: {
    type: String,
    required: [true, "Please provide an email!"],
    unique: true,
    match: [/.+@.+\..+/, "Please enter a valid email address"],
  },
  password: {
    type: String,
    required: [true, "Please provide a password!"],
  },
  company_code: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: "admin",
  },
  budget: {
    type: Number,
    default: 0,
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
});

module.exports = mongoose.model("Company", CompanySchema);
