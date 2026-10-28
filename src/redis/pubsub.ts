import { getSubscriber } from "../app/config/redis.js";
import { logger } from "../utils/logger.js";

type MessageHandler = (channel: string, message: string) => void;

class PubSub {
  private handlers: MessageHandler[] = [];
  private subscribed = false;

  addHandler(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  async subscribe(channels: readonly string[]): Promise<void> {
    if (this.subscribed) return;

    const subscriber = getSubscriber();
    await subscriber.subscribe(...channels);
    this.subscribed = true;

    subscriber.on("message", (channel: string, message: string) => {
      for (const handler of this.handlers) {
        try {
          handler(channel, message);
        } catch (err) {
          logger.error({ err, channel }, "PubSub message handler threw");
        }
      }
    });

    logger.info({ channels }, "PubSub subscribed to channels");
  }
}

let _pubsub: PubSub | null = null;

export function getPubSub(): PubSub {
  if (!_pubsub) {
    _pubsub = new PubSub();
  }
  return _pubsub;
}

