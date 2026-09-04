
const verifySameCompany = (source = "params:id") => {
  const [location, key] = source.split(":");

  return (req, res, next) => {
    const targetCompanyId = req[location]?.[key];
    if (!targetCompanyId) {
      return res.status(400).json({ message: `Missing ${key}` });
    }
    if (req.actor.company_id !== String(targetCompanyId)) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }
    next();
  };
};

module.exports = verifySameCompany;
