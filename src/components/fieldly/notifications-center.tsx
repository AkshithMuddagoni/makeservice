import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Inbox, X } from "lucide-react";
import { getFieldlyNotificationHref } from "@/lib/fieldly/notification-navigation";
import {
  getCurrentFieldlyNotifications,
  markCurrentFieldlyNotificationRead,
} from "@/lib/fieldly/account.functions";

type NotificationItem = Awaited<ReturnType<typeof getCurrentFieldlyNotifications>>["items"][number];

export function NotificationsCenter({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await getCurrentFieldlyNotifications();
      setItems(result.items);
      setUnreadCount(result.unreadCount);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadNotifications();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function openNotification(item: NotificationItem) {
    if (!item.readAt) {
      try {
        const result = await markCurrentFieldlyNotificationRead({
          data: { notificationId: item.id },
        });
        if (result.marked) {
          setItems((current) => current.map((notification) =>
            notification.id === item.id
              ? { ...notification, readAt: new Date().toISOString() }
              : notification,
          ));
          setUnreadCount((current) => Math.max(0, current - 1));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This notification could not be marked as read.");
      }
    }
    setOpen(false);
    window.location.assign(getFieldlyNotificationHref(item));
  }

  if (!enabled) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadNotifications(true);
        }}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="fieldly-notifications-panel"
        className="relative grid size-10 place-items-center rounded-xl border border-line bg-white text-ink shadow-sm transition hover:border-field sm:h-11 sm:w-11"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-field px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          id="fieldly-notifications-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="font-semibold">Notifications</p>
              <p className="text-xs text-muted">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="grid size-8 place-items-center rounded-lg hover:bg-paper"
            >
              <X className="size-4" />
            </button>
          </header>
          {error && <p role="alert" className="border-b border-line bg-red-50 px-4 py-2 text-xs text-red-900">{error}</p>}
          <div className="max-h-[min(65vh,28rem)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="p-5 text-sm text-muted">Loading notifications…</p>
            ) : items.length === 0 ? (
              <div className="p-7 text-center">
                <Inbox className="mx-auto size-7 text-muted" />
                <p className="mt-2 text-sm font-semibold">You’re all caught up</p>
                <p className="mt-1 text-xs text-muted">New requests, quotes and booking updates will appear here.</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => void openNotification(item)}
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-paper"
                >
                  <span className={item.readAt ? "mt-1 size-2 shrink-0 rounded-full bg-line" : "mt-1 size-2 shrink-0 rounded-full bg-field"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">{item.body}</span>
                    <span className="mt-1 block text-[10px] text-muted">{new Date(item.createdAt).toLocaleString("en-IN")}</span>
                  </span>
                  {!item.readAt && <Check className="mt-1 size-4 shrink-0 text-field" aria-label="Unread" />}
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
