import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import productsRoutes from "./routes/products.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js"
import usersRoute from "./routes/users.routes.js";
import favoritesRoute from './routes/favorites.routes.js'

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
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
app.use('/uploads', express.static('uploads'));

export default app;
