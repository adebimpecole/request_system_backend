const express = require("express");
const Employee = require("../models/Employee");
const Approvers = require("../models/Approvers");
const Request = require("../models/Request");
const verifyToken = require("../middlewares/verifyToken");
const loadActor = require("../middlewares/loadActor");
const verifySameCompany = require("../middlewares/verifySameCompany");
const requireRole = require("../middlewares/requireRole");
const { notifyUser } = require("../utils/socket");

const router = express.Router();

// helpers

const getActorId = (req) => req.user?.employee?.id || null;

const getApprovers = async (company_id) =>
  Approvers.findOne({ company_id });

const notifyApproversByEmail = async (company_id, emailList, payload) => {
  const employees = await Employee.find({
    email: { $in: emailList },
    company_id,
  }).select("_id");
  for (const emp of employees) notifyUser(String(emp._id), payload);
};



router.use(verifyToken);

// approval chain
//
// Stage 0  dept_head_review  → Dept head approves initial request
// Stage 1  funding_approver  → Funding approver attaches proof_of_funds
// Stage 2  dept_head_delegate→ Dept head attaches proof_of_use
// Stage 3  verification      → Verification approver confirms fund use
//
router.post("/:request_id/approve", async (req, res) => {
  const { action, proof, note } = req.body; // action: "approve"|"reject"
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
  }

  try {
    const request = await Request.findOne({ request_id: req.params.request_id });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (["approved", "rejected", "closed"].includes(request.status)) {
      return res.status(400).json({ message: "This request has already been finalised" });
    }
    if (request.status === "clarification_needed") {
      return res.status(400).json({ message: "Awaiting clarification from the requester first" });
    }

    const actorId = getActorId(req);
    if (!actorId) return res.status(403).json({ message: "Only employees can approve requests" });

    const actor = await Employee.findById(actorId);
    if (!actor || String(actor.company_id) !== String(request.company_id)) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }
    if (actor.status === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact your organization admin." });
    }
    const approversDoc = await getApprovers(request.company_id);

    const { approval_index } = request;

    // authorisation per stage 
    if (approval_index === 0) {
      if (actor.role !== "department_head" || actor.department !== request.department) {
        return res.status(403).json({ message: "Only the department head for this department can act here" });
      }
    } else if (approval_index === 1) {
      if (approversDoc?.funding_authority !== actor.email) {
        return res.status(403).json({ message: "Only the funding approver can act here" });
      }
      if (action === "approve" && !proof) {
        return res.status(400).json({ message: "Proof of delegated funds is required" });
      }
    } else if (approval_index === 2) {
      if (actor.role !== "department_head" || actor.department !== request.department) {
        return res.status(403).json({ message: "Only the department head for this department can act here" });
      }
      if (action === "approve" && !proof) {
        return res.status(400).json({ message: "Proof of fund use is required" });
      }
    } else if (approval_index === 3) {
      if (approversDoc?.verification_authority !== actor.email) {
        return res.status(403).json({ message: "Only the verification approver can act here" });
      }
    }

    // rejection (any stage) 
    if (action === "reject") {
      request.status = "rejected";
      await request.save();
      notifyUser(String(request.user_id), {
        type: "request_update",
        title: "Request rejected",
        body: note || `Your request "${request.title}" was rejected.`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
      return res.status(200).json({ message: "Request rejected", request });
    }

    //  Advance
    if (approval_index === 0) {
      // Dept head initial approval 
      request.approval_index = 1;
      request.status = "under_review";
      await request.save();

      if (approversDoc?.funding_authority) {
        await notifyApproversByEmail(request.company_id, [approversDoc.funding_authority], {
          type: "new_request",
          title: "Request needs funding approval",
          body: `"${request.title}" has been cleared by the department head. Please attach proof of delegated funds.`,
          requestId: request.request_id,
          at: new Date().toISOString(),
        });
      }
      notifyUser(String(request.user_id), {
        type: "request_update",
        title: "Request advancing",
        body: `Your request "${request.title}" was approved by the department head and is now with the funding approver.`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
      return res.status(200).json({ message: "Forwarded to funding approver", request });
    }

    if (approval_index === 1) {
      // Funding approver attaches proof 
      request.proof_of_funds = proof;
      request.approval_index = 2;
      request.status = "funded";
      await request.save();

      // notify dept head
      const deptHead = await Employee.findOne({
        company_id: request.company_id,
        department: request.department,
        role: "department_head",
      });
      if (deptHead) {
        notifyUser(String(deptHead._id), {
          type: "new_request",
          title: "Funds approved — action required",
          body: `Funds have been delegated for "${request.title}". Please attach proof of fund use.`,
          requestId: request.request_id,
          at: new Date().toISOString(),
        });
      }
      notifyUser(String(request.user_id), {
        type: "request_update",
        title: "Funds delegated",
        body: `Funding has been approved for your request "${request.title}".`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
      return res.status(200).json({ message: "Proof of funds attached — forwarded to department head", request });
    }

    if (approval_index === 2) {
      // Dept head attaches proof of use 
      request.proof_of_use = proof;
      request.approval_index = 3;
      request.status = "delegated";
      await request.save();

      if (approversDoc?.verification_authority) {
        await notifyApproversByEmail(request.company_id, [approversDoc.verification_authority], {
          type: "new_request",
          title: "Fund use ready for verification",
          body: `"${request.title}" has proof of fund use attached. Please verify.`,
          requestId: request.request_id,
          at: new Date().toISOString(),
        });
      }
      return res.status(200).json({ message: "Forwarded to verification approver", request });
    }

    if (approval_index === 3) {
      // Verification approver confirms 
      request.approval_index = 4;
      request.status = "approved";
      await request.save();

      notifyUser(String(request.user_id), {
        type: "request_update",
        title: "Request fully approved ✓",
        body: `Your request "${request.title}" has been verified and closed successfully.`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
      return res.status(200).json({ message: "Request fully approved and verified", request });
    }

    return res.status(400).json({ message: "No further approval stages" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// request clarification from the requester 
router.post("/:request_id/clarify", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ message: "question is required" });

  try {
    const request = await Request.findOne({ request_id: req.params.request_id });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (["approved", "rejected", "closed"].includes(request.status)) {
      return res.status(400).json({ message: "Request is already finalised" });
    }

    const actorId = getActorId(req);
    const actor = await Employee.findById(actorId);
    if (!actor || String(actor.company_id) !== String(request.company_id)) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }
    if (actor.status === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact your organization admin." });
    }

    const isDeptHead = actor.role === "department_head" && actor.department === request.department;
    const approversDoc = await getApprovers(request.company_id);
    const isVerificationApprover = request.approval_index === 3 && approversDoc?.verification_authority === actor.email;

    if (!isDeptHead && !isVerificationApprover) {
      return res.status(403).json({ message: "Only the department head or verification approver can request clarification" });
    }

    request.clarification.push({ question, asked_by: actor._id, asked_by_role: actor.role, asked_at: new Date() });
    request.pre_clarification_status = request.status;
    request.status = "clarification_needed";
    await request.save();

    if (isDeptHead) {
      notifyUser(String(request.user_id), {
        type: "clarification",
        title: "Clarification needed",
        body: `The department head has a question about your request "${request.title}".`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
    } else {
      const deptHead = await Employee.findOne({
        company_id: request.company_id,
        department: request.department,
        role: "department_head",
      });
      if (deptHead) {
        notifyUser(String(deptHead._id), {
          type: "clarification",
          title: "Clearer proof of use needed",
          body: `The verification approver needs clearer proof of use for "${request.title}".`,
          requestId: request.request_id,
          at: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json({ message: "Clarification requested", request });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// respond to clarification 
router.post("/:request_id/respond", async (req, res) => {
  const { response } = req.body;
  if (!response) return res.status(400).json({ message: "response is required" });

  try {
    const request = await Request.findOne({ request_id: req.params.request_id });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "clarification_needed") {
      return res.status(400).json({ message: "No clarification is pending for this request" });
    }

    const pending = [...request.clarification].reverse().find((c) => !c.response);
    if (!pending) {
      return res.status(400).json({ message: "No clarification is pending for this request" });
    }

    const actorId = getActorId(req);
    const actor = await Employee.findById(actorId);
    if (!actor || String(actor.company_id) !== String(request.company_id)) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }
    if (actor.status === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact your organization admin." });
    }

    const askedByDeptHead = pending.asked_by_role ? pending.asked_by_role === "department_head" : true;
    const isRequester = String(request.user_id) === actorId;
    const isDeptHead = actor.role === "department_head" && actor.department === request.department;
    const authorized = askedByDeptHead ? isRequester : isDeptHead;

    if (!authorized) {
      return res.status(403).json({
        message: askedByDeptHead
          ? "Only the requester can respond to clarification"
          : "Only the department head can respond to this clarification",
      });
    }

    pending.response = response;
    pending.responded_at = new Date();
    request.markModified("clarification");

    request.status = request.pre_clarification_status || "pending";
    request.pre_clarification_status = "";
    await request.save();

    // Notify whoever originally asked
    notifyUser(String(pending.asked_by), {
      type: "clarification",
      title: "Clarification received",
      body: `${askedByDeptHead ? "The requester" : "The department head"} has responded to your question on "${request.title}".`,
      requestId: request.request_id,
      at: new Date().toISOString(),
    });

    return res.status(200).json({ message: "Response submitted", request });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// close request 
router.post("/:request_id/close", async (req, res) => {
  try {
    const request = await Request.findOne({ request_id: req.params.request_id });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status === "closed") {
      return res.status(400).json({ message: "Already closed" });
    }
    // Once funds are delegated (proof of use attached, awaiting verification)
    if (["delegated", "approved"].includes(request.status)) {
      return res.status(400).json({ message: "This request can no longer be closed — funds have already been delegated." });
    }

    const actorId = getActorId(req);
    const actor = await Employee.findById(actorId);
    if (!actor || String(actor.company_id) !== String(request.company_id)) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }
    if (actor.status === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended. Contact your organization admin." });
    }

    const isRequester = String(request.user_id) === actorId;
    const isDeptHead = actor?.role === "department_head" && actor.department === request.department;

    if (!isRequester && !isDeptHead) {
      return res.status(403).json({ message: "Only the requester or department head can close this request" });
    }

    request.status = "closed";
    request.closed_at = new Date();
    request.closed_by = actor._id;
    await request.save();

    // Notify the other party
    if (isRequester) {
      const deptHead = await Employee.findOne({
        company_id: request.company_id,
        department: request.department,
        role: "department_head",
      });
      if (deptHead) {
        notifyUser(String(deptHead._id), {
          type: "request_update",
          title: "Request closed",
          body: `"${request.title}" was closed by the requester.`,
          requestId: request.request_id,
          at: new Date().toISOString(),
        });
      }
    } else {
      notifyUser(String(request.user_id), {
        type: "request_update",
        title: "Request closed",
        body: `Your request "${request.title}" was closed by the department head.`,
        requestId: request.request_id,
        at: new Date().toISOString(),
      });
    }

    return res.status(200).json({ message: "Request closed", request });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});



router.use(loadActor);

// create request 
router.post("/new_request", async (req, res) => {
  try {
    const request = { ...req.body, company_id: req.actor.company_id, user_id: req.actor.id };

    const deptHead = await Employee.findOne({
      company_id: request.company_id,
      department: request.department,
      role: "department_head",
    });

    const initialIndex = deptHead ? 0 : 1;
    const newRequest = await Request.create({ ...request, approval_index: initialIndex });

    if (deptHead) {
      notifyUser(String(deptHead._id), {
        type: "new_request",
        title: "New request needs your review",
        body: `"${newRequest.title}" from your department requires your approval.`,
        requestId: newRequest.request_id,
        at: new Date().toISOString(),
      });
    } else {
      // No dept head — go straight to funding approver
      const approversDoc = await getApprovers(request.company_id);
      if (approversDoc?.funding_authority) {
        await notifyApproversByEmail(request.company_id, [approversDoc.funding_authority], {
          type: "new_request",
          title: "New request needs funding approval",
          body: `"${newRequest.title}" requires your review.`,
          requestId: newRequest.request_id,
          at: new Date().toISOString(),
        });
      }
    }

    return res.status(201).json({ message: "Request created successfully", request: newRequest });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

//  admin status override 
router.patch("/:id/status", requireRole("admin"), async (req, res) => {
  const { status, message } = req.body;
  const VALID = ["pending", "approved", "rejected", "under_review", "funded", "delegated", "closed"];
  if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status" });

  try {
    const existing = await Request.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Request not found" });
    if (String(existing.company_id) !== req.actor.company_id) {
      return res.status(403).json({ message: "You do not have access to this company's data" });
    }

    const request = await Request.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    notifyUser(String(request.user_id), {
      type: "request_update",
      title: `Request ${status}`,
      body: message || `Your request "${request.title}" status was updated to ${status}.`,
      requestId: request.request_id,
      at: new Date().toISOString(),
    });
    return res.status(200).json({ message: "Status updated", request });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// company-wide stats (all roles)
router.get("/stats/:company_id", verifySameCompany("params:company_id"), async (req, res) => {
  try {
    const requests = await Request.find({ company_id: req.params.company_id });
    const approvedRequests = requests.filter(r => r.status === "approved");
    const total    = requests.length;
    const approved = approvedRequests.length;
    const pending  = requests.filter(r => ["pending", "under_review", "funded", "delegated"].includes(r.status)).length;
    const rejected = requests.filter(r => r.status === "rejected").length;
    // Disbursed = only money that's actually gone out 
    const totalAmount = approvedRequests.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    return res.status(200).json({ total, approved, pending, rejected, totalAmount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// get request details 
router.get("/:request_id", async (req, res) => {
  try {
    const request = await Request.findOne({ request_id: req.params.request_id });
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (String(request.company_id) !== req.actor.company_id) {
      return res.status(404).json({ message: "Request not found" });
    }

    const requester = await Employee.findById(request.user_id).select("first_name last_name department");
    const approversDoc = await getApprovers(request.company_id);
    const deptHead = await Employee.findOne({
      company_id: request.company_id,
      department: request.department,
      role: "department_head",
    }).select("_id");

    return res.status(200).json({
      ...request.toObject(),
      requesterName: requester ? `${requester.first_name} ${requester.last_name}` : "",
      funding_authority: approversDoc?.funding_authority || "",
      verification_authority: approversDoc?.verification_authority || "",
      has_department_head: !!deptHead,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
