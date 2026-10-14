export const SAUDI_TIME_ZONE = "Asia/Riyadh";

export type EvidenceCoordinates = {
  latitude: number;
  longitude: number;
};

export type EvidenceStamp = EvidenceCoordinates & {
  capturedAt: string;
  siteCode: string;
  language?: "en" | "ar";
};

export type CapturedPhoto = EvidenceStamp & {
  evidenceUid: string;
  original: File;
  stamped: File;
  previewUrl: string;
};

export function formatSaudiTimestamp(
  value: string | Date,
  language: "en" | "ar" = "en",
) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error("Invalid capture timestamp.");
  return new Intl.DateTimeFormat(
    language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB",
    {
    timeZone: SAUDI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    },
  ).format(date);
}

export function buildStampLines(stamp: EvidenceStamp) {
  if (stamp.language === "ar") {
    return [
      "DMC · 10 Billion Steps",
      `الموقع: ${stamp.siteCode}`,
      `الالتقاط: ${formatSaudiTimestamp(stamp.capturedAt, "ar")} بتوقيت السعودية (UTC+3)`,
      `GPS: ${stamp.latitude.toFixed(6)}, ${stamp.longitude.toFixed(6)}`,
    ];
  }
  return [
    "DMC · 10 Billion Steps",
    `Site: ${stamp.siteCode}`,
    `Captured: ${formatSaudiTimestamp(stamp.capturedAt)} AST (UTC+3)`,
    `GPS: ${stamp.latitude.toFixed(6)}, ${stamp.longitude.toFixed(6)}`,
  ];
}

export function buildEvidenceObjectPaths(
  organizationId: string,
  siteId: string,
  attemptId: string,
  evidenceUid: string,
  originalExtension: string,
  stampedExtension: string,
) {
  const base = `${organizationId}/${siteId}/${attemptId}/${evidenceUid}`;
  return {
    original: `${base}/original.${originalExtension}`,
    stamped: `${base}/stamped.${stampedExtension}`,
  };
}

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function loadDrawable(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        image: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through for older iOS browsers.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return {
    image: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

export async function stampEvidencePhoto(file: File, stamp: EvidenceStamp) {
  const drawable = await loadDrawable(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = drawable.width;
    canvas.height = drawable.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare photo evidence.");

    context.drawImage(drawable.image, 0, 0, canvas.width, canvas.height);
    const lines = buildStampLines(stamp);
    const shortestSide = Math.min(canvas.width, canvas.height);
    const fontSize = Math.max(20, Math.round(shortestSide * 0.032));
    const lineHeight = Math.round(fontSize * 1.35);
    const padding = Math.max(18, Math.round(fontSize * 0.85));
    const overlayHeight = lines.length * lineHeight + padding * 2;
    const overlayTop = Math.max(0, canvas.height - overlayHeight);

    context.fillStyle = "rgba(5, 24, 39, 0.82)";
    context.fillRect(0, overlayTop, canvas.width, canvas.height - overlayTop);
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    context.fillStyle = "#ffffff";
    context.textBaseline = "top";
    context.direction = stamp.language === "ar" ? "rtl" : "ltr";
    context.textAlign = stamp.language === "ar" ? "right" : "left";
    const textX = stamp.language === "ar" ? canvas.width - padding : padding;
    lines.forEach((line, index) => {
      context.fillText(line, textX, overlayTop + padding + index * lineHeight);
    });

    const outputType = ["image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    )
      ? file.type
      : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("Photo stamping failed.")),
        outputType,
        outputType === "image/png" ? undefined : 0.95,
      );
    });
    const extension = extensionForMime(outputType);
    return new File([blob], `evidence-stamped.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
  } finally {
    drawable.release();
  }
}

export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function fileExtension(file: File) {
  return extensionForMime(file.type);
}
