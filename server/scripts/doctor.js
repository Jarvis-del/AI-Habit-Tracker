// Diagnostic: checks your setup step by step and tells you exactly what is wrong.
// Usage (from /server):  npm run doctor
import "dotenv/config";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { generateText, getModelChain, isGeminiConfigured } from "../src/config/gemini.js";

let failures = 0;
const ok = (msg) => console.log(`  \u2705 ${msg}`);
const bad = (msg, hint) => {
  failures++;
  console.log(`  \u274C ${msg}`);
  if (hint) console.log(`     -> ${hint}`);
};
const warn = (msg) => console.log(`  \u26A0\uFE0F  ${msg}`);

console.log("\n1) Environment");
Number(process.versions.node.split(".")[0]) >= 20
  ? ok(`Node ${process.versions.node}`)
  : bad(`Node ${process.versions.node} is too old`, "Install Node 20 or newer (https://nodejs.org).");
existsSync(new URL("../.env", import.meta.url))
  ? ok("server/.env found")
  : bad("server/.env not found", "Copy server/.env.example to server/.env and fill it in.");
process.env.JWT_SECRET?.trim()
  ? process.env.JWT_SECRET.length < 16 ? warn("JWT_SECRET is short - use a long random string") : ok("JWT_SECRET is set")
  : bad("JWT_SECRET is missing", "Add JWT_SECRET=<long random string> to server/.env");
process.env.MONGODB_URI?.trim()
  ? ok("MONGODB_URI is set")
  : bad("MONGODB_URI is missing", "Add your MongoDB connection string to server/.env");
const key = process.env.GEMINI_API_KEY?.trim();
if (!isGeminiConfigured()) bad("GEMINI_API_KEY is missing or still the placeholder", "Create a key at https://aistudio.google.com/apikey, put it in server/.env, restart.");
else {
  ok(`GEMINI_API_KEY is set (${key.slice(0, 4)}...${key.slice(-3)}, ${key.length} chars)`);
  if (/^["'\s]|["'\s]$/.test(process.env.GEMINI_API_KEY)) warn("The key has quotes/spaces around it - remove them.");
  if (!key.startsWith("AIza")) warn("Gemini API keys normally start with 'AIza' - double check you copied the right key.");
}

console.log("\n2) MongoDB");
if (process.env.MONGODB_URI) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    ok(`Connected to ${mongoose.connection.host}`);
    await mongoose.disconnect();
  } catch (err) {
    bad(`Could not connect: ${err.message}`, "Atlas: Network Access -> add your IP. Check username/password (URL-encode special characters). Some ISPs block mongodb+srv DNS lookups.");
  }
}

console.log(`\n3) Gemini (models tried in order: ${getModelChain().join(" -> ")})`);
if (isGeminiConfigured()) {
  try {
    const started = Date.now();
    const text = await generateText({ systemPrompt: "Reply with the single word: pong", userPrompt: "ping" });
    ok(`Gemini answered in ${Date.now() - started} ms: "${text.slice(0, 40)}"`);
  } catch (err) {
    bad(err.message, "Fix the problem above, restart the server, and run `npm run doctor` again.");
  }
} else {
  warn("Skipped (no API key).");
}

console.log(failures ? `\n${failures} problem(s) found.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
