import { setGlobalOptions } from "firebase-functions/v2";

// Configure default global options for 2nd Gen Cloud Functions
setGlobalOptions({
  region: "us-central1", // Default deployment region, aligned with project settings
  maxInstances: 10,
  timeoutSeconds: 60,
});

/**
 * ClassDrop Cloud Functions Foundation
 * Business logic (download gateway, deletion handler) will be implemented in subsequent phases.
 */
