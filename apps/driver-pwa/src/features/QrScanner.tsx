"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, QrCode, ScanLine, X } from "lucide-react";
import { extractSiteCode } from "./qr";
import { driverCopy, type DriverLanguage } from "./i18n";

export function QrScanner({
  expectedCode,
  verified,
  onVerified,
  allowManualFallback = false,
  language = "en",
}: {
  expectedCode: string;
  verified: boolean;
  onVerified: () => void;
  allowManualFallback?: boolean;
  language?: DriverLanguage;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const [open, setOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setOpen(false);
  };

  useEffect(() => stop, []);

  const verify = (value: string) => {
    if (extractSiteCode(value) !== expectedCode.toUpperCase()) {
      setError(`${driverCopy(language, "codeMismatch")} ${expectedCode}.`);
      return false;
    }
    setError("");
    onVerified();
    stop();
    return true;
  };

  const start = async () => {
    setError("");
    try {
      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!videoRef.current) throw new Error("camera_unavailable");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 150,
      });
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current,
        (result) => {
          if (result?.getText()) verify(result.getText());
        },
      );
    } catch {
      setOpen(true);
      setError(driverCopy(language, "cameraRequired"));
    }
  };

  if (verified) {
    return (
      <div className="qr-verified">
        <CheckCircle2 />
        <span><b>{driverCopy(language, "siteQrVerified")}</b><small>{expectedCode}</small></span>
      </div>
    );
  }

  return (
    <div className="qr-scanner">
      <button className="qr-start" type="button" onClick={() => void start()}>
        <ScanLine /> {driverCopy(language, "scanQr")}
      </button>
      {open ? (
        <div className="qr-panel">
          <div className="qr-panel-head">
            <span><QrCode /> Verify {expectedCode}</span>
            <button type="button" onClick={stop} aria-label={driverCopy(language, "closeScanner")}><X /></button>
          </div>
          <video ref={videoRef} muted playsInline aria-label={driverCopy(language, "scanQr")} />
          {error ? <p className="qr-error">{error}</p> : <p>{driverCopy(language, "pointCamera")}</p>}
          {allowManualFallback ? <form
            onSubmit={(event) => {
              event.preventDefault();
              verify(manualCode);
            }}
          >
            <label htmlFor="manual-site-code">{driverCopy(language, "manualCode")}</label>
            <div>
              <input
                id="manual-site-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={expectedCode}
                autoCapitalize="characters"
              />
              <button type="submit" disabled={!manualCode.trim()}>{driverCopy(language, "verify")}</button>
            </div>
          </form> : null}
        </div>
      ) : null}
    </div>
  );
}
