// Error with an HTTP status and a stable machine-readable code.
// Its message (and optional details, e.g. per-field validation errors) is
// always safe to show to clients.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}
