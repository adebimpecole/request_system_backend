// routes/auth.js

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Company = require("../models/Company");
const Employee = require("../models/Employee");
const Session = require("../models/Session");
const Invite = require("../models/Invite");
const BlockedUser = require("../models/BlockedUser");

const router = express.Router();

const ACCESS_TOKEN_TTL = "15m"; // short-lived JWT
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

// Issues a new opaque refresh token and persists it as a Session document
const createSession = async (userId, userType) => {
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await Session.create({ userId, userType, refreshToken, expiresAt });
  return refreshToken;
};

// Company Register
router.post("/company_register", async (req, res) => {
  const { company_name, email, password, confirm, company_code } = req.body;

  let company = await Company.findOne({ email });

  if (company) return res.status(400).json({ message: "Email already in use" });

  if (confirm != password)
    return res.status(400).json({ message: "Passwords do not match!" });

  company = new Company({
    company_name,
    email,
    password,
    company_code,
  });

  const salt = await bcrypt.genSalt(10);
  company.password = await bcrypt.hash(password, salt);
  await company.save();

  const token = signAccessToken({ company: { id: company.id } });
  const refreshToken = await createSession(company.id, "company");

  return res.status(200).json({
    token,
    refreshToken,
    message: "Account Created!",
    user: {
      id: company.id,
      company_name: company.company_name,
      email: company.email,
      role: "admin",
      company_code: company.company_code,
    },
  });
});

// Employee Register
router.post("/employee_register", async (req, res) => {
  const {
    firstName,
    lastName,
    companyCode,
    department,
    email,
    password,
    confirm,
    role,
    inviteToken,
  } = req.body;

  let resolvedEmail = email;
  let resolvedDepartment = department;
  let invite = null;

  // If signing up via an invite link, the invite is the source of truth for
  // email/department/company — the link can't be repurposed for another company.
  if (inviteToken) {
    invite = await Invite.findOne({ token: inviteToken });
    if (!invite) return res.status(404).json({ message: "Invite not found" });
    if (invite.usedAt) return res.status(410).json({ message: "This invite has already been used" });
    if (invite.expiresAt < new Date()) return res.status(410).json({ message: "This invite link has expired" });
    resolvedEmail = invite.email;
    resolvedDepartment = invite.department || department;
  }

  let employee = await Employee.findOne({ email: resolvedEmail });
  const company = invite
    ? await Company.findById(invite.company_id)
    : await Company.findOne({ company_code: companyCode });

  if (employee) return res.status(400).send("Email already in use");

  if (!company) return res.status(404).send("Company does not exist");

  const blocked = await BlockedUser.findOne({ email: resolvedEmail.toLowerCase(), company_id: company.id });
  if (blocked) {
    return res.status(403).json({ message: "This email is not permitted to join this organization." });
  }

  if (confirm !== password)
    return res.status(400).send("Passwords do not match!");

  employee = new Employee({
    first_name: firstName,
    last_name: lastName,
    company_id: company.id,
    department: resolvedDepartment,
    email: resolvedEmail,
    password,
    role,
  });

  const salt = await bcrypt.genSalt(10);
  employee.password = await bcrypt.hash(password, salt);
  await employee.save();

  if (invite) {
    invite.usedAt = new Date();
    await invite.save();
  }

  const token = signAccessToken({ employee: { id: employee.id } });
  const refreshToken = await createSession(employee.id, "employee");

  return res.status(200).json({
    token,
    refreshToken,
    message: "Account Created!",
    user: {
      id: employee.id,
      email: employee.email,
      first_name: employee.first_name,
      last_name: employee.last_name,
      company_id: employee.company_id,
      department: employee.department,
      role: employee.role,
    },
  });
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const employee = await Employee.findOne({ email });
    const company = employee == null ? await Company.findOne({ email }) : null;

    if (!employee && !company) {
      return res
        .status(200)
        .json({ message: "Invalid credentials", status: 400 });
    }

    if (employee && password) {
      const passwordCheck = await bcrypt.compare(password, employee.password);
      if (!passwordCheck) {
        return res.status(400).send({ message: "Passwords does not match" });
      }

      const token = signAccessToken({ employee: { id: employee.id } });
      const refreshToken = await createSession(employee.id, "employee");

      return res.status(200).json({
        message: "Login Successful",
        token,
        refreshToken,
        user: {
          id: employee.id,
          email: employee.email,
          first_name: employee.first_name,
          last_name: employee.last_name,
          company_id: employee.company_id,
          department: employee.department,
          role: employee.role,
        },
      });
    } else if (company && password) {
      const passwordCheck = await bcrypt.compare(password, company.password);
      if (!passwordCheck) {
        return res.status(400).send({ message: "Passwords does not match" });
      }

      const token = signAccessToken({ company: { id: company.id } });
      const refreshToken = await createSession(company.id, "company");

      return res.status(200).json({
        message: "Login Successful",
        token,
        refreshToken,
        user: {
          id: company.id,
          company_name: company.company_name,
          email: company.email,
          role: company.role,
        },
      });
    } else {
      return res
        .status(400)
        .json({ message: "Incorrect password", status: 400 });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Refresh — exchange a valid refresh token for a new access token
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  try {
    const session = await Session.findOne({ refreshToken });

    if (!session || session.expiresAt < new Date()) {
      if (session) await session.deleteOne();
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    const payload =
      session.userType === "employee"
        ? { employee: { id: session.userId } }
        : { company: { id: session.userId } };

    const token = signAccessToken(payload);

    // Rotate the refresh token so a stolen/replayed token can't be reused indefinitely
    const newRefreshToken = crypto.randomBytes(48).toString("hex");
    session.refreshToken = newRefreshToken;
    session.expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await session.save();

    return res.status(200).json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout — invalidates the session server-side so the refresh token can no longer be used
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(200).json({ message: "Logged out" });
  }

  try {
    await Session.deleteOne({ refreshToken });
    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
