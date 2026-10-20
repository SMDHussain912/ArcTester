import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ecet-api", time: new Date().toISOString() });
});

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`ecet-api listening on http://localhost:${PORT}`);
  });
}

export default app;
