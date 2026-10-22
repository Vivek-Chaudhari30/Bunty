// Delegated tasks with owner gates (Phase 7). Phase 6 ships pairing and notes only.
import { A2AService, type ServiceDeps } from "./service.ts";

export interface DelegationDeps extends ServiceDeps {
  /** Plugin data dir, for received files. */
  dataDir?: string;
}

export class DelegationService extends A2AService {
  constructor(override readonly deps: DelegationDeps) {
    super(deps);
  }
}
