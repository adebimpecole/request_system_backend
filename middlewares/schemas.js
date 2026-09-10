const Joi = require("joi");

const objectId = Joi.string().hex().length(24);
const amount = Joi.alternatives().try(
  Joi.number().positive(),
  Joi.string().pattern(/^\d+(\.\d{1,2})?$/),
).required();

// ── Auth ──────────────────────────────────────────────────────────────────

const companyRegister = Joi.object({
  company_name: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(200).required(),
  confirm: Joi.string().required(),
  company_code: Joi.string().trim().alphanum().min(4).max(20).required(),
});

const employeeRegister = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  companyCode: Joi.string().trim().alphanum().min(4).max(20).allow("").required(),
  department: Joi.string().trim().max(100).allow("").required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(200).required(),
  confirm: Joi.string().required(),
  inviteToken: Joi.string().hex().optional(),
});

const login = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(1).max(200).required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const resetPassword = Joi.object({
  token: Joi.string().hex().required(),
  password: Joi.string().min(8).max(200).required(),
  confirm: Joi.string().required(),
});

// ── Request ───────────────────────────────────────────────────────────────


const newRequest = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  amount,
  category: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().min(1).max(2000).required(),
  department: Joi.string().trim().min(1).max(100).required(),
});

const approveRequest = Joi.object({
  action: Joi.string().valid("approve", "reject").required(),
  proof: Joi.string().trim().max(500).allow("").optional(),
  note: Joi.string().trim().max(1000).allow("").optional(),
});

const clarifyRequest = Joi.object({
  question: Joi.string().trim().min(1).max(1000).required(),
});

const respondClarification = Joi.object({
  response: Joi.string().trim().min(1).max(2000).required(),
});

const statusOverride = Joi.object({
  status: Joi.string().valid("pending", "approved", "rejected", "under_review", "funded", "delegated", "closed").required(),
  message: Joi.string().trim().max(500).allow("").optional(),
});

// ── Employee / Company / Team management ──────────────────────────────────

const inviteEmployee = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  department: Joi.string().trim().max(100).allow("").optional(),
  company_id: objectId.required(),
});

const updateEmployee = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).optional(),
  last_name: Joi.string().trim().min(1).max(100).optional(),
  department: Joi.string().trim().min(1).max(100).optional(),
  email: Joi.string().trim().lowercase().email().optional(),
}).min(1);

const revokeEmployee = Joi.object({
  suspend: Joi.boolean().required(),
});

const updateCompany = Joi.object({
  company_name: Joi.string().trim().min(1).max(200).optional(),
  budget: Joi.number().min(0).optional(),
  profile_picture: Joi.string().trim().max(2000).allow("").optional(),
}).min(1);

const addDepartment = Joi.object({
  company_id: objectId.required(),
  departments: Joi.array().items(
    Joi.object({ name: Joi.string().trim().min(1).max(100).required() }),
  ).required(),
});

const mergeDepartments = Joi.object({
  company_id: objectId.required(),
  from: Joi.string().trim().min(1).max(100).required(),
  into: Joi.string().trim().min(1).max(100).required(),
});

const addApprovers = Joi.object({
  company_id: objectId.required(),
  approvers: Joi.array().items(
    Joi.object({ email: Joi.string().trim().lowercase().email().required() }),
  ).required(),
});

const addRole = Joi.object({
  company_id: objectId.required(),
  funding_authority: Joi.string().trim().lowercase().email().allow("").optional(),
  verification_authority: Joi.string().trim().lowercase().email().allow("").optional(),
}).or("funding_authority", "verification_authority");

const assignApprover = Joi.object({
  company_id: objectId.required(),
  employee_id: objectId.required(),
  role: Joi.string().valid("approver", "department_head").required(),
});

const unassignApprover = Joi.object({
  company_id: objectId.required(),
  employee_id: objectId.required(),
});

module.exports = {
  companyRegister, employeeRegister, login, forgotPassword, resetPassword,
  newRequest, approveRequest, clarifyRequest, respondClarification, statusOverride,
  inviteEmployee, updateEmployee, revokeEmployee, updateCompany,
  addDepartment, mergeDepartments, addApprovers, addRole, assignApprover, unassignApprover,
};
