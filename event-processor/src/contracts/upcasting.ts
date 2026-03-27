import { CanonicalEvent } from "./canonicalEvents";

export interface EventUpcaster {
  canUpcast(eventType: string, fromVersion: number): boolean;
  upcast(event: CanonicalEvent): CanonicalEvent;
}

export function applyUpcasters(event: CanonicalEvent, upcasters: EventUpcaster[] = []): CanonicalEvent {
  let current = event;

  while (true) {
    const match = upcasters.find((upcaster) => upcaster.canUpcast(current.eventType, current.eventVersion));
    if (!match) {
      return current;
    }

    current = match.upcast(current);
  }
}