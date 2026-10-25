import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { NotificationsProvider, useNotifications } from "./NotificationsContext.js";
import { apiMock, axiosError, makeNotification, t } from "../test/utils.js";

const wrapper = ({ children }: { children: ReactNode }) => <NotificationsProvider>{children}</NotificationsProvider>;

const unread = makeNotification({ id: 1, is_read: false });
const read = makeNotification({ id: 2, is_read: true });

const setup = async () => {
  apiMock.get.mockResolvedValue({ data: { notifications: [unread, read], unreadCount: 1 } });
  const hook = renderHook(() => useNotifications(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  apiMock.get.mockClear();
  return hook;
};

describe("NotificationsContext", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("loads the notifications and the unread count", async () => {
    const { result } = await setup();
    expect(result.current.notifications).toEqual([unread, read]);
    expect(result.current.unreadCount).toBe(1);
  });

  it("reloads when the window gets focus", async () => {
    await setup();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/notifications"));
  });

  it("polls the server every 50 seconds and stops on unmount", async () => {
    // Spying instead of fake timers: waitFor itself polls with setInterval.
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = await setup();

    const call = setIntervalSpy.mock.calls.find(([, delay]) => delay === 50_000);
    expect(call).toBeDefined();
    await act(async () => {
      (call![0] as () => void)();
    });
    expect(apiMock.get).toHaveBeenCalledWith("/notifications");

    const intervalId = setIntervalSpy.mock.results[setIntervalSpy.mock.calls.indexOf(call!)]!.value;
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("marks one notification as read optimistically", async () => {
    apiMock.patch.mockResolvedValue({ data: {} });
    const { result } = await setup();

    await act(() => result.current.markAsRead(unread));
    expect(apiMock.patch).toHaveBeenCalledWith("/notifications/1/read");
    expect(result.current.notifications[0]!.is_read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not call the server for an already read notification", async () => {
    const { result } = await setup();
    await act(() => result.current.markAsRead(read));
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it("marks all as read", async () => {
    apiMock.patch.mockResolvedValue({ data: {} });
    const { result } = await setup();

    await act(() => result.current.markAllAsRead());
    expect(apiMock.patch).toHaveBeenCalledWith("/notifications/read-all");
    expect(result.current.notifications.every((n) => n.is_read)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("deletes an unread notification and lowers the count", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    const { result } = await setup();

    await act(() => result.current.deleteNotification(unread));
    expect(apiMock.delete).toHaveBeenCalledWith("/notifications/1");
    expect(result.current.notifications).toEqual([read]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("deletes the read notifications and reloads the list", async () => {
    apiMock.delete.mockResolvedValue({ data: {} });
    const { result } = await setup();
    apiMock.get.mockResolvedValue({ data: { notifications: [unread], unreadCount: 1 } });

    await act(() => result.current.deleteRead());
    expect(apiMock.delete).toHaveBeenCalledWith("/notifications/read");
    expect(apiMock.get).toHaveBeenCalledWith("/notifications");
    expect(result.current.notifications).toEqual([unread]);
  });

  it("reloads from the server when an optimistic update fails", async () => {
    apiMock.patch.mockRejectedValue(axiosError(500));
    const { result } = await setup();
    apiMock.get.mockResolvedValue({ data: { notifications: [unread, read], unreadCount: 1 } });

    await act(() => result.current.markAllAsRead());
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(result.current.notifications[0]!.is_read).toBe(false);
  });

  // Each action: its name on the context and the api method it calls.
  const actions = [
    ["markAsRead", "patch"],
    ["markAllAsRead", "patch"],
    ["deleteNotification", "delete"],
    ["deleteRead", "delete"],
  ] as const;

  it.each(actions)("%s shows an error toast when the server fails", async (action, method) => {
    apiMock[method].mockRejectedValue(axiosError(500));
    const errorToast = vi.spyOn(toast, "error");
    const { result } = await setup();
    apiMock.get.mockResolvedValue({ data: { notifications: [unread, read], unreadCount: 1 } });

    await act(() => result.current[action](unread));
    expect(errorToast).toHaveBeenCalledWith(t("notifications.actionError"));
    expect(errorToast).toHaveBeenCalledTimes(1);
  });

  it.each(actions)("%s shows no toast on success, the list already shows the change", async (action, method) => {
    apiMock[method].mockResolvedValue({ data: {} });
    const success = vi.spyOn(toast, "success");
    const errorToast = vi.spyOn(toast, "error");
    const { result } = await setup();

    await act(() => result.current[action](unread));
    expect(apiMock[method]).toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(
      "useNotifications mora biti korišten unutar NotificationsProvider-a.",
    );
  });
});
