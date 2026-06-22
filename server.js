require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { engine } = require("express-handlebars");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Set Handlebars as the view engine
app.engine(
  ".hbs",
  engine({
    extname: ".hbs",
    defaultLayout: false,
    layoutsDir: "views",
  })
);
app.set("view engine", "hbs");

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/company", require("./routes/company"));
app.use("/api/employee", require("./routes/employee"));
app.use("/api/department", require("./routes/department"));
app.use("/api/approver", require("./routes/approvers"));
app.use("/api/request", require("./routes/request"));

// Connect to MongoDB
mongoose
  .connect("mongodb://localhost:27017/request-system")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
