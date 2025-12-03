import express from "express";
import mensajesRouter from "./routes/mensaje25";
import regalosRouter from "./routes/regalos";
import viewersRouter from "./routes/viewers27";
import streamersRouter from "./routes/streamers26";

const app = express();
app.use(express.json());

app.use("/api", regalosRouter);
app.use("/api", viewersRouter);
app.use("/api", mensajesRouter);
app.use("/api", streamersRouter);

// Manejador de errores simple
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Error interno" });
});

export default app;
