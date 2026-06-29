import ApiError from "./api.error";

/**
 * Represents an error for database connection failures.
 *
 * Thrown when the application is unable to connect to the database during health check on app start.
 *
 * @extends {ApiError} - The base API error class.
 */
export default class DatabaseConnectionError extends ApiError {
  /**
   * Creates an instance for DatabaseConnectionError.
   *
   * @param {number} httpStatusCode - The HTTP status code of the error.
   * @param {string} message - The error message.
   */
  constructor(httpStatusCode: number, message: string) {
    super(httpStatusCode, message);
  }
}
