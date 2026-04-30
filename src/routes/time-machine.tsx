import { createFileRoute } from "@tanstack/react-router";
import TimeMachine from "@/components/TimeMachine";

export const Route = createFileRoute("/time-machine")({
  head: () => ({
    meta: [
      { title: "Time Machine — Lokali" },
      {
        name: "description",
        content:
          "34 immersive historical simulations. Step inside the moment, become the witness.",
      },
      { property: "og:title", content: "Time Machine — Lokali" },
      {
        property: "og:description",
        content:
          "34 immersive historical simulations. Step inside the moment, become the witness.",
      },
    ],
  }),
  component: TimeMachinePage,
});

function TimeMachinePage() {
  return (
    <TimeMachine
      language="English"
      webhookUrl="https://your-n8n.app.n8n.cloud/webhook/lokali-time-machine"
      onResult={(data) => console.log("Simulation result:", data)}
    />
  );
}
