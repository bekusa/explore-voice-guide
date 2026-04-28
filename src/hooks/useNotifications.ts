import { useEffect, useState } from "react";
import {
  getNotifications,
  onNotificationsChange,
  seedDefaultsOnce,
  type AppNotification,
} from "@/lib/notificationsStore";

export function useNotifications(): AppNotification[] {
  const [items, setItems] = useState<AppNotification[]>(() =>
    typeof window === "undefined" ? [] : getNotifications(),
  );

  useEffect(() => {
    seedDefaultsOnce();
    setItems(getNotifications());
    return onNotificationsChange(() => setItems(getNotifications()));
  }, []);

  return items;
}

export function useUnreadCount(): number {
  const items = useNotifications();
  return items.filter((n) => !n.read).length;
}
