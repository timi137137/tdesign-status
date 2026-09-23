import { onUnmounted, type Ref, watch } from 'vue';

const SCROLL_LOCK_CLASS = 'public-status-drawer-lock';
const OVERLAY_BODY_SELECTOR = '.public-event-drawer .t-drawer__body, .public-event-dialog .t-dialog__body';

const isInsideOverlayBody = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(OVERLAY_BODY_SELECTOR));
};

const onLockedWheel = (e: WheelEvent) => {
  const body = e.target instanceof Element ? e.target.closest(OVERLAY_BODY_SELECTOR) : null;
  if (body instanceof HTMLElement) {
    const atTop = body.scrollTop <= 0 && e.deltaY < 0;
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atBottom || body.scrollHeight <= body.clientHeight) e.preventDefault();
    return;
  }
  e.preventDefault();
};

const onLockedTouchMove = (e: TouchEvent) => {
  if (isInsideOverlayBody(e.target)) return;
  e.preventDefault();
};

export function usePublicDrawerScrollLock(visible: Ref<boolean>) {
  let unlock: (() => void) | null = null;

  const lock = () => {
    if (unlock) return;
    const wrapper = document.querySelector('.tdesign-wrapper') as HTMLElement | null;
    const wrapperTop = wrapper?.scrollTop ?? 0;
    wrapper?.classList.add(SCROLL_LOCK_CLASS);
    document.documentElement.classList.add(SCROLL_LOCK_CLASS);
    document.body.classList.add(SCROLL_LOCK_CLASS);
    if (wrapper) wrapper.scrollTop = wrapperTop;
    document.addEventListener('wheel', onLockedWheel, { passive: false, capture: true });
    document.addEventListener('touchmove', onLockedTouchMove, { passive: false, capture: true });
    unlock = () => {
      document.removeEventListener('wheel', onLockedWheel, true);
      document.removeEventListener('touchmove', onLockedTouchMove, true);
      document.documentElement.classList.remove(SCROLL_LOCK_CLASS);
      document.body.classList.remove(SCROLL_LOCK_CLASS);
      wrapper?.classList.remove(SCROLL_LOCK_CLASS);
      if (wrapper) wrapper.scrollTop = wrapperTop;
      unlock = null;
    };
  };

  watch(visible, (open) => {
    if (open) lock();
    else unlock?.();
  });

  onUnmounted(() => {
    unlock?.();
  });
}
