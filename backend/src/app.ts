// backend/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes.js";
import oauthRoutes from "./routes/oauth.routes.js";
import apiRoutes from "./routes/api.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import clientRoutes from "./routes/client.routes.js";

const app = express();

const loggerMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
};

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : ['http://localhost:3000', '*'],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  } as cors.CorsOptions)
);

// General Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use("/oauth", authLimiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// logger 
app.use(loggerMiddleware);

// Routes
app.use("/client", clientRoutes);
app.use("/oauth", oauthRoutes);
app.use("/auth", authRoutes);
app.use("/api", apiRoutes);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
