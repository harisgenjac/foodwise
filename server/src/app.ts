import express from "express";
import type { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import productsRoutes from "./routes/products.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js"
import usersRoute from "./routes/users.routes.js";
import favoritesRoute from './routes/favorites.routes.js'
import productTemplatesRoutes from './routes/productTemplates.routes.js'

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
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
app.use('/uploads', express.static('uploads'));

app.use("/api", (req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta nije pronađena." });
});

// Express recognises an error handler by its four parameters.
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Neispravan format zahtjeva." });
  }
  console.error("Neobrađena greška:", error);
  return res.status(500).json({ error: "Došlo je do greške na serveru." });
});

export default app;
