/** An error with an HTTP status; handleApi in api.ts turns it into a JSON error response. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
