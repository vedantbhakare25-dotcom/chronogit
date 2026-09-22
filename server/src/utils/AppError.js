/**
 * An error whose message and statusCode are safe to send straight to the
 * client (unlike a raw exception, which might leak internals). Route
 * handlers throw this for anything the caller did wrong (400/404/409);
 * the error middleware in app.js turns it into a JSON response.
 */
export class AppError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, message, details);
export const notFound = (message) => new AppError(404, message);