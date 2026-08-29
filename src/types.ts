export interface WeaponStats {
  key: string;
  damage: number;
  fireIntervalMs: number;
  magazineSize: number;
}

export interface PlayerState {
  id: string;
  socketId: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  kills: number;
  deaths: number;
  alive: boolean;
  lastShotTime: number;
  inventory: WeaponStats[]; // [primary, secondary, melee]
  ammoPerWeapon: number[];
  currentSlot: number;
  weaponKills: number[];
}

export interface Obstacle {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
}