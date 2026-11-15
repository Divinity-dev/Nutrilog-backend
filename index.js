import app from "./server.js";
import connectDB from "./db.js";

const port = Number(process.env.PORT) || 5000;

try {
  await connectDB();
  app.listen(port, () => {
    console.log(`NutriBlogHub API listening on port ${port}`);
  });
} catch (error) {
  console.error("Unable to start NutriBlogHub API:", error.message);
  process.exit(1);
}
