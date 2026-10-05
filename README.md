# FinReq — Backend

The API and real-time server for **FinReq**, a multi-tenant financial
requisition (expense/purchase approval) system. A company registers an
account, invites its employees, and every financial request an employee
raises then moves through a fixed, budget-aware approval chain — department
head, funding approver, department head again (proof of use), verification
approver — before it's marked approved. Every step is timestamped and kept
in a permanent audit trail.

This document describes the backend only.

---

## Tech stack

| Concern | Tool |
|---|---|
| Runtime / framework | **Node.js + Express** |
| Database | **MongoDB** |
---

## How the domain model works

FinReq is **multi-tenant**: There are two kinds of authenticated principal ("actor"):

- **Company** — the account created at sign-up. Always has the `admin`
  role. Owns the organization's budget, departments, and approver
  assignments.
- **Employee** — a person invited into a company. Has one of four roles:
  - `requester` — the default; can submit and track their own requests.
  - `department_head` — reviews requests from their own department, and
    later attaches proof that delegated funds were actually used.
  - `approver` — a general tag for someone assigned to a special role
    (funding or verification authority — see below). Being tagged
    `approver` on its own doesn't grant any stage of the approval chain;
    it's the `funding_authority` / `verification_authority` assignment on
    the company's `Approvers` document that actually does.
  - `admin` — only companies have this role.

## The approval chain

A `Request` moves through up to five stages, tracked by an integer
`approval_index` (0–4) plus a human-readable `status` string:

| `approval_index` | Who acts | What they do | Resulting `status` |
|---|---|---|---|
| 0 | The requester's **department head** | Reviews the request. **Skipped automatically** (chain starts at 1) if the department has no head assigned. | `under_review` |
| 1 | The company's **funding approver** | Checks it against the organization's *remaining* budget, attaches `proof_of_funds`. | `funded` |
| 2 | The same **department head** | Attaches `proof_of_use` — evidence the delegated funds were spent as intended. | `delegated` |
| 3 | The company's **verification approver** | Confirms the proof of use. | `approved` (chain complete) |

At any stage, the acting approver can instead:
- **Reject** the request — `status` becomes `rejected`, the chain ends. The
  requester can submit a new request; the rejection stays in the audit
  trail.
- **Request clarification** (only the department head at stage 0/2, or the
  verification approver at stage 3) — `status` becomes
  `clarification_needed`, the question is appended to the request's
  `clarification` array, and the chain pauses. Whoever the question was
  aimed at (the requester, or the department head if the verification
  approver asked) answers via `/request/:id/respond`, which restores the
  `status` that was in effect before the question was asked and the chain
  resumes at the *same* `approval_index` — clarification never restarts the
  chain.

The requester (or the department head) can also **close** a request early,
but only while it's still at `pending`/`under_review`/`clarification_needed`
— once funds have been delegated (`delegated` or `approved`), closing is
blocked, since money has already moved.

## Business rules

- **Budget is enforced at two separate points**, not one:
  1. **At submission** (`POST /request/new_request`) — if the requested
     amount alone already exceeds the company's *total* budget, the
     request is rejected immediately; it could never be approved regardless
     of what else happens.
  2. **At the funding stage** (`approval_index === 1`) — the funding
     approver's attempt to approve is blocked if the amount would exceed
     what's actually *left* (total budget minus the sum of every
     already-`approved` request). A request can pass the first check and
     still fail the second if other requests got approved in the meantime.
- **One department head per department** — assigning a second person as
  head of a department that already has one is rejected (409) until the
  first is unassigned.
- **Merging departments** moves every employee, request, and unused invite
  from the merged-away department into the target department. If both
  departments had a head, the head of the department being merged away is
  demoted to `requester` (and stripped from any approver assignment) since
  only one head can survive the merge.
- **Removing an employee** also adds them to a `BlockedUser` list (scoped
  to that company + email) so they can't simply be re-invited or re-register
  into the same company after being removed, and strips them from any
  approver/funding/verification assignment.
