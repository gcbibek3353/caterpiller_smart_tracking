'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type QrScannerType from 'qr-scanner';

// Fallback: if qr-scanner fights the camera (iOS Safari quirks, worker/CSP), uncomment the import below and swap the `new QrScanner(...)` block in startCamera for `const controls = await new BrowserQRCodeReader().decodeFromVideoDevice(undefined, videoRef.current, (r) => r && addScan(r.getText(), 'camera'))`, keeping `controls.stop()` for stopCamera.
// import { BrowserQRCodeReader } from '@zxing/browser';

type Scan = {
  id: number;
  value: string;
  source: 'camera' | 'manual';
  at: string;
};

type EnvInfo = {
  origin: string;
  secure: boolean;
  hasMediaDevices: boolean;
};

let scanId = 0;

// Camera access needs a secure context. Over plain http on a LAN IP,
// navigator.mediaDevices is simply undefined — surfacing this makes that obvious
// instead of looking like a permissions bug. Read via useSyncExternalStore so the
// server snapshot stays null and hydration does not mismatch.
let envCache: EnvInfo | null = null;
const subscribeToNothing = () => () => {};
const getEnvSnapshot = (): EnvInfo => (envCache ??= {
  origin: window.location.origin,
  secure: window.isSecureContext,
  hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
});
const getEnvServerSnapshot = () => null;

export default function SpikeScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const [scans, setScans] = useState<Scan[]>([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<QrScannerType.Camera[]>([]);
  const [manual, setManual] = useState('');
  const env = useSyncExternalStore(subscribeToNothing, getEnvSnapshot, getEnvServerSnapshot);

  const addScan = useCallback((value: string, source: Scan['source']) => {
    const now = Date.now();
    // The decoder fires many times a second while a code is in frame; collapse repeats.
    if (source === 'camera' && lastScanRef.current.value === value && now - lastScanRef.current.at < 2000) {
      return;
    }
    lastScanRef.current = { value, at: now };
    setScans((prev) => [
      { id: ++scanId, value, source, at: new Date().toLocaleTimeString() },
      ...prev,
    ]);
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
          'navigator.mediaDevices is unavailable — this page is not in a secure context. Serve it over HTTPS or localhost.',
        );
      }

      // Imported at call time so nothing camera-related runs during SSR.
      const { default: QrScanner } = await import('qr-scanner');

      if (!scannerRef.current) {
        if (!videoRef.current) throw new Error('Video element not mounted');
        scannerRef.current = new QrScanner(
          videoRef.current,
          (result) => addScan(result.data, 'camera'),
          {
            returnDetailedScanResult: true,
            preferredCamera: 'environment',
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
  }, [addScan]);

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
    addScan(value, 'manual');
    setManual('');
  };

  return (
    <main className="mx-auto w-full max-w-5xl p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-title-sm font-semibold">QR scan spike</h1>
        <p className="mt-1 text-body text-mute">
          Throwaway page (plan-24h B2). Proves the camera opens and decodes on a real phone.
          Prints the raw decoded string — expected shape is{' '}
          <code className="rounded-plate bg-dust px-1 py-0.5 font-mono text-data-xs">RENT:v1:&lt;token&gt;</code>.
        </p>
      </header>

      {env && (
        <div
          className={`mb-6 rounded-plate border p-3 text-body ${
            env.secure && env.hasMediaDevices
              ? 'border-ok/35 bg-ok/8 text-ok'
              : 'border-warn/40 bg-warn/10 text-warn'
          }`}
        >
          <div className="font-medium">
            {env.secure && env.hasMediaDevices
              ? 'Secure context — camera is available'
              : 'Not a secure context — the camera will be blocked'}
          </div>
          <div className="mt-1 font-mono text-data-xs">
            origin={env.origin} · isSecureContext={String(env.secure)} · mediaDevices=
            {String(env.hasMediaDevices)}
          </div>
          {!env.secure && (
            <div className="mt-1 text-note">
              Restart the dev server with <code>--experimental-https</code> and open the https:// URL.
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Camera */}
        <section className="flex flex-col">
          <h2 className="mb-2 text-body font-medium uppercase tracking-wide text-mute">
            Camera
          </h2>
          <div className="relative aspect-square w-full overflow-hidden rounded-plate bg-ink">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {!running && (
              <div className="absolute inset-0 grid place-items-center text-body text-mute">
                Camera stopped
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={running ? stopCamera : startCamera}
              disabled={starting}
              className="rounded-plate bg-ink px-4 py-2 text-body font-medium text-plate disabled:opacity-50"
            >
              {starting ? 'Starting…' : running ? 'Stop camera' : 'Start camera'}
            </button>
            {running && cameras.length > 1 && (
              <select
                onChange={(e) => scannerRef.current?.setCamera(e.target.value)}
                className="rounded-plate border border-line px-2 py-2 text-body"
                aria-label="Select camera"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || cam.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-plate border border-alert/35 bg-alert/8 p-2 font-mono text-data-xs text-alert">
              {error}
            </p>
          )}
        </section>

        {/* Manual entry — cameras fail on stage (steps.md §5, plan-24h B9). */}
        <section className="flex flex-col">
          <h2 className="mb-2 text-body font-medium uppercase tracking-wide text-mute">
            Manual entry
          </h2>
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="RENT:v1:…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-plate border border-line px-3 py-2 font-mono text-data"
            />
            <button
              type="submit"
              className="rounded-plate border border-ink px-4 py-2 text-body font-medium"
            >
              Submit
            </button>
          </form>
          <p className="mt-2 text-note text-mute">
            Type or paste a code when the camera will not cooperate. Same output path as a scan.
          </p>

          <h2 className="mt-6 mb-2 text-body font-medium uppercase tracking-wide text-mute">
            Decoded ({scans.length})
          </h2>
          {scans.length === 0 ? (
            <p className="text-body text-mute">Nothing scanned yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {scans.map((scan) => (
                <li key={scan.id} className="rounded-plate border border-line p-2">
                  <div className="flex items-center gap-2 text-note text-mute">
                    <span
                      className={`rounded-plate px-1.5 py-0.5 font-medium ${
                        scan.source === 'camera'
                          ? 'bg-busy/12 text-busy'
                          : 'bg-dust text-steel'
                      }`}
                    >
                      {scan.source}
                    </span>
                    <span>{scan.at}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-data">{scan.value}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
