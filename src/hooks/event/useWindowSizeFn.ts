import { onMounted, onUnmounted } from 'vue';

interface WindowSizeOptions {
  immediate?: boolean;
}

interface Fn<T = unknown, R = T> {
  (...arg: T[]): R;
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function useWindowSizeFn<T>(fn: Fn<T>, options?: WindowSizeOptions, wait = 150) {
  const handleSize = debounce(fn as (...args: unknown[]) => void, wait);

  const start = () => {
    if (options && options.immediate) {
      fn();
    }
    window.addEventListener('resize', handleSize);
  };

  const stop = () => {
    window.removeEventListener('resize', handleSize);
  };

  onMounted(() => {
    start();
  });

  onUnmounted(() => {
    stop();
  });
  return [start, stop];
}
