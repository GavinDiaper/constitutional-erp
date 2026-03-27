import { replayToHead } from "./replay";

export function startPollingConsumer(pollIntervalMs: number): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await replayToHead();
    } catch (error) {
      console.error("event-processor polling consumer error", error);
    }
  }, pollIntervalMs);
}