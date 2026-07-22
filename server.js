require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { engine } = require("express-handlebars");
const { initSocket } = require("./utils/socket");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

app.engine(
  ".hbs",
  engine({ extname: ".hbs", defaultLayout: false, layoutsDir: "views" }),
);
app.set("view engine", "hbs");

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/company", require("./routes/company"));
app.use("/api/employee", require("./routes/employee"));
app.use("/api/department", require("./routes/department"));
app.use("/api/approver", require("./routes/approvers"));
app.use("/api/request", require("./routes/request"));

// Connect to MongoDB, then start HTTP server + Socket.io
const PORT = process.env.PORT || 5000;
const DB_URL = "mongodb://localhost:27017/request-system";
// const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/request-system";

mongoose
  .connect(DB_URL)
  .then(() => {
    console.log("MongoDB connected");
    initSocket(server);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));
