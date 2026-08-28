import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { GameRoom } from "./GameRoom";
import { Matchmaker } from "./matchmaking";

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET as string;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

app.get("/health", (_req, res) => res.json({ ok: true }));

interface AuthedSocketData {
  userId: string;
  username: string;
}

const rooms = new Map<string, GameRoom>();
const socketToRoom = new Map<string, string>();
const matchmaker = new Matchmaker();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token provided"));
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
    (socket.data as AuthedSocketData).userId = payload.userId;
    (socket.data as AuthedSocketData).username = payload.username;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const { userId, username } = socket.data as AuthedSocketData;

  socket.on("queue:join", () => {
    matchmaker.enqueue({ userId, username, socketId: socket.id });
    const match = matchmaker.tryMatch();

    if (match) {
      const [a, b] = match;
      const roomId = `room_${a.userId}_${b.userId}_${Date.now()}`;
      const room = new GameRoom(roomId, (event, payload) => {
        io.to(roomId).emit(event, payload);
      });
      room.addPlayer(a.userId, a.socketId, a.username, 0);
      room.addPlayer(b.userId, b.socketId, b.username, 1);
      rooms.set(roomId, room);

      for (const p of [a, b]) {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) {
          s.join(roomId);
          socketToRoom.set(p.socketId, roomId);
        }
      }

      io.to(roomId).emit("match:found", {
        roomId,
        players: [
          { id: a.userId, username: a.username },
          { id: b.userId, username: b.username },
        ],
      });
    } else {
      socket.emit("queue:waiting", { position: matchmaker.queueLength() });
    }
  });

  socket.on("queue:leave", () => matchmaker.dequeue(userId));

  socket.on("player:move", (data: { x: number; y: number; z: number; yaw: number }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    rooms.get(roomId)?.updateMovement(userId, data.x, data.y, data.z, data.yaw);
  });

  socket.on(
    "player:shoot",
    (data: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      rooms.get(roomId)?.handleShoot(userId, data.origin, data.direction);
    }
  );

  socket.on("player:reload", () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) rooms.get(roomId)?.reload(userId);
  });

  socket.on("disconnect", () => {
    matchmaker.dequeue(userId);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      rooms.get(roomId)?.handleDisconnect(userId);
      socketToRoom.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Game server listening on port ${PORT}`);
});