import { HttpError } from "../utils/errors";
import { BackendAdapter } from "./types";

export class AdapterRegistry {
  constructor(
    private readonly adapters: BackendAdapter[],
    private readonly defaultAdapterId: string
  ) {
    if (!adapters.length) {
      throw new Error("At least one backend adapter must be registered");
    }
  }

  list(): BackendAdapter[] {
    return [...this.adapters];
  }

  getById(adapterId: string): BackendAdapter {
    const match = this.adapters.find((adapter) => adapter.id === adapterId);
    if (!match) {
      throw new HttpError(500, "adapter_not_registered", `Backend adapter not registered: ${adapterId}`);
    }

    return match;
  }

  defaultAdapter(): BackendAdapter {
    return this.getById(this.defaultAdapterId);
  }

  resolve(meshPath: string, adapterId?: string): BackendAdapter {
    if (adapterId) {
      const adapter = this.getById(adapterId);
      if (!adapter.canHandle(meshPath)) {
        throw new HttpError(400, "adapter_cannot_handle_path", `Adapter ${adapterId} cannot handle path: ${meshPath}`);
      }

      return adapter;
    }

    const matches = this.adapters.filter((adapter) => adapter.canHandle(meshPath));
    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      const fallback = this.defaultAdapter();
      if (fallback.canHandle(meshPath)) {
        return fallback;
      }

      throw new HttpError(500, "adapter_resolution_ambiguous", `Multiple adapters can handle path: ${meshPath}`);
    }

    const fallback = this.defaultAdapter();
    if (fallback.canHandle(meshPath)) {
      return fallback;
    }

    throw new HttpError(404, "adapter_not_found", `No backend adapter can handle path: ${meshPath}`);
  }
}
