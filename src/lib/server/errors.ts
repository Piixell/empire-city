export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (msg = "Risorsa non trovata.") => new ApiError(404, "NOT_FOUND", msg);
export const forbidden = (msg = "Operazione non consentita.") => new ApiError(403, "FORBIDDEN", msg);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);
export const badRequest = (msg: string, code = "BAD_REQUEST") => new ApiError(400, code, msg);
