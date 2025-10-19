# AnalyticsTracker

A **production-ready, single-file TypeScript analytics tracker** for modern web applications. Designed to be lightweight, consent-aware, and capable of capturing page views, custom events, e-commerce events, scroll depth, heatmaps, resource errors, and more.

---

## Features

- **Page views** and **SPA navigation tracking**.
- **Custom events**, goals, and e-commerce events.
- **Heatmaps** and **scroll depth tracking**.
- **Resource error** and **JavaScript error** monitoring.
- **Performance and engagement metrics** collection.
- **Consent-aware** tracking; only collects sensitive data after user consent.
- **Batching & flushing** with configurable interval and size.
- **Retries with exponential backoff** and `sendBeacon` fallback.
- **Custom dimensions** support for enriched analytics.
- Fully typed for **TypeScript**.

---

## Installation

```bash
# Using npm
npm install analytics-tracker

# Using yarn
yarn add analytics-tracker
```

Or include via `<script>` in a browser:

```html
<script src="analytics-tracker.js"></script>
```

---

## Usage

### Initialize Tracker

```ts
const tracker = new AnalyticsTracker({
  siteId: "YOUR_SITE_ID",
  collectionEndpoint: "https://your-endpoint.com/collect",
  debug: true,
});
```

### Grant Consent

```ts
tracker.grantConsent();
```

### Track Page Views

```ts
tracker.trackPage(); // Automatically tracks current page
tracker.trackPage("/about", "About Page"); // Optional URL and title
```

### Track Custom Events

```ts
tracker.trackEvent("Category", "Action", "Label", 42, { extraData: true });
```

### Track E-commerce Events

```ts
tracker.trackEcommerce("purchase", { productId: 123, price: 49.99 });
```

### Track Goals

```ts
tracker.trackGoal("signup", 0, { plan: "premium" });
```

### Set Custom Dimensions

```ts
tracker.setCustomDimension("userType", "premium");
tracker.setCustomDimension("loggedIn", true);
```

### Force Flush

```ts
tracker.flushNow();
```

---

## Configuration Options

| Option                   | Type     | Default                           | Description                        |
| ------------------------ | -------- | --------------------------------- | ---------------------------------- |
| `siteId`                 | string   | `""`                              | Your unique site identifier        |
| `collectionEndpoint`     | string   | `process.env.COLLECTION_ENDPOINT` | Endpoint to send analytics data    |
| `batchSize`              | number   | `15`                              | Number of events before auto-flush |
| `flushInterval`          | number   | `5000`                            | Interval (ms) for auto-flush       |
| `debug`                  | boolean  | `false`                           | Enable console debug logs          |
| `trackOutlinks`          | boolean  | `true`                            | Track outbound links               |
| `trackDownloads`         | boolean  | `true`                            | Track file downloads               |
| `scrollDepthPercentages` | number[] | `[25,50,75,100]`                  | Scroll depth percentages to track  |
| `maxHeatmapPoints`       | number   | `500`                             | Maximum buffered heatmap points    |
| `retryBackoffBaseMs`     | number   | `500`                             | Base delay for retry attempts      |
| `retryMaxAttempts`       | number   | `4`                               | Maximum number of retry attempts   |

---

## Event Types

- `page_view` — Page view events
- `event` — Custom events
- `goal` — Goal completion events
- `ecommerce` — E-commerce actions
- `visibility` — Page visibility changes
- `focus` / `blur` — Window focus changes
- `engagement` — User engagement metrics
- `performance` — Page performance metrics
- `heatmap` — Mouse movement points for heatmaps
- `resource_error` — Script, image, or link loading errors
- `js_error` — JavaScript runtime errors

---

## Example: Full Consent Flow

```ts
const tracker = new AnalyticsTracker({ siteId: "123", debug: true });

// Track lightweight page view before consent
tracker.trackPage();

// Grant consent when user agrees
tracker.grantConsent();

// Track interactions after consent
tracker.trackEvent("Button", "Click", "Subscribe Button");
```

---

## Notes

- Automatically attaches itself to `window.analytics` for easy browser access.
- SPA-friendly: detects navigation changes via `popstate` and `hashchange`.
- Provides throttling for scroll and mouse events to optimize performance.
- Automatically attaches session ID and UTM parameters for better analytics attribution.

---

## License

MIT License
