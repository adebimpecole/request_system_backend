const express = require("express");
const AuditLog = require("../models/AuditLog");
const Request = require("../models/Request");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();

router.use(verifyToken, loadActor);

const PAGE_SIZE = 50;

// Company-wide activity feed — admin only, same boundary as Budget/Departments
// in Settings (org-wide history of who-did-what is admin-level visibility).
router.get("/company/:company_id", requireRole("admin"), async (req, res) => {
  if (req.actor.company_id !== req.params.company_id) {
    return res.status(403).json({ message: "You do not have access to this company's data" });
  }

  try {
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;
    const query = { company_id: req.params.company_id };
    if (cursor && !Number.isNaN(cursor.getTime())) query.createdAt = { $lt: cursor };

    const entries = await AuditLog.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE + 1);
    const hasMore = entries.length > PAGE_SIZE;
    const page = entries.slice(0, PAGE_SIZE);

    return res.status(200).json({
      entries: page,
      nextCursor: hasMore ? page[page.length - 1].createdAt : null,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Per-request activity — visible to anyone who can already see the request
// itself (requester, department head, approvers), not just admins.
router.get("/request/:request_id", async (req, res) => {
  try {
    const request = await Request.findOne({ request_id: req.params.request_id }).select("company_id");
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (String(request.company_id) !== req.actor.company_id) {
      return res.status(404).json({ message: "Request not found" });
    }

    const entries = await AuditLog.find({ target_type: "request", target_id: req.params.request_id }).sort({ createdAt: 1 });
    return res.status(200).json(entries);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
