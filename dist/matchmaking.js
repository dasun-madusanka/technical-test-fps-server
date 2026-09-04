"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Matchmaker = void 0;
class Matchmaker {
    constructor() {
        this.queue = [];
    }
    enqueue(player) {
        if (this.queue.find((p) => p.userId === player.userId))
            return;
        this.queue.push(player);
    }
    dequeue(userId) {
        this.queue = this.queue.filter((p) => p.userId !== userId);
    }
    tryMatch() {
        if (this.queue.length >= 2) {
            const [a, b] = this.queue.splice(0, 2);
            return [a, b];
        }
        return null;
    }
    queueLength() {
        return this.queue.length;
    }
}
exports.Matchmaker = Matchmaker;
