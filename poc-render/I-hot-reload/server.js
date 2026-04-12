const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8765);
const ROOT = __dirname;
const TIMELINE_PATH = path.join(ROOT, "timeline.json");
const AURORA_PATH = path.join(ROOT, "..", "auroraGradient.js");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const sockets = new Set();

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      if (res.req.method !== "HEAD") {
        res.end(error.code === "ENOENT" ? "Not found" : "Internal server error");
        return;
      }

      res.end();
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".json" ? "no-store" : "no-cache",
    });
    if (res.req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(data);
  });
}

function createWebSocketAccept(key) {
  return crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, "utf8")
    .digest("base64");
}

function createTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  let header;

  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  return Buffer.concat([header, payload]);
}

function broadcastTimelineChange(changedAt) {
  const frame = createTextFrame(JSON.stringify({ type: "timeline-updated", changedAt }));

  for (const socket of sockets) {
    if (socket.destroyed) {
      sockets.delete(socket);
      continue;
    }

    socket.write(frame);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (url.pathname === "/") {
    sendFile(res, path.join(ROOT, "index.html"));
    return;
  }

  if (url.pathname === "/timeline.json") {
    sendFile(res, TIMELINE_PATH);
    return;
  }

  if (url.pathname === "/auroraGradient.js") {
    sendFile(res, AURORA_PATH);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];

  if (req.url !== "/ws" || !key) {
    socket.destroy();
    return;
  }

  const accept = createWebSocketAccept(key);
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
  ];

  socket.write(`${responseHeaders.join("\r\n")}\r\n\r\n`);
  sockets.add(socket);

  socket.on("close", () => sockets.delete(socket));
  socket.on("end", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
  socket.on("data", (chunk) => {
    const opcode = chunk[0] & 0x0f;
    if (opcode === 0x8) {
      socket.end();
      sockets.delete(socket);
    }
  });
});

let watchTimer = null;

fs.watch(ROOT, (eventType, filename) => {
  if (!filename || filename !== "timeline.json") {
    return;
  }

  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    fs.stat(TIMELINE_PATH, (error, stats) => {
      if (error) {
        return;
      }

      broadcastTimelineChange(Math.round(stats.mtimeMs));
    });
  }, 15);
});

server.listen(PORT, () => {
  console.log(`Hot reload preview running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing listener or run with PORT=<free-port> node server.js.`);
    process.exitCode = 1;
    return;
  }

  throw error;
});
