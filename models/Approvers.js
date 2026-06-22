const mongoose = require("mongoose");

const ApproversSchema = new mongoose.Schema({
  company_id: {
    type: String,
    required: true,
  },
  verification_authority: {
    type: String,
    sparse: true,
    default: "",
  },
  funding_authority: {
    type: String,
    sparse: true,
    default: "",
  },
  approvers: [
    {
      email: {
        type: String,
        unique: true,
        match: [/.+@.+\..+/, "Please enter a valid email address"],
        required: true,
      },
    },
  ],
});

module.exports = mongoose.model("Approvers", ApproversSchema);
