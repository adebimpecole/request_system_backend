const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Employee = require("../models/Employee");
const Company = require("../models/Company");

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Auth middleware 
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.employee?.id) {
        const employee = await Employee.findById(decoded.employee.id).select("company_id role");
        if (!employee) return next(new Error("User not found"));
        socket.userId = String(employee._id);
        socket.userRole = employee.role;
        socket.companyId = String(employee.company_id);
        return next();
      }

      if (decoded.company?.id) {
        const company = await Company.findById(decoded.company.id).select("_id");
        if (!company) return next(new Error("User not found"));
        socket.userId = String(company._id);
        socket.userRole = "admin";
        socket.companyId = String(company._id);
        return next();
      }

      return next(new Error("Invalid token payload"));
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Each user joins their own room so we can target them directly
    socket.join(socket.userId);
    // Also join a company room for broadcast events
    socket.join(`company:${socket.companyId}`);

    socket.on("disconnect", () => {});
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
};

/**
 * Emit a notification to a specific user by their MongoDB _id string.
 */
const notifyUser = (userId, payload) => {
  try {
    getIO().to(String(userId)).emit("notification", payload);
  } catch (e) {
    console.warn("[socket] notifyUser failed:", e.message);
  }
};

/**
 * Emit a notification to everyone in a company room.
 */
const notifyCompany = (companyId, payload) => {
  try {
    getIO().to(`company:${companyId}`).emit("notification", payload);
  } catch (e) {
    console.warn("[socket] notifyCompany failed:", e.message);
  }
};

module.exports = { initSocket, getIO, notifyUser, notifyCompany };
