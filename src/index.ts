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
app.get("/stats", (_req, res) =>
  res.json({
    onlinePlayers: io.engine.clientsCount,
    activeRooms: rooms.size,
  }),
);

interface AuthedSocketData {
  userId: string;
  username: string;
}

const rooms = new Map<string, GameRoom>();
const socketToRoom = new Map<string, string>();
const matchmaker = new Matchmaker();

function leaveCurrentRoom(socket: any, exceptRoomId?: string) {
  const currentRoomId = socketToRoom.get(socket.id);
  if (!currentRoomId || currentRoomId === exceptRoomId) return;
  socket.leave(currentRoomId);
  socketToRoom.delete(socket.id);
  const room = rooms.get(currentRoomId);
  if (room) {
    const { userId } = socket.data as AuthedSocketData;
    room.handleDisconnect(userId);
    if (room.isPublicArena && room.players.size === 0) {
      setTimeout(() => {
        if (room.players.size === 0) {
          room.destroy();
          rooms.delete(currentRoomId);
        }
      }, 30000);
    } else if (!room.isPublicArena && room.players.size === 0) {
      room.destroy();
      rooms.delete(currentRoomId);
    }
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token provided"));
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
    };
    (socket.data as AuthedSocketData).userId = payload.userId;
    (socket.data as AuthedSocketData).username = payload.username;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const { userId, username } = socket.data as AuthedSocketData;

  socket.on(
    "queue:join",
    (data?: {
      inventory?: {
        key: string;
        damage: number;
        fireRate: number;
        magazineSize: number;
      }[];
    }) => {
      leaveCurrentRoom(socket);
      matchmaker.enqueue({
        userId,
        username,
        socketId: socket.id,
        inventory: data?.inventory,
      });
      const match = matchmaker.tryMatch();

      if (match) {
        const [a, b] = match;
        const roomId = `room_${a.userId}_${b.userId}_${Date.now()}`;
        const room = new GameRoom(roomId, (event, payload) => {
          io.to(roomId).emit(event, payload);
        });
        room.startMatch();
        room.addPlayer(a.userId, a.socketId, a.username, 0, a.inventory);
        room.addPlayer(b.userId, b.socketId, b.username, 1, b.inventory);
        rooms.set(roomId, room);

        for (const p of [a, b]) {
          const s = io.sockets.sockets.get(p.socketId);
          if (s) {
            leaveCurrentRoom(s, roomId);
            s.join(roomId);
            socketToRoom.set(p.socketId, roomId);
          }
        }

        io.to(roomId).emit("match:found", {
          roomId,
          players: [...room.players.values()].map((p) => ({
            id: p.id,
            username: p.username,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
          })),
        });
      } else {
        socket.emit("queue:waiting", { position: matchmaker.queueLength() });
      }
    },
  );

  socket.on("queue:leave", () => matchmaker.dequeue(userId));

  socket.on(
    "arena:join",
    (data?: {
      inventory?: {
        key: string;
        damage: number;
        fireRate: number;
        magazineSize: number;
      }[];
    }) => {
      const MAX_ARENA_PLAYERS = 8;
      let publicRoom: GameRoom | null = null;
      let publicRoomId: string | null = null;

      const curId = socketToRoom.get(socket.id);
      if (curId) {
        const r = rooms.get(curId);
        if (
          r &&
          r.isPublicArena &&
          !r.isDestroyed &&
          !r.isMatchOver &&
          r.players.size <= MAX_ARENA_PLAYERS
        ) {
          publicRoom = r;
          publicRoomId = curId;
        }
      }

      if (!publicRoom) {
        for (const [id, room] of rooms) {
          if (
            room.isPublicArena &&
            !room.isDestroyed &&
            !room.isMatchOver &&
            (room.players.has(userId) || room.players.size < MAX_ARENA_PLAYERS)
          ) {
            publicRoom = room;
            publicRoomId = id;
            break;
          }
        }
      }

      if (!publicRoom || !publicRoomId) {
        publicRoomId = `public_arena_${Date.now()}`;
        publicRoom = new GameRoom(
          publicRoomId,
          (event, payload) => {
            io.to(publicRoomId!).emit(event, payload);
          },
          true,
        );
        rooms.set(publicRoomId, publicRoom);
      }

      leaveCurrentRoom(socket, publicRoomId);

      const spawnIndex = publicRoom.players.has(userId)
        ? 0
        : publicRoom.players.size;
      publicRoom.addPlayer(
        userId,
        socket.id,
        username,
        spawnIndex,
        data?.inventory,
      );
      socket.join(publicRoomId);
      socketToRoom.set(socket.id, publicRoomId);

      socket.emit("match:found", {
        roomId: publicRoomId,
        roundTimeRemaining: publicRoom.getRemainingTime(),
        players: [...publicRoom.players.values()].map((p) => ({
          id: p.id,
          username: p.username,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
        })),
      });
    },
  );

  socket.on(
    "player:move",
    (data: { x: number; y: number; z: number; yaw: number }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      rooms
        .get(roomId)
        ?.updateMovement(userId, data.x, data.y, data.z, data.yaw);
    },
  );

  socket.on(
    "player:shoot",
    (data: {
      origin: { x: number; y: number; z: number };
      direction: { x: number; y: number; z: number };
    }) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;
      rooms.get(roomId)?.handleShoot(userId, data.origin, data.direction);
    },
  );

  socket.on("player:reload", () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) rooms.get(roomId)?.reload(userId);
  });

  socket.on("player:switchWeapon", (data: { slot: number }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    rooms.get(roomId)?.switchWeapon(userId, data.slot);
  });

  socket.on("disconnect", () => {
    matchmaker.dequeue(userId);
    leaveCurrentRoom(socket);
  });

  socket.on(
    "room:create",
    (data?: {
      inventory?: {
        key: string;
        damage: number;
        fireRate: number;
        magazineSize: number;
      }[];
    }) => {
      leaveCurrentRoom(socket);
      const roomCode = generateRoomCode();
      const room = new GameRoom(roomCode, (event, payload) => {
        io.to(roomCode).emit(event, payload);
      });
      room.addPlayer(userId, socket.id, username, 0, data?.inventory);
      rooms.set(roomCode, room);
      socket.join(roomCode);
      socketToRoom.set(socket.id, roomCode);

      socket.emit("room:created", {
        roomCode,
        players: [{ id: userId, username, ready: false }],
      });
    },
  );

  socket.on(
    "room:join",
    (data: {
      roomCode: string;
      inventory?: {
        key: string;
        damage: number;
        fireRate: number;
        magazineSize: number;
      }[];
    }) => {
      const room = rooms.get(data.roomCode);
      if (!room) {
        socket.emit("room:error", { message: "Room not found." });
        return;
      }
      if (!room.players.has(userId) && room.players.size >= 2) {
        socket.emit("room:error", { message: "Room is full." });
        return;
      }

      leaveCurrentRoom(socket, data.roomCode);

      const spawnIndex = room.players.has(userId) ? 0 : room.players.size;
      room.addPlayer(userId, socket.id, username, spawnIndex, data.inventory);
      socket.join(data.roomCode);
      socketToRoom.set(socket.id, data.roomCode);

      const playerList = [...room.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        ready: false,
      }));
      io.to(data.roomCode).emit("room:playerJoined", { players: playerList });
    },
  );

  socket.on("room:ready", (data: { ready: boolean }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    io.to(roomId).emit("room:playerReady", { userId, ready: data.ready });
  });

  socket.on("room:start", () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.players.size < 2) return;
    room.startMatch();
    io.to(roomId).emit("match:found", {
      roomId,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
      })),
    });
  });

  socket.on("room:chat", (data: { message: string }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    io.to(roomId).emit("room:chatMessage", {
      username,
      message: data.message.slice(0, 200),
      timestamp: Date.now(),
    });
  });

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("match:enter", (data: { roomCode: string }) => {
    const room = rooms.get(data.roomCode);
    if (!room) {
      socket.emit("room:error", { message: "Match not found." });
      return;
    }
    const player = room.players.get(userId);
    if (!player) {
      socket.emit("room:error", { message: "You are not part of this match." });
      return;
    }

    leaveCurrentRoom(socket, data.roomCode);

    player.socketId = socket.id;
    socket.join(data.roomCode);
    socketToRoom.set(socket.id, data.roomCode);

    socket.emit("match:found", {
      roomId: data.roomCode,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
      })),
    });
  });
});

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars like O/0, I/1
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

server.listen(PORT, () => {
  console.log(`Game server listening on port ${PORT}`);
});
