require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { initSocket } = require("./utils/socket");

const app = express();
const server = http.createServer(app);

// Render (and most PaaS hosts) put the app behind one reverse-proxy hop,
// which sets X-Forwarded-For. Express ignores that header by default, which
// makes express-rate-limit throw when it tries to read the real client IP —
// trusting exactly one hop tells Express to use it (and only it), without
// trusting an arbitrary chain a client could spoof.
app.set("trust proxy", 1);

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/company", require("./routes/company"));
app.use("/api/employee", require("./routes/employee"));
app.use("/api/department", require("./routes/department"));
app.use("/api/approver", require("./routes/approvers"));
app.use("/api/request", require("./routes/request"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/audit", require("./routes/audit"));

// Connect to MongoDB, then start HTTP server + Socket.io
const PORT = process.env.PORT || 9000;
const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/request-system";
console.log("DB URL:", DB_URL.replace(/\/\/.*:.*@/, "//***:***@"));
mongoose
  .connect(DB_URL)
  .then(() => {
    console.log("MongoDB connected");
    initSocket(server);
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB connection error:", err));