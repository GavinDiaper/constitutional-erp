import { AggregateState, CanonicalDomain } from "../../contracts/canonicalTypes";
import { fetchAggregateEvents } from "../../clients/ledgerClient";
import { replayEvents } from "../reducers/registry";
import { isKnownAggregateType } from "../transitions/registry";
import { HttpError } from "../../utils/errors";

/**
 * Rebuilds canonical aggregate state by fetching the event stream from the
 * Event Processor and replaying events through the domain reducers.
 *
 * Throws HttpError 404 when no events are found (aggregate does not exist).
 * Throws HttpError 404 when the domain/aggregateType combination is unknown.
 */
export async function rebuildAggregate(
  domain: CanonicalDomain,
  aggregateType: string,
  aggregateId: string
): Promise<AggregateState> {
  if (!isKnownAggregateType(domain, aggregateType)) {
    throw new HttpError(
      404,
      "unknown_aggregate_type",
      `Unknown aggregate type '${aggregateType}' for domain '${domain}'`
    );
  }

  const events = await fetchAggregateEvents(domain, aggregateType, aggregateId);

  if (events.length === 0) {
    throw new HttpError(
      404,
      "aggregate_not_found",
      `Aggregate ${domain}/${aggregateType}/${aggregateId} not found`
    );
  }

  const state = replayEvents(domain, events);

  if (!state) {
    throw new HttpError(
      500,
      "replay_failed",
      `Failed to reconstruct state for ${domain}/${aggregateType}/${aggregateId}`
    );
  }

  return state;
}
