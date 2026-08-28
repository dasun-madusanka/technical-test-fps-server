export interface PlayerState {
  id: string;
  socketId: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  ammo: number;
  kills: number;
  deaths: number;
  alive: boolean;
  lastShotTime: number;
}

export interface Obstacle {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
}