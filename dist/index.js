"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const GameRoom_1 = require("./GameRoom");
const matchmaking_1 = require("./matchmaking");
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: CLIENT_ORIGIN, credentials: true },
});
app.get("/health", (_req, res) => res.json({ ok: true }));
const rooms = new Map();
const socketToRoom = new Map();
const matchmaker = new matchmaking_1.Matchmaker();
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token)
        return next(new Error("No token provided"));
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        socket.data.userId = payload.userId;
        socket.data.username = payload.username;
        next();
    }
    catch {
        next(new Error("Invalid token"));
    }
});
io.on("connection", (socket) => {
    const { userId, username } = socket.data;
    socket.on("queue:join", (data) => {
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
            const room = new GameRoom_1.GameRoom(roomId, (event, payload) => {
                io.to(roomId).emit(event, payload);
            });
            room.addPlayer(a.userId, a.socketId, a.username, 0, a.inventory);
            room.addPlayer(b.userId, b.socketId, b.username, 1, b.inventory);
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
                players: [...room.players.values()].map((p) => ({
                    id: p.id,
                    username: p.username,
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    yaw: p.yaw,
                })),
            });
        }
        else {
            socket.emit("queue:waiting", { position: matchmaker.queueLength() });
        }
    });
    socket.on("queue:leave", () => matchmaker.dequeue(userId));
    socket.on("player:move", (data) => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        rooms
            .get(roomId)
            ?.updateMovement(userId, data.x, data.y, data.z, data.yaw);
    });
    socket.on("player:shoot", (data) => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        rooms.get(roomId)?.handleShoot(userId, data.origin, data.direction);
    });
    socket.on("player:reload", () => {
        const roomId = socketToRoom.get(socket.id);
        if (roomId)
            rooms.get(roomId)?.reload(userId);
    });
    socket.on("player:switchWeapon", (data) => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        rooms.get(roomId)?.switchWeapon(userId, data.slot);
    });
    socket.on("disconnect", () => {
        matchmaker.dequeue(userId);
        const roomId = socketToRoom.get(socket.id);
        if (roomId) {
            rooms.get(roomId)?.handleDisconnect(userId);
            socketToRoom.delete(socket.id);
        }
    });
    socket.on("room:create", (data) => {
        const roomCode = generateRoomCode();
        const room = new GameRoom_1.GameRoom(roomCode, (event, payload) => {
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
    });
    socket.on("room:join", (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) {
            socket.emit("room:error", { message: "Room not found." });
            return;
        }
        if (room.players.size >= 2) {
            socket.emit("room:error", { message: "Room is full." });
            return;
        }
        room.addPlayer(userId, socket.id, username, 1, data.inventory);
        socket.join(data.roomCode);
        socketToRoom.set(socket.id, data.roomCode);
        const playerList = [...room.players.values()].map((p) => ({
            id: p.id,
            username: p.username,
            ready: false,
        }));
        io.to(data.roomCode).emit("room:playerJoined", { players: playerList });
    });
    socket.on("room:ready", (data) => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        io.to(roomId).emit("room:playerReady", { userId, ready: data.ready });
    });
    socket.on("room:start", () => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        const room = rooms.get(roomId);
        if (!room || room.players.size < 2)
            return;
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
    socket.on("room:chat", (data) => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        io.to(roomId).emit("room:chatMessage", {
            username,
            message: data.message.slice(0, 200),
            timestamp: Date.now(),
        });
    });
    socket.on("room:leave", () => {
        const roomId = socketToRoom.get(socket.id);
        if (!roomId)
            return;
        const room = rooms.get(roomId);
        if (room) {
            room.removePlayer(userId);
            socket.leave(roomId);
            socketToRoom.delete(socket.id);
            if (room.players.size === 0) {
                room.destroy();
                rooms.delete(roomId);
            }
            else {
                io.to(roomId).emit("room:playerLeft", { userId });
            }
        }
    });
    socket.on("match:enter", (data) => {
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
function generateRoomCode() {
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
