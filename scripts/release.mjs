/* global process */

import { spawnSync } from "node:child_process";

const steps = [
  ["node", ["scripts/package-release.mjs", "clean"]],
  ["npm", ["run", "build:chrome"]],
  ["npm", ["run", "build:firefox"]],
  ["npm", ["run", "verify:chrome"]],
  ["npm", ["run", "verify:firefox"]],
  ["npm", ["run", "lint:firefox"]],
  ["npm", ["run", "package:chrome"]],
  ["npm", ["run", "package:firefox"]],
  ["npm", ["run", "package:source"]],
  ["node", ["scripts/package-release.mjs", "checksums"]],
  ["npm", ["run", "verify:archives"]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
