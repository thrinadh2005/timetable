function syncPath(path: string, replace = false) {
  if (typeof window === 'undefined' || !path) return;
  const normalized = path === '/login' ? '/' : path === '/app' ? '/overview' : path;
  try {
    if (replace) {
      window.history.replaceState(null, '', normalized);
    } else {
      window.history.pushState(null, '', normalized);
    }
  } catch {
    // ignore history errors
  }
}

export function useRouter() {
  return {
    push: (path: string) => {
      syncPath(path, false);
      // In SPA mode, state transitions happen reactively via gmritdu:auth-change or state
      window.dispatchEvent(new Event('gmritdu:auth-change'));
    },
    replace: (path: string) => {
      syncPath(path, true);
      window.dispatchEvent(new Event('gmritdu:auth-change'));
    },
    refresh: () => {
      window.dispatchEvent(new Event('gmritdu:data-change'));
    },
    back: () => window.history.back(),
    forward: () => window.history.forward()
  };
}

export function usePathname() {
  return '/app';
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

