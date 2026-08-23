export type JsonResponse<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 120_000): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternalSignal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    let data = {} as T;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = {} as T;
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Запрос занял слишком много времени. Попробуйте еще раз.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
