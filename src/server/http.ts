export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Expected application/json request body.");
  }
  return (await request.json()) as T;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error && error.message.includes("not found")) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }

  if (error instanceof Error) {
    console.error("[API error]", error);
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  // Non-Error thrown value — log it so the cause is visible in the terminal
  const message = error !== null && error !== undefined ? String(error) : "Unexpected server error.";
  console.error("[API unexpected error]", error);
  return jsonResponse({ error: message }, { status: 500 });
}
