import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          /* `bg-card`, not `bg-background` — a toast floats above the
             page, so it reads as a raised surface like every other
             card in the app rather than a hole punched in it.
             Beka 2026-11-01: "ბექგრაუნდ ფერიც შეცვალე აპლიკაციის
             სტილში იყოს." */
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/70 group-[.toaster]:rounded-2xl group-[.toaster]:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.65)]",
          title: "group-[.toast]:text-[14px] group-[.toast]:font-semibold",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:text-[12px] group-[.toast]:leading-snug",
          /* The action is the whole point of a toast that has one, so
             it gets the app's gold pill at a real tap size (36px),
             not Sonner's small grey chip. Beka: "Sign in ღილაკი
             გაზარდე, ჩასვი აპლიკაციის ოქროსფერ ღილაკის ფერში." */
          /* A real CSS class, not Tailwind utilities. Two reasons,
             both learned the hard way:
               1. Sonner ships its own `[data-button]` rules and they
                  outrank these utilities — which is why the old
                  `group-[.toast]:bg-primary` never took and the
                  button rendered in Sonner's default dark grey
                  instead of gold.
               2. `bg-gradient-gold` is hand-written CSS in
                  styles.css, not a generated utility, so Tailwind's
                  important modifier cannot be applied to it at all.
             Same reasoning as .lokali-toast-* below it. */
          actionButton: "lokali-toast-action",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          /* Warm, low-chroma state tones in place of Sonner's stock
           * red/green. Defined in styles.css (.lokali-toast-*) rather
           * than as utility classes here because each one needs a
           * daylight-theme variant too, and `richColors` has been
           * turned off in __root.tsx so these win without a fight.
           * Beka 2026-10-06 — "წითელი ძალიან აგრესიულია". */
          error: "lokali-toast-error",
          success: "lokali-toast-success",
          warning: "lokali-toast-warning",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
