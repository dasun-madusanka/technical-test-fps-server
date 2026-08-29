interface QueuedPlayer {
  userId: string;
  username: string;
  socketId: string;
  inventory?: { key: string; damage: number; fireRate: number; magazineSize: number }[];
}

export class Matchmaker {
  private queue: QueuedPlayer[] = [];

  enqueue(player: QueuedPlayer) {
    if (this.queue.find((p) => p.userId === player.userId)) return;
    this.queue.push(player);
  }

  dequeue(userId: string) {
    this.queue = this.queue.filter((p) => p.userId !== userId);
  }

  tryMatch(): [QueuedPlayer, QueuedPlayer] | null {
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