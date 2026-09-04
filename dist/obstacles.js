"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBSTACLES = exports.ARENA_COLLIDERS = exports.ARENA_SPAWN_POINTS = exports.EYE_HEIGHT = exports.PLAYER_RADIUS = exports.BOUNDARY_LIMIT = exports.ARENA_HALF_SIZE = void 0;
exports.isRayBlockedByColliders = isRayBlockedByColliders;
exports.isSpawnPositionSafe = isSpawnPositionSafe;
exports.getSafeSpawnPoint = getSafeSpawnPoint;
exports.ARENA_HALF_SIZE = 15;
exports.BOUNDARY_LIMIT = 14.4;
exports.PLAYER_RADIUS = 0.4;
exports.EYE_HEIGHT = 1.6;
// Tactical Ground Spawn Points matching client
exports.ARENA_SPAWN_POINTS = [
    { x: 0, y: exports.EYE_HEIGHT, z: 11.5, yaw: Math.PI }, // North Main Street
    { x: 0, y: exports.EYE_HEIGHT, z: -11.5, yaw: 0 }, // South Main Street
    { x: 11.5, y: exports.EYE_HEIGHT, z: 0, yaw: -Math.PI / 2 }, // East Crossway
    { x: -11.5, y: exports.EYE_HEIGHT, z: 0, yaw: Math.PI / 2 }, // West Crossway
    { x: 10.5, y: exports.EYE_HEIGHT, z: 9.5, yaw: -Math.PI * 0.75 }, // North-East Plaza
    { x: -10.5, y: exports.EYE_HEIGHT, z: -9.5, yaw: Math.PI * 0.25 }, // South-West Plaza
    { x: -5.0, y: exports.EYE_HEIGHT, z: 5.0, yaw: Math.PI * 0.5 }, // West Courtyard
    { x: 5.0, y: exports.EYE_HEIGHT, z: -5.0, yaw: -Math.PI * 0.5 }, // East Courtyard
];
// Tactical Solid Colliders matching client 1:1
exports.ARENA_COLLIDERS = [
    // Landmark
    { type: "circle", x: 10, z: -10, radius: 1.45, height: 9.4 },
    { type: "box", x: -3, z: 13.8, halfWidth: 2.8, halfDepth: 0.5, rotationY: 0, height: 5.0 },
    // Vehicles
    { type: "box", x: -3.5, z: -0.5, halfWidth: 1.35, halfDepth: 2.6, rotationY: 0.25, height: 2.9 },
    { type: "box", x: 4.5, z: 3.5, halfWidth: 1.25, halfDepth: 2.65, rotationY: -0.4, height: 2.0 },
    { type: "box", x: 6.0, z: -7.5, halfWidth: 1.3, halfDepth: 2.7, rotationY: 1.1, height: 1.8 },
    { type: "box", x: -6.5, z: 7.5, halfWidth: 1.2, halfDepth: 2.55, rotationY: 2.3, height: 1.9 },
    // Fortified Shipping Containers
    { type: "box", x: -11.5, z: 11.0, halfWidth: 1.3, halfDepth: 2.85, rotationY: Math.PI / 2, height: 2.6 },
    { type: "box", x: -11.5, z: -11.0, halfWidth: 2.85, halfDepth: 1.3, rotationY: 0, height: 2.6 },
    { type: "box", x: 11.5, z: 11.0, halfWidth: 2.85, halfDepth: 1.3, rotationY: 0, height: 2.6 },
    { type: "box", x: 12.0, z: -4.5, halfWidth: 1.3, halfDepth: 2.85, rotationY: Math.PI / 2, height: 2.6 },
    // Concrete & Traffic Barriers
    { type: "box", x: 0, z: -4.5, halfWidth: 0.85, halfDepth: 0.45, rotationY: 0, height: 1.15 },
    { type: "box", x: -1.6, z: -4.5, halfWidth: 0.85, halfDepth: 0.45, rotationY: 0.1, height: 1.15 },
    { type: "box", x: 2.5, z: -1.0, halfWidth: 0.8, halfDepth: 0.4, rotationY: 1.5, height: 0.85 },
    { type: "box", x: 0, z: 4.5, halfWidth: 0.85, halfDepth: 0.45, rotationY: 0, height: 1.15 },
    { type: "box", x: -1.5, z: 4.5, halfWidth: 0.75, halfDepth: 0.35, rotationY: -0.2, height: 0.9 },
    { type: "box", x: -4.5, z: -3.5, halfWidth: 0.75, halfDepth: 0.35, rotationY: 1.2, height: 0.9 },
    { type: "box", x: 4.5, z: -2.0, halfWidth: 0.85, halfDepth: 0.45, rotationY: -1.0, height: 1.15 },
    // Industrial Wood Crates
    { type: "box", x: -7.5, z: -7.5, halfWidth: 0.7, halfDepth: 0.7, rotationY: 0.3, height: 1.3 },
    { type: "box", x: -6.5, z: -8.0, halfWidth: 0.55, halfDepth: 0.55, rotationY: 0, height: 1.1 },
    { type: "box", x: 7.5, z: 6.5, halfWidth: 0.7, halfDepth: 0.7, rotationY: -0.4, height: 1.3 },
    { type: "box", x: -10.0, z: 3.5, halfWidth: 0.55, halfDepth: 0.55, rotationY: 0.5, height: 1.1 },
    { type: "box", x: 2.0, z: 9.0, halfWidth: 0.55, halfDepth: 0.55, rotationY: 0.1, height: 1.1 },
    { type: "box", x: -2.5, z: -10.5, halfWidth: 0.7, halfDepth: 0.7, rotationY: -0.2, height: 1.3 },
    // Metal Barrels
    { type: "circle", x: -6.0, z: -6.5, radius: 0.4, height: 1.1 },
    { type: "circle", x: -6.7, z: -6.2, radius: 0.4, height: 1.1 },
    { type: "circle", x: 8.5, z: -2.5, radius: 0.4, height: 1.1 },
    { type: "circle", x: 8.0, z: -3.2, radius: 0.4, height: 1.1 },
    { type: "circle", x: -3.0, z: 9.5, radius: 0.4, height: 1.1 },
    { type: "circle", x: 9.0, z: 5.5, radius: 0.4, height: 1.1 },
    // Dumpsters
    { type: "box", x: -13.0, z: 5.0, halfWidth: 1.3, halfDepth: 0.9, rotationY: Math.PI / 2, height: 1.4 },
    { type: "box", x: 13.0, z: -8.5, halfWidth: 1.3, halfDepth: 0.9, rotationY: -Math.PI / 2, height: 1.4 },
    // Pipes & Couch
    { type: "box", x: -8.5, z: -8.5, halfWidth: 0.45, halfDepth: 1.7, rotationY: 0.4, height: 0.7 },
    { type: "box", x: 8.5, z: 8.0, halfWidth: 1.55, halfDepth: 0.65, rotationY: -1.2, height: 1.25 },
    // Wheel Stacks
    { type: "circle", x: 5.5, z: 7.2, radius: 0.4, height: 0.7 },
    { type: "circle", x: -5.0, z: -7.0, radius: 0.4, height: 0.7 },
    // Street Poles & Hydrants
    { type: "circle", x: 3.8, z: 3.8, radius: 0.28, height: 4.7 },
    { type: "circle", x: -3.8, z: -3.8, radius: 0.28, height: 4.7 },
    { type: "circle", x: 4.0, z: -4.0, radius: 0.25, height: 6.6 },
    { type: "circle", x: -4.0, z: 4.0, radius: 0.25, height: 6.6 },
    { type: "circle", x: 10.0, z: 3.0, radius: 0.25, height: 6.6 },
    { type: "circle", x: -10.0, z: -3.0, radius: 0.25, height: 6.6 },
    { type: "circle", x: 3.6, z: -6.5, radius: 0.25, height: 0.8 },
    { type: "circle", x: -3.6, z: 6.5, radius: 0.25, height: 0.8 },
];
exports.OBSTACLES = exports.ARENA_COLLIDERS;
// -------------------------------------------------------------
// Raycast 2D Obstacle Block Test
// -------------------------------------------------------------
function isRayBlockedByColliders(origin, dir, maxDist, colliders = exports.ARENA_COLLIDERS) {
    const oy = origin.y ?? 1.6;
    const dy = dir.y ?? 0;
    const horizLen = Math.hypot(dir.x, dir.z);
    if (horizLen < 1e-6)
        return false;
    const dx = dir.x / horizLen;
    const dz = dir.z / horizLen;
    const maxDist2D = maxDist * horizLen;
    for (const c of colliders) {
        let tHit2D = null;
        if (c.type === "circle") {
            const ocX = origin.x - c.x;
            const ocZ = origin.z - c.z;
            const b = ocX * dx + ocZ * dz;
            const disc = b * b - (ocX * ocX + ocZ * ocZ - c.radius * c.radius);
            if (disc >= 0) {
                const sqrtDisc = Math.sqrt(disc);
                const t1 = -b - sqrtDisc;
                const t2 = -b + sqrtDisc;
                if (t1 >= 0)
                    tHit2D = t1;
                else if (t2 >= 0)
                    tHit2D = t2;
            }
        }
        else if (c.type === "box") {
            const cosA = Math.cos(-c.rotationY);
            const sinA = Math.sin(-c.rotationY);
            const localOx = cosA * (origin.x - c.x) - sinA * (origin.z - c.z);
            const localOz = sinA * (origin.x - c.x) + cosA * (origin.z - c.z);
            const localDx = cosA * dx - sinA * dz;
            const localDz = sinA * dx + cosA * dz;
            let tmin = 0;
            let tmax = maxDist2D;
            let missed = false;
            if (Math.abs(localDx) < 1e-6) {
                if (localOx < -c.halfWidth || localOx > c.halfWidth)
                    missed = true;
            }
            else {
                let t1 = (-c.halfWidth - localOx) / localDx;
                let t2 = (c.halfWidth - localOx) / localDx;
                if (t1 > t2)
                    [t1, t2] = [t2, t1];
                tmin = Math.max(tmin, t1);
                tmax = Math.min(tmax, t2);
                if (tmin > tmax)
                    missed = true;
            }
            if (!missed) {
                if (Math.abs(localDz) < 1e-6) {
                    if (localOz < -c.halfDepth || localOz > c.halfDepth)
                        missed = true;
                }
                else {
                    let t1 = (-c.halfDepth - localOz) / localDz;
                    let t2 = (c.halfDepth - localOz) / localDz;
                    if (t1 > t2)
                        [t1, t2] = [t2, t1];
                    tmin = Math.max(tmin, t1);
                    tmax = Math.min(tmax, t2);
                    if (tmin > tmax)
                        missed = true;
                }
            }
            if (!missed && tmin <= tmax && tmax >= 0) {
                tHit2D = tmin > 0 ? tmin : tmax;
            }
        }
        if (tHit2D !== null) {
            const t3D = tHit2D / horizLen;
            // Exclude shooter self-hit near gun muzzle (t3D > 0.4) and verify within maxDist
            if (t3D > 0.4 && t3D < maxDist - 0.05) {
                const bulletY = oy + t3D * dy;
                const obstacleHeight = c.height ?? 3.0;
                if (bulletY >= 0 && bulletY <= obstacleHeight) {
                    return true;
                }
            }
        }
    }
    return false;
}
// -------------------------------------------------------------
// Safe Spawning Helpers
// -------------------------------------------------------------
function isSpawnPositionSafe(x, z, minClearance = 1.0) {
    for (const c of exports.ARENA_COLLIDERS) {
        if (c.type === "circle") {
            const dist = Math.hypot(x - c.x, z - c.z);
            if (dist < c.radius + minClearance)
                return false;
        }
        else if (c.type === "box") {
            const cosA = Math.cos(-c.rotationY);
            const sinA = Math.sin(-c.rotationY);
            const lx = Math.abs(cosA * (x - c.x) - sinA * (z - c.z));
            const lz = Math.abs(sinA * (x - c.x) + cosA * (z - c.z));
            if (lx < c.halfWidth + minClearance && lz < c.halfDepth + minClearance) {
                return false;
            }
        }
    }
    return Math.abs(x) <= exports.BOUNDARY_LIMIT - minClearance && Math.abs(z) <= exports.BOUNDARY_LIMIT - minClearance;
}
function getSafeSpawnPoint(avoidPos) {
    const candidates = [...exports.ARENA_SPAWN_POINTS];
    if (avoidPos) {
        candidates.sort((a, b) => {
            const distA = Math.hypot(a.x - avoidPos.x, a.z - avoidPos.z);
            const distB = Math.hypot(b.x - avoidPos.x, b.z - avoidPos.z);
            return distB - distA;
        });
    }
    for (const p of candidates) {
        if (isSpawnPositionSafe(p.x, p.z, 1.2)) {
            return p;
        }
    }
    return candidates[0];
}
