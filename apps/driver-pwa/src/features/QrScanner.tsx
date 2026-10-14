"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, QrCode, ScanLine, X } from "lucide-react";
import { extractSiteCode } from "./qr";

type Barcode = { rawValue: string };
type Detector = { detect(source: ImageBitmapSource): Promise<Barcode[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export function QrScanner({
  expectedCode,
  verified,
  onVerified,
}: {
  expectedCode: string;
  verified: boolean;
  onVerified: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");

  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
  };

  useEffect(() => stop, []);

  const verify = (value: string) => {
    if (extractSiteCode(value) !== expectedCode.toUpperCase()) {
      setError(`This code does not match ${expectedCode}.`);
      return false;
    }
    setError("");
    onVerified();
    stop();
    return true;
  };

  const start = async () => {
    setError("");
    const DetectorApi = (
      window as typeof window & { BarcodeDetector?: DetectorConstructor }
    ).BarcodeDetector;
    if (!DetectorApi) {
      setOpen(true);
      setError("Live QR scanning is unavailable in this browser. Enter the site code below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
      const detector = new DetectorApi({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue && verify(codes[0].rawValue)) return;
        } catch {}
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch {
      setOpen(true);
      setError("Camera permission is required for live scanning. Enter the site code below instead.");
    }
  };

  if (verified) {
    return (
      <div className="qr-verified">
        <CheckCircle2 />
        <span><b>Site QR verified</b><small>{expectedCode}</small></span>
      </div>
    );
  }

  return (
    <div className="qr-scanner">
      <button className="qr-start" type="button" onClick={() => void start()}>
        <ScanLine /> Scan site QR
      </button>
      {open ? (
        <div className="qr-panel">
          <div className="qr-panel-head">
            <span><QrCode /> Verify {expectedCode}</span>
            <button type="button" onClick={stop} aria-label="Close QR scanner"><X /></button>
          </div>
          <video ref={videoRef} muted playsInline aria-label="QR scanner camera preview" />
          {error ? <p className="qr-error">{error}</p> : <p>Point the camera at the site QR code.</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              verify(manualCode);
            }}
          >
            <label htmlFor="manual-site-code">Manual site code</label>
            <div>
              <input
                id="manual-site-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={expectedCode}
                autoCapitalize="characters"
              />
              <button type="submit" disabled={!manualCode.trim()}>Verify</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
