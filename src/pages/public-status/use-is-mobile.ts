import { onMounted, onUnmounted, ref } from 'vue';

import { PUBLIC_MOBILE_MEDIA_QUERY } from '@/constants/status';

export function useIsMobile() {
  const isMobile = ref(typeof window !== 'undefined' && window.matchMedia(PUBLIC_MOBILE_MEDIA_QUERY).matches);

  let media: MediaQueryList | null = null;

  const sync = () => {
    isMobile.value = Boolean(media?.matches);
  };

  onMounted(() => {
    media = window.matchMedia(PUBLIC_MOBILE_MEDIA_QUERY);
    sync();
    media.addEventListener('change', sync);
  });

  onUnmounted(() => {
    media?.removeEventListener('change', sync);
    media = null;
  });

  return isMobile;
}
