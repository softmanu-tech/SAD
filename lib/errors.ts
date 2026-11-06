/** An error whose message is safe to show the user, with the HTTP status to answer with. */
export class HttpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
