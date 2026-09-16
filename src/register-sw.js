async function registerServiceWorker() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    });
    if (navigator.serviceWorker.controller) return;

    // Let the first install download the models once, then load them from the
    // cache. If installation fails or stalls, normal network loading still works.
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker || worker.state === 'activated' || worker.state === 'redundant') return;
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      };
      const onStateChange = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') finish();
      };
      const timeout = setTimeout(finish, 60_000);
      worker.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  } catch (error) {
    console.warn('Offline caching is unavailable; loading from the network.', error);
  }
}

export const serviceWorkerReady = registerServiceWorker();
