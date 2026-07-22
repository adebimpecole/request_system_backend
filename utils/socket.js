const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Auth middleware — require a valid JWT on connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.companyId = decoded.company_id || decoded.id; // admin id is their company id
      next();
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
