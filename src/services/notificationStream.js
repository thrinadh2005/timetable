/**
 * Server-Sent Events (SSE) hub for real-time in-app notifications.
 *
 * Keeps a registry of connected clients keyed by user id so a notification
 * created for a user is pushed instantly, removing the need for the frontend
 * to poll every 10 seconds. Connections are cleaned up automatically when a
 * client disconnects or the socket errors.
 */

// Heartbeat cadence: comment frames keep idle proxies (nginx, ELB) from
// closing otherwise-silent connections.
const HEARTBEAT_MS = 25000;

// userId -> Set<ServerResponse>
const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    // The client vanished between checks; the close handler will clean up.
  }
}

/**
 * Registers an already-authenticated SSE connection and streams events to it
 * until the client disconnects.
 */
function subscribe(req, res, userId) {
  res.setHeader('Content-Type', 'text/event-stream');
  // no-transform stops the compression middleware from buffering/compressing
  // the stream; no-cache prevents intermediary caching.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  addClient(userId, res);

  // Handshake so the client can confirm the stream is live and stop polling.
  writeEvent(res, 'connected', { userId, at: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    try { res.write(`: keep-alive ${Date.now()}\n\n`); } catch (e) { /* ignore */ }
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  const cleanup = () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
}

/**
 * Pushes a notification payload to every live connection for a user.
 * Returns the number of connections written to.
 */
function publish(userId, payload) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return 0;
  for (const res of set) {
    writeEvent(res, 'notification', payload);
  }
  return set.size;
}

function connectionCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

module.exports = { subscribe, publish, connectionCount };
