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
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  return jsonResponse({ error: "Unexpected server error." }, { status: 500 });
}
