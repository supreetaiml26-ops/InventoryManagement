"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";

type BarcodeCameraScannerProps = {
  onScan: (barcode: string) => void;
  onError?: (message: string) => void;
  buttonLabel?: string;
  continuous?: boolean;
  cooldownMs?: number;
};

const TRANSIENT_ZXING_ERRORS = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

export function BarcodeCameraScanner({
  onScan,
  onError,
  buttonLabel = "Scan with camera",
  continuous = true,
  cooldownMs = 1500,
}: BarcodeCameraScannerProps) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({
    code: "",
    at: 0,
  });
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setStarting(true);
      setCameraError("");

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        const message =
          "Camera access is unavailable in this browser or requires HTTPS/localhost.";
        setCameraError(message);
        onErrorRef.current?.(message);
        setStarting(false);
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement) {
        setStarting(false);
        return;
      }

      try {
        const availableDevices =
          await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;

        setDevices(availableDevices);

        const activeDeviceId =
          selectedDeviceId ||
          availableDevices.find((device) =>
            /back|rear|environment/i.test(device.label)
          )?.deviceId ||
          availableDevices[0]?.deviceId;

        if (!selectedDeviceId && activeDeviceId) {
          setSelectedDeviceId(activeDeviceId);
        }

        const reader = new BrowserMultiFormatReader();

        const handleDecode = (
          result: { getText(): string } | undefined,
          err: unknown
        ) => {
          if (cancelled) return;

          if (result) {
            const code = result.getText().trim();
            if (!code) return;

            const now = Date.now();
            if (
              lastScanRef.current.code === code &&
              now - lastScanRef.current.at < cooldownMs
            ) {
              return;
            }

            lastScanRef.current = { code, at: now };
            setLastScanned(code);
            onScanRef.current(code);

            if (!continuous) {
              stopScanner();
              setOpen(false);
            }
            return;
          }

          if (err && typeof err === "object") {
            const name =
              "name" in err && typeof err.name === "string"
                ? err.name
                : err.constructor?.name ?? "";

            if (!TRANSIENT_ZXING_ERRORS.has(name)) {
              console.warn("ZXing scanner frame error:", err);
            }
          }
        };

        const controls = activeDeviceId
          ? await reader.decodeFromVideoDevice(
              activeDeviceId,
              videoElement,
              handleDecode
            )
          : await reader.decodeFromConstraints(
              { video: { facingMode: { ideal: "environment" } } },
              videoElement,
              handleDecode
            );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? `Could not start camera scanner: ${err.message}`
            : "Could not start camera scanner. Please check camera permissions.";
        setCameraError(message);
        onErrorRef.current?.(message);
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, selectedDeviceId, continuous, cooldownMs, stopScanner]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          setCameraError("");
          setLastScanned("");
          setOpen((prev) => !prev);
        }}
        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
      >
        {open ? "Close camera" : buttonLabel}
      </button>

      {open && (
        <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">ZXing Camera Scanner</p>
              <p className="text-xs text-slate-300">
                Point your camera at a barcode. Detected codes are entered automatically.
              </p>
            </div>

            {devices.length > 1 && (
              <select
                aria-label="Select camera"
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              className="h-56 w-full object-cover"
              muted
              playsInline
            />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-slate-200">
                Starting camera...
              </div>
            )}
          </div>

          {lastScanned && (
            <p className="mt-2 text-xs text-emerald-300">
              Last scanned barcode: <span className="font-mono">{lastScanned}</span>
            </p>
          )}

          {cameraError && (
            <p role="alert" className="mt-2 rounded bg-red-950/80 p-2 text-xs text-red-200">
              {cameraError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
