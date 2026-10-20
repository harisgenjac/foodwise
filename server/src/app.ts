import express from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import authRoutes from "./routes/auth.routes.js";
import productsRoutes from "./routes/products.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js"
import usersRoute from "./routes/users.routes.js";
import favoritesRoute from './routes/favorites.routes.js'
import productTemplatesRoutes from './routes/productTemplates.routes.js'
import { HttpError } from "./utils/httpError.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Rute
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/reservations", reservationsRoutes);
app.use("/api/users", usersRoute)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/favorites', favoritesRoute)
app.use('/api/product-templates', productTemplatesRoutes)
// nosniff: browsers must not treat an uploaded file as anything but its declared image type.
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta nije pronađena." });
});

// Errors thrown outside the controllers' own try/catch (body parsing, uploads) still answer with { error }.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Slika je prevelika. Maksimalna veličina je 5MB."
        : "Slika nije ispravno poslana.";
    return res.status(400).json({ error: message });
  }
  if (err instanceof Error && "type" in err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Neispravan format zahtjeva." });
  }
  console.error("Neobrađena greška:", err);
  return res.status(500).json({ error: "Došlo je do greške na serveru." });
});

export default app;
