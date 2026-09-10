const validate = (schema, source = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      message: error.details[0].message,
      errors: error.details.map((d) => d.message),
    });
  }

  req[source] = value;
  next();
};

module.exports = validate;
