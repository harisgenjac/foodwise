import { act, render } from "@testing-library/react";
import {
  LIVE_REFRESH_DELAY_MS,
  LIVE_RETRY_MS,
  LiveEventsProvider,
  useLiveEvents,
  useLiveOrderRefresh,
  type LiveEvent,
} from "./LiveEventsContext.js";

// A stand-in for the browser's EventSource (jsdom has none): the test plays the server's events.
class FakeEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  closed = false;

  constructor(
    public url: string,
    public init?: EventSourceInit,
  ) {
    super();
    FakeEventSource.instances.push(this);
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  send(kind: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(kind, { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }

  fail(closed: boolean) {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.dispatchEvent(new Event("error"));
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

const latest = () => FakeEventSource.instances.at(-1)!;

function Recorder({ onEvent }: { onEvent: (event: LiveEvent) => void }) {
  useLiveEvents(onEvent);
  return null;
}

function OrderPage({ refresh, orderId }: { refresh: () => void; orderId?: number }) {
  useLiveOrderRefresh(refresh, orderId);
  return null;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LiveEventsProvider", () => {
  it("opens one stream with the login cookie and passes its events on", () => {
    const onEvent = vi.fn();
    render(
      <LiveEventsProvider>
        <Recorder onEvent={onEvent} />
      </LiveEventsProvider>,
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toBe("http://localhost:3000/api/events");
    expect(latest().init).toEqual({ withCredentials: true });

    act(() => {
      latest().open();
      latest().send("order", { kind: "order", order_id: 7 });
      latest().send("notification", { kind: "notification" });
      latest().send("order", "not json");
    });

    expect(onEvent.mock.calls).toEqual([[{ kind: "order", order_id: 7 }], [{ kind: "notification" }]]);
  });

  it("opens nothing when disabled", () => {
    render(<LiveEventsProvider enabled={false}>{null}</LiveEventsProvider>);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("sends resync after the browser reconnected, and opens a refused stream again later", () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();
    render(
      <LiveEventsProvider>
        <Recorder onEvent={onEvent} />
      </LiveEventsProvider>,
    );
    const first = latest();
    act(() => {
      first.open();
      first.fail(false);
      first.open();
    });
    expect(onEvent.mock.calls).toEqual([[{ kind: "resync" }]]);

    act(() => first.fail(true));
    expect(first.closed).toBe(true);
    act(() => vi.advanceTimersByTime(LIVE_RETRY_MS));
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("closes the stream when unmounted", () => {
    const { unmount } = render(<LiveEventsProvider>{null}</LiveEventsProvider>);
    unmount();
    expect(latest().closed).toBe(true);
  });
});

describe("useLiveOrderRefresh", () => {
  it("loads the page once for close events of its order or a resync, not for others", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    render(
      <LiveEventsProvider>
        <OrderPage refresh={refresh} orderId={7} />
      </LiveEventsProvider>,
    );
    act(() => {
      latest().send("order", { kind: "order", order_id: 8 });
      latest().send("notification", { kind: "notification" });
      vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      latest().send("order", { kind: "order", order_id: 7 });
      latest().send("order", { kind: "order", order_id: 7 });
      vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      latest().send("resync", { kind: "resync" });
      vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("loads a list for any order", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    render(
      <LiveEventsProvider>
        <OrderPage refresh={refresh} />
      </LiveEventsProvider>,
    );
    act(() => {
      latest().send("order", { kind: "order", order_id: 8 });
      vi.advanceTimersByTime(LIVE_REFRESH_DELAY_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside the provider", () => {
    expect(() => render(<OrderPage refresh={vi.fn()} />)).not.toThrow();
  });
});
