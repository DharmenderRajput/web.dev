import {
  onCLS,
  onFCP,
  onFID,
  onINP,
  onLCP,
  onTTFB,
} from 'web-vitals/attribution';
import {dimensions} from 'webdev_analytics';
import {store} from './store';

// Events missing from DevSite include:
//   * "devsite-analytics-observation", generated by the Metric class for page load timing
//   * "devsite-analytics-error", wired up to the onerror handler
//   * "devsite-analytics-set-dimension", for user response to custom questions
//   * "devsite-analytics-scope", which constructs complex click events (was used for header)
//
// Note that many parts of our code are annotated with an "gc-analytics-event" attribute, but this
// is actually ignored in DevSite v2. Instead, any links that have `data-category` automatically
// have clicks logged (see below).

function getAnalyticsDataFromElement(elem, defaultAction = 'click') {
  const category = elem.dataset['category'] || undefined;
  const action = elem.dataset['action'] || defaultAction;
  const label = elem.dataset['label'] || undefined;
  const value = Number(elem.dataset['value']) || undefined; // must be number, or is ignored
  return {
    category,
    action,
    label,
    value,
  };
}

/**
 * @param {{ category?: string, action?: string, label?: string, value?: number }} param
 */
export function trackEvent({category, action, label, value}) {
  ga('send', 'event', {
    eventCategory: category,
    eventAction: action,
    eventLabel: label,
    eventValue: value,
  });
}

/**
 * Track an error via Analytics with optional context message and fatal notice.
 *
 * @param {Error} error to log
 * @param {string=} message context to provide around error message
 * @param {boolean=} fatal whether this is fatal (as per Analytics' logging)
 */
export function trackError(error, message = '', fatal = false) {
  const exDescription = message
    ? `${message} (${error.message})`
    : error.message;
  ga('send', 'exception', {
    exDescription,
    exFatal: fatal,
  });
}

/**
 * See: https://github.com/GoogleChrome/web-vitals#using-analyticsjs
 * @param {Object} metric
 */
function sendToGoogleAnalytics({name, delta, id, attribution, navigationType}) {
  let webVitalInfo = '(not set)';

  switch (name) {
    case 'CLS':
      webVitalInfo = attribution.largestShiftTarget;
      break;
    case 'FID':
    case 'INP':
      webVitalInfo = attribution.eventTarget;
      break;
    case 'LCP':
      webVitalInfo = attribution.element;
      break;
  }
  // Assumes the global `ga()` function exists, see:
  // https://developers.google.com/analytics/devguides/collection/analyticsjs
  ga('send', 'event', {
    eventCategory: 'Web Vitals',
    eventAction: name,
    // Google Analytics metrics must be integers, so the value is rounded.
    // For CLS the value is first multiplied by 1000 for greater precision
    // (note: increase the multiplier for greater precision if needed).
    eventValue: Math.round(name === 'CLS' ? delta * 1000 : delta),
    // The `id` value will be unique to the current page load. When sending
    // multiple values from the same page (e.g. for CLS), Google Analytics can
    // compute a total by grouping on this ID (note: requires `eventLabel` to
    // be a dimension in your report).
    eventLabel: id,
    // Use a non-interaction event to avoid affecting bounce rate.
    nonInteraction: true,

    // See: https://web.dev/debug-performance-in-the-field/
    [dimensions.WEB_VITALS_DEBUG]: webVitalInfo,
    [dimensions.NAVIGATION_TYPE]: navigationType,
  });
}

/**
 * Configure tracking events for any clicks on a link (`<a href="...">`)
 * or another trackable element (class="gc-analytics-event"), searching
 * for (requiring at least `data-category`, but also allowing
 * `data-action`, `data-label` and `data-value`.
 */
document.addEventListener(
  'click',
  /**
   * @param {WMouseEvent} e
   */
  (e) => {
    const clickableEl = e.target.closest('a[href], .gc-analytics-event');
    if (!clickableEl) {
      return;
    }

    const data = getAnalyticsDataFromElement(clickableEl);
    if (!data.category) {
      return; // category is required
    }

    trackEvent(data);
  },
);

// Update Analytics dimension if signed-in state changes. This doesn't cause a
// new pageview implicitly but annotates all further events.
// We log pageviews only in bootstrap.js (on entry, for all browsers) and in
// loader.js (for dynamic SPA page loads, part of our core bundle).
store.subscribe(({isSignedIn}) => {
  // nb. Analytics requires dimension values to be strings.
  ga('set', dimensions.SIGNED_IN, isSignedIn ? '1' : '0');
});

/**
 * Add a listener to detect back/forward cache restores and track them
 * as pageviews with the "bfcache" navigation type set (in case we need
 * to distinguish them from regular pageviews).
 * https://web.dev/bfcache/#how-bfcache-affects-analytics-and-performance-measurement
 */
window.addEventListener(
  'pageshow',
  /**
   * @param {PageTransitionEvent} e
   */
  (e) => {
    if (e.persisted) {
      ga('set', dimensions.NAVIGATION_TYPE, 'back-forward-cache');
      ga('send', 'pageview');
    }
  },
);

onCLS(sendToGoogleAnalytics);
onFCP(sendToGoogleAnalytics);
onFID(sendToGoogleAnalytics);
onINP(sendToGoogleAnalytics);
onLCP(sendToGoogleAnalytics);
onTTFB(sendToGoogleAnalytics);
