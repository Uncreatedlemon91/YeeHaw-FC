// The standalone server doesn't serve .next/static or public/ unless they
// sit next to it. Next leaves copying them to us.
import { cpSync, existsSync, rmSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
// Next also copies .env into the bundle. Drop it: systemd's EnvironmentFile
// reads the real one, so an edit there takes effect on restart instead of
// being shadowed by a stale copy from the last build.
rmSync(".next/standalone/.env", { force: true });
console.log("Copied static assets into .next/standalone");
