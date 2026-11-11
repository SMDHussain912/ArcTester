import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useStudentCommunications,
  type StudentAnnouncement,
  type StudentNotification,
  type StudentCommunicationsRequest,
} from "./useStudentCommunications";

describe("useStudentCommunications", () => {
  it("loads the active announcement popup, announcement history and unread notices", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/announcements/active") return { announcements: [{ id: "active-1", title: "Exam update", message: "Starts at 10.", createdAt: "2026-11-10T08:00:00.000Z", publishedAt: "2026-11-10T08:00:00.000Z", expiresAt: null }] };
      if (path === "/announcements") return { announcements: [{ id: "history-1", title: "Old update", message: "Read me.", createdAt: "2026-11-10T07:00:00.000Z", publishedAt: "2026-11-10T07:00:00.000Z", expiresAt: null, seenAt: null, acknowledgedAt: null }] };
      if (path === "/notifications?unread=true") return { notifications: [{ id: "notice-1", kind: "EXAM_ASSIGNMENT", title: "New exam", message: "Assigned.", href: "/assignments", createdAt: "2026-11-10T08:30:00.000Z", readAt: null, expiresAt: null }] };
      return { notifications: [] };
    });
    const setError = vi.fn();
    const setBusy = vi.fn();
    const { result } = renderHook(() => useStudentCommunications({
      userRole: "STUDENT",
      userId: 1,
      activePage: "dashboard",
      request: request as unknown as StudentCommunicationsRequest,
      setError,
      setBusy,
    }));

    await waitFor(() => expect(result.current.announcements).toHaveLength(1));
    expect(result.current.activeAnnouncements[0].id).toBe("active-1");
    expect(result.current.notifications[0].id).toBe("notice-1");
    expect(request).toHaveBeenCalledWith("/announcements/active");
    expect(request).toHaveBeenCalledWith("/announcements");
    expect(request).toHaveBeenCalledWith("/notifications?unread=true");
  });

  it("loads the full inbox on the notifications page and persists read/acknowledgement actions", async () => {
    const setError = vi.fn();
    const setBusy = vi.fn();
    const request = vi.fn(async (path: string) => {
      if (path === "/announcements/active") return { announcements: [] };
      if (path === "/notifications") return { notifications: [{ id: "notice-1", kind: "EXAM_RESULT", title: "Result", message: "Ready.", href: "/assignments/a1/result", createdAt: "2026-11-10T08:30:00.000Z", readAt: null, expiresAt: null }] };
      if (path.endsWith("/read")) return { readAt: "2026-11-10T09:00:00.000Z" };
      if (path.endsWith("/acknowledge")) return { seenAt: "2026-11-10T09:00:00.000Z", acknowledgedAt: "2026-11-10T09:00:00.000Z" };
      return { announcements: [] };
    });
    const { result } = renderHook(() => useStudentCommunications({
      userRole: "STUDENT",
      userId: 1,
      activePage: "notifications",
      request: request as unknown as StudentCommunicationsRequest,
      setError,
      setBusy,
    }));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(request).toHaveBeenCalledWith("/notifications");

    await act(async () => { await result.current.markNotificationRead("notice-1"); });
    expect(result.current.notifications[0].readAt).toBe("2026-11-10T09:00:00.000Z");

    await act(async () => { await result.current.refreshAnnouncements(); });
    await act(async () => { await result.current.acknowledgeAnnouncement("history-1"); });
    expect(request).toHaveBeenCalledWith("/announcements/history-1/acknowledge", { method: "POST" });
  });

  it("clears previous account notices before loading the next student's inbox", async () => {
    let currentUserId = 1;
    const request = vi.fn(async (path: string) => {
      if (path === "/announcements/active") return { announcements: [] };
      if (path === "/notifications?unread=true") return {
        notifications: [{
          id: `notice-user-${currentUserId}`,
          kind: "EXAM_ASSIGNMENT",
          title: `Notice for user ${currentUserId}`,
          message: "Account-scoped notice.",
          href: "/assignments",
          createdAt: "2026-11-10T08:30:00.000Z",
          readAt: null,
          expiresAt: null,
        }],
      };
      return { announcements: [] };
    });
    const setError = vi.fn();
    const setBusy = vi.fn();
    const options = (userId: number) => ({
      userRole: "STUDENT" as const,
      userId,
      activePage: "dashboard" as const,
      request: request as unknown as StudentCommunicationsRequest,
      setError,
      setBusy,
    });
    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) => useStudentCommunications(options(userId)),
      { initialProps: { userId: 1 } },
    );
    await waitFor(() => expect(result.current.notifications[0]?.id).toBe("notice-user-1"));

    currentUserId = 2;
    rerender({ userId: 2 });
    await waitFor(() => expect(result.current.notifications[0]?.id).toBe("notice-user-2"));
    expect(result.current.notifications.some((item) => item.id === "notice-user-1")).toBe(false);
  });

  it("clears all student communication state when the account is no longer a student", async () => {
    const request = vi.fn(async () => ({ announcements: [] }));
    const setError = vi.fn();
    const setBusy = vi.fn();
    const { result, rerender } = renderHook(
      ({ role }: { role: "STUDENT" | "ADMIN" }) => useStudentCommunications({
        userRole: role,
        userId: role === "STUDENT" ? 1 : null,
        activePage: "dashboard",
        request: request as unknown as StudentCommunicationsRequest,
        setError,
        setBusy,
      }),
      { initialProps: { role: "STUDENT" as const } },
    );
    await waitFor(() => expect(request).toHaveBeenCalled());
    act(() => result.current.clear());
    expect(result.current.announcements).toEqual([]);
    expect(result.current.activeAnnouncements).toEqual([]);
    expect(result.current.notifications).toEqual([]);
    rerender({ role: "ADMIN" });
    expect(result.current.notifications).toEqual([]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("useStudentCommunications account isolation", () => {
  it("ignores announcement and notification responses started by a previous account", async () => {
    const pending = new Map<string, Array<ReturnType<typeof deferred<unknown>>>>();
    const request = vi.fn((path: string) => {
      const next = deferred<unknown>();
      pending.set(path, [...(pending.get(path) ?? []), next]);
      return next.promise;
    }) as unknown as StudentCommunicationsRequest;
    const setError = vi.fn();
    const setBusy = vi.fn();

    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) => useStudentCommunications({
        userRole: "STUDENT", userId, activePage: "dashboard", request, setError, setBusy,
      }),
      { initialProps: { userId: 101 } },
    );

    await waitFor(() => {
      expect(pending.get("/announcements/active")).toHaveLength(1);
      expect(pending.get("/announcements")).toHaveLength(1);
      expect(pending.get("/notifications?unread=true")).toHaveLength(1);
    });

    rerender({ userId: 202 });
    await waitFor(() => {
      expect(pending.get("/announcements/active")).toHaveLength(2);
      expect(pending.get("/announcements")).toHaveLength(2);
      expect(pending.get("/notifications?unread=true")).toHaveLength(2);
    });

    const oldAnnouncement: StudentAnnouncement = {
      id: "private-old-account", title: "Old account notice", message: "Must not leak.",
      createdAt: "2026-11-11T08:00:00.000Z", publishedAt: "2026-11-11T08:00:00.000Z", expiresAt: null,
    };
    const oldNotification: StudentNotification = {
      id: "private-old-notification", kind: "EXAM_RESULT", title: "Old account result",
      message: "Must not leak.", href: "/assignments", createdAt: "2026-11-11T08:00:00.000Z",
      readAt: null, expiresAt: null,
    };

    await act(async () => {
      pending.get("/announcements/active")![0].resolve({ announcements: [oldAnnouncement] });
      pending.get("/announcements")![0].resolve({ announcements: [oldAnnouncement] });
      pending.get("/notifications?unread=true")![0].resolve({ notifications: [oldNotification] });
      await Promise.resolve();
    });

    expect(result.current.activeAnnouncements).toEqual([]);
    expect(result.current.announcements).toEqual([]);
    expect(result.current.notifications).toEqual([]);

    const currentAnnouncement = { ...oldAnnouncement, id: "current-account-notice", title: "Current account notice" };
    const currentNotification = { ...oldNotification, id: "current-account-notification", title: "Current account result" };
    await act(async () => {
      pending.get("/announcements/active")![1].resolve({ announcements: [currentAnnouncement] });
      pending.get("/announcements")![1].resolve({ announcements: [currentAnnouncement] });
      pending.get("/notifications?unread=true")![1].resolve({ notifications: [currentNotification] });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.activeAnnouncements.map((item) => item.id)).toEqual(["current-account-notice"]);
      expect(result.current.announcements.map((item) => item.id)).toEqual(["current-account-notice"]);
      expect(result.current.notifications.map((item) => item.id)).toEqual(["current-account-notification"]);
    });
    expect(setError).not.toHaveBeenCalled();
  });
});


describe("useStudentCommunications unread totals", () => {
  it("uses the server unread count even when the inbox response is capped and decrements after a successful read", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/notifications") {
        return {
          unreadCount: 147,
          notifications: [{
            id: "latest-notice",
            kind: "EXAM_RESULT",
            title: "Result available",
            message: "Your result is ready.",
            href: "/assignments",
            createdAt: "2026-11-11T08:00:00.000Z",
            readAt: null,
            expiresAt: null,
          }],
        };
      }
      if (path.endsWith("/read")) return { readAt: "2026-11-11T09:00:00.000Z", alreadyRead: false };
      return { announcements: [] };
    });
    const setError = vi.fn();
    const setBusy = vi.fn();
    const { result } = renderHook(() => useStudentCommunications({
      userRole: "STUDENT",
      userId: 303,
      activePage: "notifications",
      request: request as unknown as StudentCommunicationsRequest,
      setError,
      setBusy,
    }));

    await waitFor(() => expect(result.current.unreadNotificationCount).toBe(147));
    expect(result.current.notifications).toHaveLength(1);
    await act(async () => { await result.current.markNotificationRead("latest-notice"); });
    expect(result.current.unreadNotificationCount).toBe(146);
    expect(result.current.notifications[0].readAt).toBe("2026-11-11T09:00:00.000Z");
  });
});
