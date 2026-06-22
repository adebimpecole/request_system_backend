// Middleware to verify the JWT token
const verifyRole = (req, res, next) => {
  // Get the token from the Authorization header
  const { role } = req.query;
  console.log(req.query);
  if (role == "requester") {
    return res
      .status(403)
      .json({
        message:
          "Access denied. You do not have the right autorization to acess this page.",
      });
  }

  next();
};

module.exports = verifyRole;
