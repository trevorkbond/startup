const { WebSocketServer } = require('ws');
const DB = require('./database.js');
const uuid = require('uuid');
const url = require('url');

function peerProxy(httpServer) {
    // Create a websocket object
    const wss = new WebSocketServer({ noServer: true });

    // Handle the protocol upgrade from HTTP to WebSocket
    httpServer.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            wss.emit('connection', ws, request);
        });
    });

    // Keep track of all the connections so we can forward messages
    let connections = [];

    wss.on('connection', (ws, req) => {
        const username = url.parse(req.url, true).query.username;
        const connection = { id: uuid.v4(), alive: true, ws: ws, username: username };
        connections.push(connection);

        // Forward messages to user specified in sent message
        ws.on('message', async function message(data) {
            const jsonData = JSON.parse(data);
            const username = jsonData.shareToUser;
            connections.forEach((c) => {
                if (c.username === username) {
                    c.ws.send(data);
                }
            });
        });

        // Remove the closed connection so we don't try to forward anymore
        ws.on('close', () => {
            const pos = connections.findIndex((o, i) => o.id === connection.id);

            if (pos >= 0) {
                connections.splice(pos, 1);
            }
        });

        // Respond to pong messages by marking the connection alive
        ws.on('pong', () => {
            connection.alive = true;
        });
    });

    // Keep active connections alive
    setInterval(() => {
        connections.forEach((c) => {
            // Kill any connection that didn't respond to the ping last time
            if (!c.alive) {
                c.ws.terminate();
            } else {
                c.alive = false;
                c.ws.ping();
            }
        });
    }, 10000);
}

module.exports = { peerProxy };
