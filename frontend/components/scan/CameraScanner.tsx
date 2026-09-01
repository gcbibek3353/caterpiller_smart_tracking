"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type QrScannerType from "qr-scanner";
import { Button } from "@/components/ui/button";

/*
 * Fallback: if qr-scanner fights the camera (iOS Safari quirks, worker/CSP),
 * uncomment the import below and swap the `new QrScanner(...)` block in
 * startCamera for
 *   const controls = await new BrowserQRCodeReader()
 *     .decodeFromVideoDevice(undefined, videoRef.current, (r) => r && emit(r.getText()));
 * keeping `controls.stop()` for stopCamera.
 */
// import { BrowserQRCodeReader } from "@zxing/browser";

type EnvInfo = { origin: string; secure: boolean; hasMediaDevices: boolean };

/**
 * Camera access needs a secure context. Over plain http on a LAN IP,
 * `navigator.mediaDevices` is simply undefined — surfacing that makes it
 * obvious instead of looking like a denied permission. Read through
 * useSyncExternalStore so the server snapshot stays null and hydration matches.
 */
let envCache: EnvInfo | null = null;
const subscribeToNothing = () => () => {};
const getEnvSnapshot = (): EnvInfo => (envCache ??= {
  origin: window.location.origin,
  secure: window.isSecureContext,
  hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
});
const getEnvServerSnapshot = () => null;

/**
 * Camera + manual entry, emitting the raw scanned string.
 *
 * Manual entry is not a fallback bolted on later — it sits beside the camera
 * from the start, because cameras fail on stage and the backend's `QrToken`
 * accepts a bare token as readily as a full `RENT:v1:` payload.
 */
export function CameraScanner({
  onToken,
  paused = false,
}: {
  onToken: (raw: string) => void;
  /** Freeze the feed while a preview is on screen, without tearing the stream down. */
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  /**
   * The QrScanner instance captures its callback once at construction, so the
   * live `onToken` is reached through a ref rather than by rebuilding the
   * scanner — rebuilding it would drop the camera stream on every parent
   * render. Written in an effect, never during render.
   */
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<QrScannerType.Camera[]>([]);
  const [manual, setManual] = useState("");
  const env = useSyncExternalStore(subscribeToNothing, getEnvSnapshot, getEnvServerSnapshot);

  const emit = useCallback((value: string) => {
    const now = Date.now();
    // The decoder fires several times a second while a code is in frame.
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { value, at: now };
    onTokenRef.current(value);
  }, []);

  const stopCamera = useCallback(() => {
    scannerRef.current?.stop();
    setRunning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "navigator.mediaDevices is unavailable — this page is not in a secure context. Serve it over HTTPS or localhost.",
        );
      }

      // Imported at call time so nothing camera-related runs during SSR.
      const { default: QrScanner } = await import("qr-scanner");

      if (!scannerRef.current) {
        if (!videoRef.current) throw new Error("Video element not mounted");
        scannerRef.current = new QrScanner(
          videoRef.current,
          (result) => emit(result.data),
          {
            returnDetailedScanResult: true,
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          },
        );
      }

      await scannerRef.current.start();
      setRunning(true);
      // Labels are only populated once permission has been granted.
      setCameras(await QrScanner.listCameras(true));
    } catch (err) {
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setRunning(false);
    } finally {
      setStarting(false);
    }
  }, [emit]);

  /**
   * Pause rather than stop while a preview is up: stopping releases the camera,
   * and re-acquiring it costs a second or two plus, on some phones, a fresh
   * permission prompt between every check-out and the next scan.
   */
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || !running) return;
    if (paused) scanner.pause();
    else void scanner.start();
  }, [paused, running]);

  useEffect(() => {
    return () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const value = manual.trim();
    if (!value) return;
    // Bypass the repeat guard — retyping the same code is a deliberate retry.
    lastScanRef.current = { value: "", at: 0 };
    onTokenRef.current(value);
    setManual("");
  };

  return (
    <div className="grid gap-4">
      {env && !(env.secure && env.hasMediaDevices) ? (
        <div className="rounded-plate border border-warn/40 bg-warn/10 p-3">
          <p className="stamp text-stamp text-warn">Camera blocked — not a secure context</p>
          <p className="mt-1.5 font-mono text-data-xs text-steel">
            origin={env.origin} · isSecureContext={String(env.secure)} · mediaDevices=
            {String(env.hasMediaDevices)}
          </p>
          <p className="mt-1.5 text-note text-steel">
            Restart the dev server with <code>--experimental-https -H &lt;LAN-IP&gt;</code> and open
            the https:// URL, or use manual entry below.
          </p>
        </div>
      ) : null}

      <div className="relative aspect-square w-full overflow-hidden rounded-plate border border-line bg-ink">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!running ? (
          <div className="absolute inset-0 grid place-items-center">
            <p className="stamp text-stamp text-dust/60">Camera stopped</p>
          </div>
        ) : paused ? (
          <div className="absolute inset-0 grid place-items-center bg-ink/70">
            <p className="stamp text-stamp text-hivis">Paused — finish the scan on the right</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={running ? stopCamera : startCamera}
          loading={starting}
          variant={running ? "secondary" : "primary"}
          className="flex-1"
        >
          {running ? "Stop camera" : "Start camera"}
        </Button>
        {running && cameras.length > 1 ? (
          <select
            onChange={(e) => scannerRef.current?.setCamera(e.target.value)}
            className="rounded-plate border border-line bg-plate px-3 py-2.5 font-mono text-data text-ink"
            aria-label="Select camera"
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>{cam.label || cam.id}</option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-plate border border-alert/35 bg-alert/8 p-3 font-mono text-data-xs text-alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={submitManual} className="border-t border-line pt-4">
        <label htmlFor="manual-token" className="stamp mb-1.5 block text-stamp-sm text-steel">
          Manual entry
        </label>
        <div className="flex gap-2">
          <input
            id="manual-token"
            name="manual-token"
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="RENT:v1:…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-plate border border-line bg-plate px-3 py-2.5 font-mono text-data text-ink placeholder:font-sans placeholder:text-mute/60 focus:border-ink"
          />
          <Button type="submit" variant="secondary">Look up</Button>
        </div>
        <p className="mt-1.5 text-note text-mute">
          Type or paste the code when the camera will not cooperate. The full{" "}
          <code className="font-mono">RENT:v1:</code> string or just the token — both resolve.
        </p>
      </form>
    </div>
  );
}
