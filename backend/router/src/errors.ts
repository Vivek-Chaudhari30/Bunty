/** Thrown when a real adapter or the service needs a setting that is not in the environment. */
export class NotConfiguredError extends Error {
  constructor(readonly variable: string, what: string) {
    super(`${what} is not configured: set ${variable} in .env (see .env.example)`);
    this.name = "NotConfiguredError";
  }
}
