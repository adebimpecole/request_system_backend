const Employee = require("../models/Employee");
const Company = require("../models/Company");


const loadActor = async (req, res, next) => {
  try {
    if (req.user?.employee?.id) {
      const employee = await Employee.findById(req.user.employee.id).select("-password");
      if (!employee) return res.status(401).json({ message: "User not found" });
      if (employee.status === "suspended") {
        return res.status(403).json({ message: "Your account has been suspended. Contact your organization admin." });
      }

      req.actor = {
        type: "employee",
        id: String(employee._id),
        company_id: String(employee.company_id),
        role: employee.role,
        department: employee.department,
        status: employee.status,
      };
      return next();
    }

    if (req.user?.company?.id) {
      const company = await Company.findById(req.user.company.id).select("-password");
      if (!company) return res.status(401).json({ message: "User not found" });

      req.actor = {
        type: "company",
        id: String(company._id),
        company_id: String(company._id),
        role: "admin",
        status: "active",
      };
      return next();
    }

    return res.status(401).json({ message: "Invalid token payload" });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = loadActor;
