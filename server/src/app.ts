import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import productsRoutes from "./routes/products.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js"
import usersRoute from "./routes/users.routes.js";
import favoritesRoute from './routes/favorites.routes.js'
import productTemplatesRoutes from './routes/productTemplates.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import donationsRoutes from './routes/donations.routes.js'
import adminRoutes from './routes/admin.routes.js'
import announcementsRoutes from './routes/announcements.routes.js'
import creditsRoutes from './routes/credits.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import statsRoutes from './routes/stats.routes.js'
import citiesRoutes from './routes/cities.routes.js'
import { HttpError } from "./utils/httpError.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no body; controllers destructure it.
app.use((req: Request, res: Response, next: NextFunction) => {
  req.body ??= {};
  next();
});
app.use(cookieParser());

// Rute
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/reservations", reservationsRoutes);
app.use("/api/users", usersRoute)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/favorites', favoritesRoute)
app.use('/api/product-templates', productTemplatesRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/donations', donationsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/announcements', announcementsRoutes)
app.use('/api/credits', creditsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/cities', citiesRoutes)
// nosniff: browsers must not treat an uploaded file as anything but its declared type.
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found." });
});

// Express recognises an error handler by its four parameters. Errors thrown outside the
// controllers' own try/catch (body parsing, middleware) still answer with { error }.
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(error);
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json(error.body());
  }
  if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request format." });
  }
  console.error("Unhandled error:", error);
  return res.status(500).json({ error: "A server error occurred." });
});

export default app;
