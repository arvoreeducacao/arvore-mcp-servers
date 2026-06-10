#!/usr/bin/env node
import { PostHogMCPServer } from "./server.js";

const server = PostHogMCPServer.fromEnvironment();
server.setupGracefulShutdown();
server.start();
