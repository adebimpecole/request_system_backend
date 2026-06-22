// routes/auth.js

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Company = require("../models/Company");
const Employee = require("../models/Employee");

const router = express.Router();

// Company Register
router.post("/company_register", async (req, res) => {
  const { company_name, email, password, confirm, company_code } = req.body;

  let company = await Company.findOne({ email });

  if (company) return res.status(400).json({ message: "Email already in use" });

  if (confirm != password)
    return res.status(400).json({ message: "Passwords do not match!" });
  console.log(company_code);
  company = new Company({
    company_name,
    email,
    password,
    company_code,
  });

  const salt = await bcrypt.genSalt(10);
  company.password = await bcrypt.hash(password, salt);
  await company.save();

  const payload = { company: { id: company.id } };

  jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
    (err, token) => {
      if (err) {
        return res.status(400).json({
          message: "Error creating account",
          status: 400,
          error: `Error: ${err}`,
        });
      }
      return res.status(200).json({
        token,
        message: "Account Created!",
        user: {
          id: company.id,
          company_name: company.company_name,
          email: company.email,
          role: "admin",
          company_code: company.company_code,
        },
      });
    }
  );
});

// Employee Register
router.post("/employee_register", async (req, res) => {
  const {
    firstname,
    lastname,
    companyid,
    department,
    email,
    password,
    confirm,
    role,
  } = req.body;

  // Check if employee with the given email already exists
  let employee = await Employee.findOne({ email });
  const company = await Company.findById(companyid);

  if (employee) return res.status(400).send("Email already in use");

  if (!company) return res.status(404).send("Company does not exist");

  if (confirm !== password)
    return res.status(400).send("Passwords do not match!");

  // Create a new employee
  employee = new Employee({
    firstname,
    lastname,
    companyid,
    department,
    email,
    password,
    role,
  });

  // Generate salt and hash the password
  const salt = await bcrypt.genSalt(10);
  employee.password = await bcrypt.hash(password, salt);
  await employee.save();

  console.log(employee.id);

  // Create payload and sign the JWT
  const payload = { employee: { id: employee.id } };

  jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
    (err, token) => {
      if (err) {
        return res.status(400).json({
          message: "Error creating account",
          status: 400,
          error: `Error: ${err}`,
        });
      }
      return res.status(200).json({
        token,
        message: "Account Created!",
        user: {
          id: employee.id,
          email: employee.email,
          firstname: employee.firstname,
          lastname: employee.lastname,
          companyid: employee.companyid,
          department: employee.department,
          role: employee.role,
        },
      });
    }
  );
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

    // Return appropriate response
    if (employee && password) {
      bcrypt
        .compare(password, employee.password)

        // if the passwords match
        .then((passwordCheck) => {
          // check if password matches
          if (!passwordCheck) {
            return response.status(400).send({
              message: "Passwords does not match",
              error,
            });
          }

          const payload = {
            employee: {
              id: employee.id,
            },
          };

          //   create JWT token
          jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: 3600 },
            (err, token) => {
              if (err) throw err;
              res.status(200).json({
                message: "Login Successful",
                token,
                user: {
                  id: employee.id,
                  email: employee.email,
                  firstname: employee.firstname,
                  lastname: employee.lastname,
                  company: employee.company,
                  department: employee.department,
                  role: employee.role,
                },
              });
            }
          );
        });
    } else if (company && password) {
      bcrypt
        .compare(password, company.password)

        // if the passwords match
        .then((passwordCheck) => {
          // check if password matches
          if (!passwordCheck) {
            return res.status(400).send({
              message: "Passwords does not match",
            });
          }

          const payload = {
            company: {
              id: company.id,
            },
          };

          //   create JWT token
          jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: 3600 },
            (err, token) => {
              if (err) throw err;
              res.status(200).json({
                message: "Login Successful",
                token,
                user: {
                  id: company.id,
                  companyname: company.companyname,
                  email: company.email,
                  role: company.role,
                },
              });
            }
          );
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

module.exports = router;
