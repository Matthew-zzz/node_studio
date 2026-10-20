import { createServer } from "node:http";
import { createStaticHandler } from "../../server/static.ts";

export function createStaticServer(directory) {
  return createServer(createStaticHandler(directory));
}
