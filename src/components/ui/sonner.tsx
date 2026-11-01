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
          /* Layout only. The COLOURS live in styles.css on
             [data-sonner-toast], because the toast is deliberately
             cream in BOTH themes — a theme-following `bg-card` would
             make it charcoal at night, which is the opposite of what
             Beka asked for (2026-11-01: "ფონი თეთრი იყოს… ჩვენს
             ფერებში თეთრი-კრემისფერი"). */
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.55)]",
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
          /* NO per-state panel classes any more. Beka 2026-11-01:
           * "ყველა პოპაპი გადააქციე Sign in to listen სტილში."
           *
           * Every toast now renders on the same card surface as the
           * sign-in prompt. The state is carried by the ICON alone —
           * coloured in styles.css off Sonner's own
           * [data-type='success'|'error'|…] attribute.
           *
           * Why this is better and not just different: a full green
           * or red panel is the loudest element on the screen, and it
           * fires for things like "Language updated", which is not
           * news worth shouting. A neutral card with a gold tick says
           * the same thing without hijacking the page — and it is the
           * one toast Beka singled out as looking right.
           *
           * The .lokali-toast-* classes were the previous attempt at
           * this (lower-chroma panels, 2026-10-06). They were an
           * improvement but still panels; this removes the panel. */
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
