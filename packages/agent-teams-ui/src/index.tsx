#!/usr/bin/env node

import { render } from "ink";
import { resolve } from "node:path";
import { App } from "./App.js";

const workspacePath = resolve(process.argv[2] || process.cwd());

const { waitUntilExit } = render(<App workspacePath={workspacePath} />);

waitUntilExit().catch((err) => {
  if (err) process.stderr.write(String(err) + "\n");
  process.exit(1);
});
