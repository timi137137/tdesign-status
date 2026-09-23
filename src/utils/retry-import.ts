export const retryImport = <T>(loader: () => Promise<T>, retries = 3, delayMs = 700): (() => Promise<T>) => {
  return async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs * (attempt + 1));
        });
      }
    }
    throw lastError;
  };
};
