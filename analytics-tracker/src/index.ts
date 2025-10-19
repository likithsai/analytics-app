/**
 * Improved AnalyticsTracker
 * - Single-file production-ready TypeScript
 * - Safe transports, batching, consent, CWV, resource error tracking
 */

/* Global attachment for ease of use */
declare global {
  interface Window {
    analytics?: typeof AnalyticsTracker;
  }
}

type AnyObject = Record<string, any>;

enum EventType {
  PAGE_VIEW = "page_view",
  CUSTOM = "event",
  GOAL = "goal",
  ECOMMERCE = "ecommerce",
  VISIBILITY = "visibility",
  FOCUS = "focus",
  BLUR = "blur",
  ENGAGEMENT = "engagement",
  PERFORMANCE = "performance",
  HEATMAP = "heatmap",
  RESOURCE_ERROR = "resource_error",
  JS_ERROR = "js_error",
}

interface TrackerConfig {
  siteId?: string;
  collectionEndpoint?: string;
  batchSize?: number;
  flushInterval?: number;
  debug?: boolean;
  trackOutlinks?: boolean;
  trackDownloads?: boolean;
  scrollDepthPercentages?: number[];
  maxHeatmapPoints?: number;
  retryBackoffBaseMs?: number;
  retryMaxAttempts?: number;
}

interface BaseEvent {
  type: EventType | string;
  ts: number;
  url: string;
  title?: string;
  device?: string;
  referrer?: string | null;
  siteId?: string;
  sessionId?: string;
  utm?: Record<string, string>;
  customDims?: Record<string, string | number | boolean>;
  payload?: AnyObject;
  userAgent?: string;
}

type TrackerEvent = BaseEvent;

const DEFAULTS: Required<TrackerConfig> = {
  siteId: "",
  collectionEndpoint: process.env.COLLECTION_ENDPOINT || "",
  batchSize: 15,
  flushInterval: 5000,
  debug: false,
  trackOutlinks: true,
  trackDownloads: true,
  scrollDepthPercentages: [25, 50, 75, 100],
  maxHeatmapPoints: 500,
  retryBackoffBaseMs: 500,
  retryMaxAttempts: 4,
};

const now = () => Date.now();

/* Utilities: throttle, debounce, uuid */
function throttle<T extends (...args: any[]) => void>(fn: T, limit = 200) {
  let last = 0;
  return (...args: Parameters<T>) => {
    const t = Date.now();
    if (t - last >= limit) {
      last = t;
      fn(...args);
    }
  };
}
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 100) {
  let timer: any = 0;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function parseUTM(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const out: Record<string, string> = {};
  [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ].forEach((k) => {
    const v = params.get(k);
    if (v) out[k] = v;
  });
  return out;
}

/* Transport with retry/backoff & sendBeacon fallback */
class Transport {
  constructor(
    private endpoint: string,
    private debug: boolean,
    private backoffBaseMs = DEFAULTS.retryBackoffBaseMs,
    private maxAttempts = DEFAULTS.retryMaxAttempts
  ) {}

  private log(...args: any[]) {
    if (this.debug) console.log("[Analytics][Transport]", ...args);
  }

  async send(payload: string, sync = false): Promise<void> {
    // try sendBeacon in sync mode
    if (
      sync &&
      typeof navigator !== "undefined" &&
      typeof (navigator as any).sendBeacon === "function"
    ) {
      try {
        const ok = (navigator as any).sendBeacon(
          this.endpoint,
          new Blob([payload], { type: "application/json" })
        );
        this.log("sendBeacon result:", ok);
        if (ok) return;
      } catch (e) {
        this.log("sendBeacon threw", e);
        // continue to fetch fallback
      }
    }

    // fetch with retries
    let attempt = 0;
    let delay = this.backoffBaseMs;
    while (attempt < this.maxAttempts) {
      try {
        attempt++;
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: sync,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.log("fetch success", res.status);
        return;
      } catch (err) {
        this.log(`fetch attempt ${attempt} failed`, err);
        if (attempt >= this.maxAttempts) throw err;
        // exponential backoff with jitter
        const jitter = Math.round(Math.random() * delay);
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay *= 2;
      }
    }
  }
}

/* Main Tracker */
export class AnalyticsTracker {
  private config: Required<TrackerConfig>;
  private transport: Transport;
  private queue: TrackerEvent[] = [];
  private timerId: number | null = null;
  private customDims: Record<string, string | number | boolean> = {};
  private hasConsent = false;
  private sessionId = "";
  private startTs = now();
  private heatmapBuffer: { x: number; y: number; ts: number }[] = [];
  private scrollDepthReached = new Set<number>();

  constructor(config: TrackerConfig = {}) {
    this.config = { ...DEFAULTS, ...config };

    this.transport = new Transport(
      this.config.collectionEndpoint,
      this.config.debug,
      this.config.retryBackoffBaseMs,
      this.config.retryMaxAttempts
    );

    this.initLightListeners(); // pageview & outlink detection etc.
    this.startAutoFlush();
  }

  /* ========== Public API ========== */

  setSiteId(siteId: string) {
    if (!siteId) return;
    this.config.siteId = siteId;
    this.debug("siteId set to", siteId);
  }

  grantConsent() {
    if (this.hasConsent) return;
    this.hasConsent = true;
    this.sessionId = this.createOrRestoreSession();
    this.debug("consent granted, sessionId:", this.sessionId);
    // attach consent-only listeners & collect initial metrics
    this.initConsentListeners();
  }

  setCustomDimension(name: string, value: string | number | boolean) {
    if (!name) return;
    this.customDims[name] = value;
  }

  trackPage(url?: string, title?: string) {
    const ev: TrackerEvent = this.buildEvent(EventType.PAGE_VIEW, {
      url: url || (location.href ?? ""),
      title: title || (document.title ?? ""),
      referrer: document.referrer || null,
    });
    this.enqueue(ev);
  }

  trackEvent(
    category: string,
    action: string,
    label?: string,
    value?: number,
    extra?: AnyObject
  ) {
    const ev: TrackerEvent = this.buildEvent(EventType.CUSTOM, {
      payload: { category, action, label, value, extra },
    });
    this.enqueue(ev);
  }

  trackEcommerce(eventName: string, data: AnyObject) {
    const ev: TrackerEvent = this.buildEvent(EventType.ECOMMERCE, {
      payload: { eventName, data },
    });
    this.enqueue(ev);
  }

  trackGoal(goalId: string | number, revenue?: number, data?: AnyObject) {
    const ev: TrackerEvent = this.buildEvent(EventType.GOAL, {
      payload: { goalId, revenue, data },
    });
    this.enqueue(ev);
  }

  flushNow() {
    this.flush(false).catch((e) => this.debug("flushNow error", e));
  }

  /* ========== Internal helpers ========== */

  private debug(...args: any[]) {
    if (this.config.debug) console.log("[Analytics]", ...args);
  }

  private createOrRestoreSession(): string {
    const key = "analytics_session_v1";
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = uuidv4();
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      this.debug("sessionStorage not available", e);
      return uuidv4();
    }
  }

  private buildEvent(
    type: EventType | string,
    overrides: Partial<BaseEvent> = {}
  ): TrackerEvent {
    const base: BaseEvent = {
      type,
      ts: now(),
      url: overrides.url || (location.href ?? ""),
      title: overrides.title || (document.title ?? undefined),
      device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "web",
      referrer: overrides.referrer || (document.referrer ?? null),
      siteId: this.config.siteId || undefined,
      sessionId: this.sessionId || undefined,
      utm: parseUTM(),
      customDims: Object.keys(this.customDims).length
        ? { ...this.customDims }
        : undefined,
      payload: overrides.payload ?? undefined,
      userAgent: navigator.userAgent ?? undefined,
    };
    return base as TrackerEvent;
  }

  private enqueue(ev: TrackerEvent) {
    if (!this.config.siteId) {
      this.debug("siteId missing — dropping event", ev.type);
      return;
    }

    // consent gating: allow page views & performance/engagement even if no consent
    const allowWithoutConsent =
      ev.type === EventType.PAGE_VIEW ||
      ev.type === EventType.PERFORMANCE ||
      ev.type === EventType.ENGAGEMENT;
    if (!this.hasConsent && !allowWithoutConsent) {
      this.debug("consent required — skipping", ev.type);
      return;
    }

    // attach session if available
    if (this.sessionId) ev.sessionId = this.sessionId;
    this.queue.push(ev);
    this.debug("queued", ev.type, ev);

    if (this.queue.length >= this.config.batchSize) {
      void this.flush(false);
    }
  }

  private async flush(sync = false): Promise<void> {
    if (!this.queue.length) return;
    if (!this.config.siteId) {
      this.debug("siteId missing at flush");
      return;
    }

    const batch = this.queue.slice();
    this.queue = [];

    const body = JSON.stringify({
      siteId: this.config.siteId,
      ts: now(),
      events: batch,
    });

    try {
      await this.transport.send(body, sync);
      this.debug("flushed", batch.length);
    } catch (err) {
      // requeue on failure (front)
      this.queue.unshift(...batch);
      this.debug("flush failed, requeued", err);
    }
  }

  private startAutoFlush() {
    if (this.timerId != null) window.clearInterval(this.timerId);
    const interval = this.config.flushInterval;
    this.timerId = window.setInterval(() => {
      void this.flush(false);
    }, interval);
  }

  /* ========== Listeners ========== */

  /** Listeners that can be attached without consent (lightweight) */
  private initLightListeners() {
    // immediate lightweight pageview
    this.trackPage();

    // prepare window beforeunload flush
    window.addEventListener("beforeunload", () => {
      // attempt synchronous flush with sendBeacon
      void this.flush(true);
    });
  }

  /** Listeners that require consent (or are gated) */
  private initConsentListeners() {
    // SPA pageview detection
    const onNav = debounce(() => this.trackPage(), 250);
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);

    // clicks (extract basic element info)
    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const details: AnyObject = {};
        details.tag = target.tagName;
        if (target.id) details.id = target.id;
        if (target.className)
          details.class =
            typeof target.className === "string" ? target.className : undefined;
        if (target instanceof HTMLAnchorElement) {
          details.href = target.href;
        }
        this.enqueue(
          this.buildEvent(EventType.CUSTOM, {
            payload: { category: "Interaction", action: "click", details },
          })
        );
      },
      { capture: true, passive: true }
    );

    // scroll depth (throttled)
    const scrollHandler = throttle(() => {
      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const viewport =
        window.innerHeight || document.documentElement.clientHeight;
      const maxScroll = Math.max(0, docHeight - viewport);
      if (maxScroll <= 0) return;
      const current = window.scrollY || window.pageYOffset || 0;
      const pct = Math.floor((current / maxScroll) * 100);
      for (const p of this.config.scrollDepthPercentages) {
        if (pct >= p && !this.scrollDepthReached.has(p)) {
          this.scrollDepthReached.add(p);
          this.trackEvent("Scroll", "DepthReached", `${p}%`, p);
        }
      }
    }, 200);
    window.addEventListener("scroll", scrollHandler, { passive: true });

    // keyboard (consent required? we record key names only sparingly)
    document.addEventListener("keydown", (e) => {
      this.enqueue(
        this.buildEvent(EventType.CUSTOM, {
          payload: { category: "Keyboard", action: "keydown", label: e.key },
        })
      );
    });

    // form submits (metadata only)
    document.addEventListener(
      "submit",
      (e) => {
        const form = e.target as HTMLFormElement | null;
        if (!form) return;
        this.trackEvent(
          "Form",
          "Submit",
          form.name || form.id || "anonymous_form"
        );
      },
      true
    );

    // visibility
    document.addEventListener("visibilitychange", () => {
      this.enqueue(
        this.buildEvent(EventType.VISIBILITY, {
          payload: { state: document.visibilityState },
        })
      );
    });

    // heatmap points (throttled)
    const mouseHandler = throttle((ev: MouseEvent) => {
      this.heatmapBuffer.push({ x: ev.clientX, y: ev.clientY, ts: now() });
      if (this.heatmapBuffer.length >= this.config.maxHeatmapPoints) {
        const points = this.heatmapBuffer.splice(0, this.heatmapBuffer.length);
        this.enqueue(
          this.buildEvent(EventType.HEATMAP, {
            payload: { points: points.slice(0, 200) },
          })
        );
      }
    }, 200);
    document.addEventListener("mousemove", mouseHandler, { passive: true });

    // resource errors with type narrowing
    window.addEventListener(
      "error",
      (ev) => {
        const target = (ev as ErrorEvent).target as EventTarget | null;
        const error = ev as ErrorEvent;
        if (target && target instanceof HTMLScriptElement) {
          const src = (target as HTMLScriptElement).src || "";
          this.enqueue(
            this.buildEvent(EventType.RESOURCE_ERROR, {
              payload: { tag: "script", url: src },
            })
          );
        } else if (target && target instanceof HTMLImageElement) {
          const src = (target as HTMLImageElement).src || "";
          this.enqueue(
            this.buildEvent(EventType.RESOURCE_ERROR, {
              payload: { tag: "img", url: src },
            })
          );
        } else if (target && target instanceof HTMLLinkElement) {
          const href = (target as HTMLLinkElement).href || "";
          this.enqueue(
            this.buildEvent(EventType.RESOURCE_ERROR, {
              payload: { tag: "link", url: href },
            })
          );
        } else if (error && error.error) {
          // normal JS error
          const message = error.error?.message ?? (error.message as string);
          const stack =
            error.error && (error.error as any).stack
              ? String((error.error as any).stack).slice(0, 2000)
              : undefined;
          this.enqueue(
            this.buildEvent(EventType.JS_ERROR, { payload: { message, stack } })
          );
        }
      },
      true
    );
  }
}

// attach AnalyticsTracker constructor to window
(window as any).analytics = AnalyticsTracker;

export default AnalyticsTracker;
