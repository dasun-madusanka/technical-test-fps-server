import { PlayerState } from "./types";
import { OBSTACLES } from "./obstacles";

const DEFAULT_INVENTORY_INPUT = [
  { key: "rifle", damage: 20, fireRate: 750, magazineSize: 30 },
  { key: "pistol", damage: 25, fireRate: 400, magazineSize: 12 },
  { key: "knife", damage: 75, fireRate: 150, magazineSize: 1 },
];
const MAX_RANGE = 60;
const SCORE_LIMIT = 10;
const PLAYER_RADIUS = 0.5;
const POSITION_TOLERANCE = 3; // generous, since there's no client prediction yet

type Vec3 = { x: number; y: number; z: number };
export type RoomEventEmitter = (event: string, payload: unknown) => void;

export class GameRoom {
  id: string;
  players: Map<string, PlayerState> = new Map();
  private emit: RoomEventEmitter;
  private matchOver = false;
  private tickInterval: NodeJS.Timeout;

  constructor(id: string, emit: RoomEventEmitter) {
    this.id = id;
    this.emit = emit;
    this.tickInterval = setInterval(() => this.broadcastState(), 50);
  }

    addPlayer(
    userId: string,
    socketId: string,
    username: string,
    spawnIndex: number,
    inventoryInput?: { key: string; damage: number; fireRate: number; magazineSize: number }[]
  ) {
    const spawns = [
      { x: 0, z: 10, yaw: Math.PI },
      { x: 0, z: -10, yaw: 0 },
    ];
    const spawn = spawns[spawnIndex % spawns.length];

    const source = inventoryInput && inventoryInput.length === 3 ? inventoryInput : DEFAULT_INVENTORY_INPUT;
    const inventory = source.map((w) => ({
      key: w.key,
      damage: w.damage,
      fireIntervalMs: 60000 / w.fireRate,
      magazineSize: w.magazineSize,
    }));

    this.players.set(userId, {
      id: userId,
      socketId,
      username,
      x: spawn.x,
      y: 1.6,
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
    const bound = 14.4;
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
      const center = { x: target.x, y: target.y, z: target.z };
      const t = raySphereIntersect(origin, dir, center, PLAYER_RADIUS, MAX_RANGE);
      if (t !== null && !rayBlockedByObstacles(origin, dir, t, OBSTACLES)) {
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
    player.ammoPerWeapon[player.currentSlot] = player.inventory[player.currentSlot].magazineSize;
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

      this.emit("player:eliminated", { targetId, byId, byUsername: shooter?.username });

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
    player.x = Math.random() > 0.5 ? 10 : -10;
    player.z = Math.random() > 0.5 ? 10 : -10;
    player.y = 1.6;
    player.health = 100;
    player.currentSlot = 0;
    player.ammoPerWeapon = player.inventory.map((w) => w.magazineSize);
    player.alive = true;
    this.emit("player:respawned", { userId, x: player.x, y: player.y, z: player.z });
  }

    private endMatch(winnerId: string) {
    this.matchOver = true;
    const results = [...this.players.values()].map((p) => ({
      userId: p.id,
      username: p.username,
      kills: p.kills,
      deaths: p.deaths,
      won: p.id === winnerId,
      weapons: p.inventory.map((w, i) => ({ weaponKey: w.key, kills: p.weaponKills[i] })),
    }));
    this.emit("match:end", { winnerId, results });
    clearInterval(this.tickInterval);
  }

  handleDisconnect(userId: string) {
    if (this.matchOver) return;
    const remaining = [...this.players.values()].filter((p) => p.id !== userId);
    if (remaining.length === 1) this.endMatch(remaining[0].id);
  }

    private broadcastState() {
    if (this.matchOver) return;
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
    this.emit("state:update", { players: snapshot });
  }

  destroy() {
    clearInterval(this.tickInterval);
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

function rayBlockedByObstacles(
  origin: { x: number; z: number },
  dir: { x: number; z: number },
  maxDist: number,
  obstacles: { x: number; z: number; halfWidth: number; halfDepth: number }[],
): boolean {
  for (const obs of obstacles) {
    const minX = obs.x - obs.halfWidth;
    const maxX = obs.x + obs.halfWidth;
    const minZ = obs.z - obs.halfDepth;
    const maxZ = obs.z + obs.halfDepth;
    let tmin = 0;
    let tmax = maxDist;

    if (Math.abs(dir.x) < 1e-6) {
      if (origin.x < minX || origin.x > maxX) continue;
    } else {
      let t1 = (minX - origin.x) / dir.x;
      let t2 = (maxX - origin.x) / dir.x;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dir.z) < 1e-6) {
      if (origin.z < minZ || origin.z > maxZ) continue;
    } else {
      let t1 = (minZ - origin.z) / dir.z;
      let t2 = (maxZ - origin.z) / dir.z;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin <= tmax && tmax >= 0) return true;
  }
  return false;
}
