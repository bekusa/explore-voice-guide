import { useEffect, useState } from "react";
import { getSaved, onSavedChange, type SavedItem } from "@/lib/savedStore";

export function useSavedItems(): SavedItem[] {
  const [items, setItems] = useState<SavedItem[]>([]);

  useEffect(() => {
    setItems(getSaved());
    return onSavedChange(() => setItems(getSaved()));
  }, []);

  return items;
}
