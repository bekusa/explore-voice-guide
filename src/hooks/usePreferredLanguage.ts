import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the user's preferred language code (e.g. "ka", "en"),
 * defaulting to "ka". Reads from the `profiles` table when signed in.
 */
export function usePreferredLanguage(): string {
  const { user } = useAuth();
  const [lang, setLang] = useState<string>("ka");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const code = data?.preferred_language;
        if (code) setLang(code.split("-")[0].toLowerCase());
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return lang;
}
