import { PlayerState } from "./types";
import {
  OBSTACLES,
  ARENA_SPAWN_POINTS,
  BOUNDARY_LIMIT,
  isRayBlockedByColliders,
  getSafeSpawnPoint,
  EYE_HEIGHT,
} from "./obstacles";

const DEFAULT_INVENTORY_INPUT = [
  { key: "rifle", damage: 20, fireRate: 750, magazineSize: 30 },
  { key: "pistol", damage: 25, fireRate: 400, magazineSize: 12 },
  { key: "knife", damage: 75, fireRate: 150, magazineSize: 1 },
];
const MAX_RANGE = 60;
const SCORE_LIMIT = 10;
const ARENA_ROUND_DURATION_SEC = 300; // 5 minute standard round limit for Public Arena
const POSITION_TOLERANCE = 3; // generous, since there's no client prediction yet
const PLAYER_RADIUS = 0.42; // horizontal hit radius for 1.54m voxel character
const CHARACTER_HEIGHT = 1.62; // 1.54m character height with head margin

type Vec3 = { x: number; y: number; z: number };
export type RoomEventEmitter = (event: string, payload: unknown) => void;

function rayCapsuleIntersect(
  origin: Vec3,
  dir: Vec3,
  feet: Vec3,
  head: Vec3,
  radius: number,
  maxDist: number,
): number | null {
  // Infinite vertical cylinder test in the XZ plane
  const ox = origin.x - feet.x;
  const oz = origin.z - feet.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  let cylinderT: number | null = null;

  if (a > 1e-9) {
    const b = ox * dir.x + oz * dir.z;
    const c = ox * ox + oz * oz - radius * radius;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t0 = (-b - sqrtDisc) / a;
      const t1 = (-b + sqrtDisc) / a;
      for (const t of [t0, t1]) {
        if (t < 0 || t > maxDist) continue;
        const y = origin.y + t * dir.y;
        if (y >= feet.y && y <= head.y) {
          cylinderT = t;
          break;
        }
      }
    }
  } else {
    // Ray is vertical — check if it's within the cylinder's radius at all
    if (ox * ox + oz * oz > radius * radius) return capCheck();
  }

  if (cylinderT !== null) return cylinderT;
  return capCheck();

  // Round caps at feet and head (covers shots into the top of the head / low near the feet)
  function capCheck(): number | null {
    const tFeet = raySphereIntersect(origin, dir, feet, radius, maxDist);
    const tHead = raySphereIntersect(origin, dir, head, radius, maxDist);
    if (tFeet !== null && tHead !== null) return Math.min(tFeet, tHead);
    return tFeet ?? tHead;
  }
}

export class GameRoom {
  id: string;
  players: Map<string, PlayerState> = new Map();
  isPublicArena = false;
  isDestroyed = false;
  hasStarted = false;
  roundDurationSec = 0;
  roundStartTime = 0;
  private emit: RoomEventEmitter;
  private matchOver = false;
  private tickInterval: NodeJS.Timeout;

  constructor(id: string, emit: RoomEventEmitter, isPublicArena = false) {
    this.id = id;
    this.emit = emit;
    this.isPublicArena = isPublicArena;
    if (isPublicArena) {
      this.hasStarted = true;
      this.roundDurationSec = ARENA_ROUND_DURATION_SEC;
      this.roundStartTime = Date.now();
    }
    this.tickInterval = setInterval(() => this.broadcastState(), 50);
  }

  get isMatchOver(): boolean {
    return this.matchOver;
  }

  get playerCount(): number {
    return this.players.size;
  }

  getRemainingTime(): number {
    if (this.roundDurationSec <= 0) return 0;
    const elapsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
    return Math.max(0, this.roundDurationSec - elapsed);
  }

  startMatch() {
    this.hasStarted = true;
    if (!this.isPublicArena) {
      this.roundStartTime = Date.now();
    }
  }

  addPlayer(
    userId: string,
    socketId: string,
    username: string,
    spawnIndex: number,
    inventoryInput?: {
      key: string;
      damage: number;
      fireRate: number;
      magazineSize: number;
    }[],
  ) {
    const source =
      inventoryInput && inventoryInput.length === 3
        ? inventoryInput
        : DEFAULT_INVENTORY_INPUT;
    const inventory = source.map((w) => ({
      key: w.key,
      damage: w.damage,
      fireIntervalMs: 60000 / w.fireRate,
      magazineSize: w.magazineSize,
    }));

    const existing = this.players.get(userId);
    if (existing) {
      existing.socketId = socketId;
      existing.username = username;
      if (inventoryInput && inventoryInput.length === 3) {
        existing.inventory = inventory;
        existing.ammoPerWeapon = inventory.map((w) => w.magazineSize);
      }
      return;
    }

    const spawn = ARENA_SPAWN_POINTS[spawnIndex % ARENA_SPAWN_POINTS.length];

    this.players.set(userId, {
      id: userId,
      socketId,
      username,
      x: spawn.x,
      y: EYE_HEIGHT,
      z: spawn.z,
      yaw: spawn.yaw,
      health: 100,
      kills: 0,
      deaths: 0,
      alive: true,
      lastShotTime: 0,
      inventory,
      ammoPerWeapon: inventory.map((w) => w.magazineSize),
      currentSlot: 0,
      weaponKills: [0, 0, 0],
    });
  }

  switchWeapon(userId: string, slot: number) {
    const player = this.players.get(userId);
    if (!player || !player.alive || this.matchOver) return;
    if (slot < 0 || slot > 2) return;
    player.currentSlot = slot;
  }

  removePlayer(userId: string) {
    this.players.delete(userId);
  }

  updateMovement(userId: string, x: number, y: number, z: number, yaw: number) {
    const player = this.players.get(userId);
    if (!player || !player.alive || this.matchOver) return;
    const bound = BOUNDARY_LIMIT;
    player.x = Math.max(-bound, Math.min(bound, x));
    player.y = y;
    player.z = Math.max(-bound, Math.min(bound, z));
    player.yaw = yaw;
  }

  handleShoot(shooterId: string, origin: Vec3, direction: Vec3) {
    const shooter = this.players.get(shooterId);
    if (!shooter || !shooter.alive || this.matchOver) return;

    const weapon = shooter.inventory[shooter.currentSlot];
    const now = Date.now();
    if (now - shooter.lastShotTime < weapon.fireIntervalMs) return;
    if (shooter.ammoPerWeapon[shooter.currentSlot] <= 0) return;

    const dx = origin.x - shooter.x;
    const dz = origin.z - shooter.z;
    if (Math.sqrt(dx * dx + dz * dz) > POSITION_TOLERANCE) return;

    shooter.lastShotTime = now;
    shooter.ammoPerWeapon[shooter.currentSlot] -= 1;

    const dir = normalize(direction);
    let closestHit: { targetId: string; distance: number } | null = null;

    for (const target of this.players.values()) {
      if (target.id === shooterId || !target.alive) continue;
      const jumpOffset = Math.max(0, target.y - EYE_HEIGHT);
      const feetY = jumpOffset + PLAYER_RADIUS;
      const headY = Math.max(feetY, jumpOffset + CHARACTER_HEIGHT - PLAYER_RADIUS);
      const t = rayCapsuleIntersect(
        origin,
        dir,
        { x: target.x, y: feetY, z: target.z },
        { x: target.x, y: headY, z: target.z },
        PLAYER_RADIUS,
        MAX_RANGE,
      );
      if (t !== null && !isRayBlockedByColliders(origin, dir, t, OBSTACLES)) {
        if (!closestHit || t < closestHit.distance) {
          closestHit = { targetId: target.id, distance: t };
        }
      }
    }

    if (closestHit) {
      this.applyDamage(closestHit.targetId, weapon.damage, shooterId);
    }
  }

  reload(userId: string) {
    const player = this.players.get(userId);
    if (!player) return;
    player.ammoPerWeapon[player.currentSlot] =
      player.inventory[player.currentSlot].magazineSize;
  }

  private applyDamage(targetId: string, amount: number, byId: string) {
    const target = this.players.get(targetId);
    const shooter = this.players.get(byId);
    if (!target || !target.alive) return;

    target.health -= amount;
    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.deaths += 1;
      if (shooter) {
        shooter.kills += 1;
        shooter.weaponKills[shooter.currentSlot] += 1;
      }

      this.emit("player:eliminated", {
        targetId,
        byId,
        byUsername: shooter?.username,
        targetUsername: target.username,
      });

      if (this.isPublicArena) {
        if (shooter && shooter.kills >= 30) {
          this.endMatch(shooter.id);
          return;
        }
        setTimeout(() => this.respawn(targetId), 3000);
        return;
      }

      if (shooter && shooter.kills >= SCORE_LIMIT) {
        this.endMatch(shooter.id);
        return;
      }
      setTimeout(() => this.respawn(targetId), 3000);
    } else {
      this.emit("player:damaged", { targetId, health: target.health });
    }
  }

  private respawn(userId: string) {
    const player = this.players.get(userId);
    if (!player || this.matchOver) return;

    const otherPlayers = [...this.players.values()].filter(
      (p) => p.id !== userId && p.alive,
    );
    const avoid =
      otherPlayers.length > 0
        ? { x: otherPlayers[0].x, z: otherPlayers[0].z }
        : undefined;
    const safeSpawn = getSafeSpawnPoint(avoid);

    player.x = safeSpawn.x;
    player.y = EYE_HEIGHT;
    player.z = safeSpawn.z;
    player.yaw = safeSpawn.yaw;
    player.health = 100;
    player.currentSlot = 0;
    player.ammoPerWeapon = player.inventory.map((w) => w.magazineSize);
    player.alive = true;
    this.emit("player:respawned", {
      userId,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
    });
  }

  private endMatch(winnerId?: string) {
    if (this.matchOver) return;
    this.matchOver = true;
    const sorted = [...this.players.values()].sort(
      (a, b) => b.kills - a.kills || a.deaths - b.deaths,
    );
    const winner = winnerId
      ? sorted.find((p) => p.id === winnerId) || sorted[0]
      : sorted[0];
    const actualWinnerId = winner?.id || "";

    const results = sorted.map((p, idx) => ({
      userId: p.id,
      username: p.username,
      kills: p.kills,
      deaths: p.deaths,
      won: p.id === actualWinnerId,
      rank: idx + 1,
      weapons: p.inventory.map((w, i) => ({
        weaponKey: w.key,
        kills: p.weaponKills[i],
      })),
    }));

    this.emit("match:end", {
      winnerId: actualWinnerId,
      winnerUsername: winner?.username || "Unknown",
      results,
    });
    clearInterval(this.tickInterval);
  }


  handleDisconnect(userId: string) {
    if (this.matchOver) return;
    this.removePlayer(userId);
    if (this.isPublicArena) {
      this.emit("room:playerLeft", { userId });
      return;
    }
    const remaining = [...this.players.values()].filter((p) => p.id !== userId);
    if (this.hasStarted && remaining.length === 1) {
      this.endMatch(remaining[0].id);
    } else {
      this.emit("room:playerLeft", { userId });
    }
  }

  private broadcastState() {
    if (this.matchOver) return;

    let roundTimeRemaining: number | undefined;
    if (this.roundDurationSec > 0) {
      const elapsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
      roundTimeRemaining = Math.max(0, this.roundDurationSec - elapsed);

      if (roundTimeRemaining <= 0) {
        this.endMatch();
        return;
      }
    }

    const snapshot = [...this.players.values()].map((p) => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      health: p.health,
      ammo: p.ammoPerWeapon[p.currentSlot],
      weaponKey: p.inventory[p.currentSlot].key,
      kills: p.kills,
      deaths: p.deaths,
      alive: p.alive,
    }));
    this.emit("state:update", { players: snapshot, roundTimeRemaining });
  }

  destroy() {
    this.isDestroyed = true;
    this.matchOver = true;
    clearInterval(this.tickInterval);
  }

  cleanUp() {
    this.destroy();
  }
}

// ---------- vector math helpers ----------

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function raySphereIntersect(
  origin: Vec3,
  dir: Vec3,
  center: Vec3,
  radius: number,
  maxDist: number,
): number | null {
  const oc = {
    x: origin.x - center.x,
    y: origin.y - center.y,
    z: origin.z - center.z,
  };
  const b = oc.x * dir.x + oc.y * dir.y + oc.z * dir.z;
  const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return t;
}

