const clients = new Set();

function addClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevent Nginx buffering if used
  });

  // Keep connection alive with heartbeat
  res.write(': heartbeat\n\n');
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  clients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      clients.delete(client);
    }
  });
}

module.exports = {
  addClient,
  broadcast
};
