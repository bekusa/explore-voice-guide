import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Check, Globe, Search } from "lucide-react";
import { LANGUAGES, useT, type LangCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  trigger?: React.ReactNode;
  /** Render as full-width list (e.g. inside Settings) instead of a sheet */
  inline?: boolean;
  onSelect?: (code: LangCode) => void;
}

export function LanguageSelector({ trigger, inline, onSelect }: Props) {
  const { lang, setLang, t, meta } = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = LANGUAGES.filter(
    (l) =>
      !q.trim() ||
      l.name.toLowerCase().includes(q.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(q.toLowerCase()),
  );

  const handlePick = (code: LangCode) => {
    setLang(code);
    onSelect?.(code);
    setOpen(false);
  };

  const list = (
    <div className="space-y-1">
      <div className="relative px-4 pb-3">
        <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="h-11 rounded-full bg-muted pl-10"
        />
      </div>
      <ul className="max-h-[55vh] overflow-y-auto px-2 pb-4">
        {filtered.map((l) => {
          const active = l.code === lang;
          return (
            <li key={l.code}>
              <button
                onClick={() => handlePick(l.code)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-colors",
                  active ? "bg-secondary" : "hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{l.flag}</span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">{l.nativeName}</span>
                    <span className="block text-xs text-muted-foreground">{l.name}</span>
                  </span>
                </span>
                {active && <Check className="h-5 w-5 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (inline) return list;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger ?? (
          <button className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-soft">
            <Globe className="h-3.5 w-3.5" />
            <span>{meta.flag}</span>
            <span className="hidden xs:inline">{meta.code.toUpperCase()}</span>
          </button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl">{t("chooseLanguage")}</DrawerTitle>
        </DrawerHeader>
        {list}
      </DrawerContent>
    </Drawer>
  );
}
