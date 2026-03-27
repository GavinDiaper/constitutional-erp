import { HttpError } from "../utils/errors";
import { BackendAdapter } from "./types";

export class AdapterRegistry {
  constructor(private readonly adapters: BackendAdapter[]) {
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

  resolve(meshPath: string): BackendAdapter {
    const match = this.adapters.find((adapter) => adapter.canHandle(meshPath));
    if (!match) {
      throw new HttpError(404, "adapter_not_found", `No backend adapter can handle path: ${meshPath}`);
    }

    return match;
  }
}
