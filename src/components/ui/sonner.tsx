import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
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
