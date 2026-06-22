const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  attachment: {
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
      code: {
        type: String,
        required: true,
      },
    },
  ],
  status: {
    type: String,
    required: true,
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  request_id: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  approval_index: {
    type: Number,
    required: true,
  },
  proof: {
    type: String,
    default: "",
  },
  date_created: {
    type: Date,
    required: true,
  },
});

module.exports = mongoose.model("Request", RequestSchema);
