"use strict";

const { createReadStream } = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");

const [host, port] = process.argv.slice(2);
const contentTypes = {
  "index.html": "text/html",
  "style.css": "text/css",
  "pricing.js": "text/javascript",
  "script.js": "text/javascript",
  "hotel-import.js": "text/javascript",
  "sample-hotel-data.csv": "text/csv"
};

createServer((request, response) => {
  const file = request.url === "/" ? "index.html" : request.url.slice(1);
  if (!Object.hasOwn(contentTypes, file)) {
    response.writeHead(404).end();
    return;
  }

  const stream = createReadStream(join(__dirname, "..", file));
  stream.once("open", () => {
    response.writeHead(200, { "Content-Type": contentTypes[file] + "; charset=utf-8" });
    stream.pipe(response);
  });
  stream.once("error", () => response.writeHead(500).end());
}).listen(Number(port), host);
