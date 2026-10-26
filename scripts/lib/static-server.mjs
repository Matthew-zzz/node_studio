import { createServer } from "node:http";
import { createStaticHandler } from "./static-handler.mjs";

export function createStaticServer(directory) {
  return createServer(createStaticHandler(directory));
}
