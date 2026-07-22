const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  amount: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  attachment: { type: String, default: "" },
  messages: [
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      code: { type: String, required: true },
    },
  ],
  status: { type: String, required: true },
  company_id: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  request_id: { type: String, required: true },
  department: { type: String, required: true },

  // 0=dept_head_review, 1=funding_approver, 2=dept_head_delegate, 3=verification, 4=complete
  approval_index: { type: Number, required: true, default: 0 },

  // Proof documents
  proof_of_funds: { type: String, default: "" },   // attached by funding approver at stage 1
  proof_of_use: { type: String, default: "" },     // attached by dept head at stage 2

  // Clarification thread — dept head can ask requester for info at any stage
  clarification: [
    {
      question: { type: String, required: true },
      asked_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
      asked_at: { type: Date, default: Date.now },
      response: { type: String, default: "" },
      responded_at: { type: Date },
    },
  ],
  // Status before clarification was requested (so we can restore it after)
  pre_clarification_status: { type: String, default: "" },

  // Closure
  closed_at: { type: Date },
  closed_by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },

  date_created: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Request", RequestSchema);
