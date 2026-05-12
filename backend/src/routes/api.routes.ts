// backend/src/routes/api.routes.ts
import { Router, Request, Response } from "express";
import { authenticate, requireScope, requireRole } from "../middleware/authenticate.js";

const router = Router();

// All routes require authentication
// router.use(authenticate);

// User profile - requires 'read' scope
router.get("/profile", authenticate, requireScope("read"), (req, res) => {
  res.json({
    user: req.user,
  });
});

// Update profile - requires 'write' scope
router.put("/profile", authenticate, requireScope("write"), async (req, res) => {
  // Update user profile
  res.json({ success: true });
});

// Admin only - requires 'admin' role
router.get("/admin/users", authenticate, requireRole("admin"), async (req, res) => {
  // Return all users
  res.json({ users: [] });
});

// Public endpoint (no auth required)
router.get("/health", (req: Request, res: Response)  => {
  res.json({ status: "ok" });
});

export default router;
