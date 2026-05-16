/**
 * Plays a one-line sample of an Azure voice through the same /api/tts
 * path that the InlineAudioPanel uses for full guides. Lets the user
 * actually hear "Eka" vs "Giorgi" before committing to one in
 * Settings / Onboarding, instead of relying on the old browser-voice
 * preview which had nothing to do with Azure's actual catalog.
 *
 * Cost-control: every preview click costs Azure characters (~60 per
 * preview phrase). We cache the rendered blob URL per voice name for
 * the lifetime of the tab so repeated clicks during the same session
 * are free. The cache lives in-memory only — fresh tab gets fresh
 * blobs.
 */

let currentAudio: HTMLAudioElement | null = null;
const cache = new Map<string, string>(); // voiceName → blob URL

/**
 * Fetch + play (or replay from cache) a TTS preview of `phrase` in the
 * given Azure `voice`. Returns a promise that resolves when audio
 * starts playing, or rejects on network/decode failure.
 *
 * Stops any previously-started preview before starting a new one —
 * tapping voice A then voice B should switch cleanly, not double-up.
 */
export async function playVoicePreview(args: {
  voice: string;
  language: string;
  phrase: string;
}): Promise<void> {
  // Halt the previous preview so two voices never overlap. .pause()
  // doesn't reset currentTime which is fine; the audio element is
  // about to be reassigned anyway.
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  let blobUrl = cache.get(args.voice);
  if (!blobUrl) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: args.phrase,
        language: args.language,
        voice: args.voice,
      }),
    });
    if (!res.ok) {
      throw new Error(`TTS preview failed: HTTP ${res.status}`);
    }
    const blob = await res.blob();
    if (blob.size < 500 || !blob.type.toLowerCase().includes("audio")) {
      throw new Error("Invalid audio response");
    }
    blobUrl = URL.createObjectURL(blob);
    cache.set(args.voice, blobUrl);
  }

  const audio = new Audio(blobUrl);
  currentAudio = audio;
  await audio.play();
}

/**
 * Free in-memory blob URLs. Call when the user navigates away from a
 * voice-picker screen so we don't hold onto preview audio forever.
 */
export function clearVoicePreviewCache() {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}
