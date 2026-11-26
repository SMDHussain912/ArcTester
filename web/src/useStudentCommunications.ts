import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { StudentPage } from "./StudentNavigation";

export interface StudentAnnouncement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  publishedAt: string;
  expiresAt: string | null;
  seenAt?: string | null;
  acknowledgedAt?: string | null;
}

export interface StudentNotification {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
}


export type StudentCommunicationsRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

interface UseStudentCommunicationsOptions {
  userRole: "ADMIN" | "STUDENT" | null;
  userId: number | null;
  activePage: StudentPage;
  request: StudentCommunicationsRequest;
  setError: (message: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
}

export function useStudentCommunications({
  userRole,
  userId,
  activePage,
  request,
  setError,
  setBusy,
}: UseStudentCommunicationsOptions) {
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [activeAnnouncements, setActiveAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  // Page changes can trigger overlapping unread-only and full-inbox requests.
  // Only the newest request may publish results to the inbox.
  const notificationRequestSequence = useRef(0);

  // Requests can outlive the authenticated account that started them. Keep an
  // identity token in a ref so late responses cannot populate another account's UI.
  const identity = `${userRole ?? "anonymous"}:${userId ?? "none"}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const refreshAnnouncements = useCallback(async () => {
    const requestIdentity = identity;
    const response = await request<{ announcements: StudentAnnouncement[] }>("/announcements");
    if (identityRef.current !== requestIdentity) return;
    setAnnouncements(Array.isArray(response.announcements) ? response.announcements : []);
  }, [identity, request]);

  const refreshNotifications = useCallback(async () => {
    const requestIdentity = identity;
    const requestSequence = ++notificationRequestSequence.current;
    if (userRole !== "STUDENT") {
      if (identityRef.current === requestIdentity && notificationRequestSequence.current === requestSequence) {
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
      return;
    }
    const path = activePage === "notifications" ? "/notifications" : "/notifications?unread=true";
    const response = await request<{ notifications: StudentNotification[]; unreadCount?: number }>(path);
    if (identityRef.current !== requestIdentity || notificationRequestSequence.current !== requestSequence) return;
    const items = (Array.isArray(response.notifications) ? response.notifications : [])
      .filter((item) => !["EXAM_ASSIGNMENT", "EXAM_RESULT"].includes(item.kind));
    setNotifications(items);
    setUnreadNotificationCount(typeof response.unreadCount === "number" ? response.unreadCount : items.filter((item) => !item.readAt).length);
  }, [activePage, identity, request, userRole]);

  useEffect(() => {
    // Invalidate any in-flight notification response from the previous account.
    notificationRequestSequence.current += 1;
    setAnnouncements([]);
    setActiveAnnouncements([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
  }, [identity]);

  useEffect(() => {
    if (userRole !== "STUDENT") {
      setActiveAnnouncements([]);
      return;
    }
    const requestIdentity = identity;
    let cancelled = false;
    request<{ announcements: StudentAnnouncement[] }>("/announcements/active")
      .then(({ announcements: items }) => {
        if (cancelled || identityRef.current !== requestIdentity) return;
        setActiveAnnouncements(Array.isArray(items) ? items : []);
      })
      .catch((cause) => {
        if (!cancelled && identityRef.current === requestIdentity) setError((cause as Error).message);
      });
    return () => { cancelled = true; };
  }, [identity, request, setError, userRole]);

  useEffect(() => {
    if (userRole !== "STUDENT") {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void refreshNotifications().catch((cause) => {
        if (!cancelled && identityRef.current === identity) {
          // Notification delivery is supplementary; keep the core student workspace usable.
          setError((cause as Error).message);
        }
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [identity, refreshNotifications, setError, userRole]);

  useEffect(() => {
    if (userRole !== "STUDENT" || !["dashboard", "announcements"].includes(activePage)) return;
    const requestIdentity = identity;
    refreshAnnouncements().catch((cause) => {
      if (identityRef.current === requestIdentity) setError((cause as Error).message);
    });
  }, [activePage, identity, refreshAnnouncements, setError, userRole]);

  async function dismissAnnouncement(id: string) {
    const requestIdentity = identity;
    try {
      await request(`/announcements/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
      if (identityRef.current === requestIdentity) setActiveAnnouncements((items) => items.filter((item) => item.id !== id));
    } catch (cause) {
      if (identityRef.current === requestIdentity) setError((cause as Error).message);
    }
  }

  async function acknowledgeAnnouncement(id: string) {
    const requestIdentity = identity;
    setBusy(true);
    try {
      const result = await request<{ seenAt: string; acknowledgedAt: string | null }>(
        `/announcements/${encodeURIComponent(id)}/acknowledge`,
        { method: "POST" },
      );
      if (identityRef.current === requestIdentity) {
        setAnnouncements((items) => items.map((item) => item.id === id
          ? { ...item, seenAt: result.seenAt, acknowledgedAt: result.acknowledgedAt }
          : item));
      }
    } catch (cause) {
      if (identityRef.current === requestIdentity) setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(id: string) {
    const requestIdentity = identity;
    const current = notifications.find((item) => item.id === id);
    if (!current || current.readAt) return;

    // Invalidate a polling response that may have captured this notification
    // before the read mutation, then update the UI without waiting on the API.
    notificationRequestSequence.current += 1;
    const optimisticReadAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.id === id
      ? { ...item, readAt: optimisticReadAt }
      : item));
    setUnreadNotificationCount((count) => Math.max(0, count - 1));

    try {
      const result = await request<{ readAt: string; alreadyRead?: boolean }>(
        `/notifications/${encodeURIComponent(id)}/read`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (identityRef.current === requestIdentity) {
        setNotifications((items) => items.map((item) => item.id === id
          ? { ...item, readAt: result.readAt }
          : item));
      }
    } catch (cause) {
      if (identityRef.current === requestIdentity) {
        setError((cause as Error).message);
        // Reconcile with the server instead of blindly reverting: another
        // device may have marked the notification read in the meantime.
        void refreshNotifications().catch((refreshCause) => {
          if (identityRef.current === requestIdentity) setError((refreshCause as Error).message);
        });
      }
    }
  }

  async function markAllNotificationsRead() {
    const requestIdentity = identity;
    const unread = notifications.filter((item) => !item.readAt);
    if (unread.length === 0) return;

    notificationRequestSequence.current += 1;
    const optimisticReadAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.readAt ? item : { ...item, readAt: optimisticReadAt }));
    setUnreadNotificationCount(0);

    try {
      await request<{ updatedCount: number }>("/notifications/read-all", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (cause) {
      if (identityRef.current === requestIdentity) {
        setError((cause as Error).message);
        void refreshNotifications().catch((refreshCause) => {
          if (identityRef.current === requestIdentity) setError((refreshCause as Error).message);
        });
      }
    }
  }

  const clear = useCallback(() => {
    // A pending poll must not repopulate the inbox after sign-out clears it.
    notificationRequestSequence.current += 1;
    setAnnouncements([]);
    setActiveAnnouncements([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
  }, []);

  return {
    announcements,
    activeAnnouncements,
    notifications,
    unreadNotificationCount,
    refreshAnnouncements,
    refreshNotifications,
    dismissAnnouncement,
    acknowledgeAnnouncement,
    markNotificationRead,
    markAllNotificationsRead,
    clear,
  };
}
