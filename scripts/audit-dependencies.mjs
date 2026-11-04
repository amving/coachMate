import { spawnSync } from "node:child_process";

// npm provides its own CLI path: works on Windows without shell interpolation.
if (!process.env.npm_execpath) throw new Error("Run with npm run audit:security");
const result = spawnSync(process.execPath, ["--use-system-ca", process.env.npm_execpath, "audit"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
