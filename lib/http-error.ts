// An error a route answers with its own message and status (handleRouteError
// in lib/http.ts). It imports nothing, so modules the unit tests load can
// throw it.
export class HttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}
