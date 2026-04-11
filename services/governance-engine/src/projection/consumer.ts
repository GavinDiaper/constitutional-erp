import { replayToHead } from "./replay";

export function startPollingConsumer(pollIntervalMs: number): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await replayToHead();
    } catch (error) {
      console.error("governance-engine polling consumer error", error);
    }
  }, pollIntervalMs);
}
