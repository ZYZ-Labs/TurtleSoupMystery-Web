import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import type { RoomConnectionReadyEvent, RoomRealtimeEvent } from './types/domain.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const { app, roomService } = await createApp();
const server = createServer(app);
const socketServer = new WebSocketServer({
  server,
  path: '/ws'
});

const clients = new Set<{
  socket: WebSocket;
  roomCode: string;
}>();

roomService.onRealtimeEvent((event: RoomRealtimeEvent) => {
  const payload = JSON.stringify(event);

  for (const client of clients) {
    if (client.roomCode !== event.roomCode) {
      continue;
    }

    if (client.socket.readyState !== WebSocket.OPEN) {
      continue;
    }

    client.socket.send(payload);
  }
});

socketServer.on('connection', (socket: WebSocket, request: IncomingMessage) => {
  const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host ?? 'localhost'}`);
  const roomCode = requestUrl.searchParams.get('roomCode')?.trim().toUpperCase() ?? '';

  if (!roomCode) {
    socket.close(1008, 'roomCode is required');
    return;
  }

  const client = {
    socket,
    roomCode
  };
  clients.add(client);

  const readyEvent: RoomConnectionReadyEvent = {
    type: 'connection.ready',
    roomCode,
    connectedAt: new Date().toISOString()
  };
  socket.send(JSON.stringify(readyEvent));

  socket.on('close', () => {
    clients.delete(client);
  });

  socket.on('error', () => {
    clients.delete(client);
  });
});

server.listen(port, host, () => {
  console.log(`Turtle Soup Mystery backend listening on http://${host}:${port}`);
});
