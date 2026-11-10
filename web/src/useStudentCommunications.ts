import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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

  const refreshAnnouncements = useCallback(async () => {
    const response = await request<{ announcements: StudentAnnouncement[] }>("/announcements");
    setAnnouncements(Array.isArray(response.announcements) ? response.announcements : []);
  }, [request]);

  const refreshNotifications = useCallback(async () => {
    if (userRole !== "STUDENT") {
      setNotifications([]);
      return;
    }
    const path = activePage === "notifications" ? "/notifications" : "/notifications?unread=true";
    const response = await request<{ notifications: StudentNotification[] }>(path);
    setNotifications(Array.isArray(response.notifications) ? response.notifications : []);
  }, [activePage, request, userRole]);

  useEffect(() => {
    setAnnouncements([]);
    setActiveAnnouncements([]);
    setNotifications([]);
  }, [userId, userRole]);

  useEffect(() => {
    if (userRole !== "STUDENT") {
      setActiveAnnouncements([]);
      return;
    }
    request<{ announcements: StudentAnnouncement[] }>("/announcements/active")
      .then(({ announcements: items }) => setActiveAnnouncements(Array.isArray(items) ? items : []))
      .catch((cause) => setError((cause as Error).message));
  }, [request, setError, userId, userRole]);

  useEffect(() => {
    if (userRole !== "STUDENT") {
      setNotifications([]);
      return;
    }
    const refresh = () => {
      void refreshNotifications().catch(() => {
        // Notification delivery is supplementary; keep the core student workspace usable.
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshNotifications, userId, userRole]);

  useEffect(() => {
    if (userRole !== "STUDENT" || !["dashboard", "announcements"].includes(activePage)) return;
    refreshAnnouncements().catch((cause) => setError((cause as Error).message));
  }, [activePage, refreshAnnouncements, setError, userId, userRole]);

  async function dismissAnnouncement(id: string) {
    try {
      await request(`/announcements/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
      setActiveAnnouncements((items) => items.filter((item) => item.id !== id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function acknowledgeAnnouncement(id: string) {
    setBusy(true);
    try {
      const result = await request<{ seenAt: string; acknowledgedAt: string | null }>(
        `/announcements/${encodeURIComponent(id)}/acknowledge`,
        { method: "POST" },
      );
      setAnnouncements((items) => items.map((item) => item.id === id
        ? { ...item, seenAt: result.seenAt, acknowledgedAt: result.acknowledgedAt }
        : item));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(id: string) {
    try {
      const result = await request<{ readAt: string }>(
        `/notifications/${encodeURIComponent(id)}/read`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, readAt: result.readAt } : item));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const clear = useCallback(() => {
    setAnnouncements([]);
    setActiveAnnouncements([]);
    setNotifications([]);
  }, []);

  return {
    announcements,
    activeAnnouncements,
    notifications,
    refreshAnnouncements,
    refreshNotifications,
    dismissAnnouncement,
    acknowledgeAnnouncement,
    markNotificationRead,
    clear,
  };
}
