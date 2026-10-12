interface TrackingDebounces {
  [key: string]: NodeJS.Timeout;
}

const trackingDebounces: TrackingDebounces = {};

export const debounceTrack = (
  eventName: string,
  data: Record<string, any> = {},
  delay = 500,
): void => {
  if (trackingDebounces[eventName]) {
    clearTimeout(trackingDebounces[eventName]);
  }

  // Identify user with email
  const email = document?.cookie
    ?.split(';')
    .find((pair) => pair.trim().split('=')[0] === 'demoeng_email')
    ?.split('=')[1];
  if (email) {
    window.umami?.identify({ email });
  }

  trackingDebounces[eventName] = setTimeout(() => {
    window.umami?.track(eventName, { ...data, demoeng_email: email });
    delete trackingDebounces[eventName];
  }, delay);
};
