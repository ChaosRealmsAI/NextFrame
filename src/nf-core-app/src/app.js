// nf-core-app — engine heart. `getStateAt(t, resolved)` is the sole pure-function contract.
// Walking stub: returns an empty state envelope so tracks and runtime can wire against it.

import { deriveState } from "./state.js";

export function getStateAt(t, resolved) {
  return deriveState(t, resolved);
}
