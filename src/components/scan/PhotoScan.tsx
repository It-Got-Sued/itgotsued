"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandDetection } from "@/lib/types";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";
import { downscaleImage } from "./downscale";
import { IconCamera } from "../icons";

export function PhotoScan({ onDetections }: { onDetections: (d: BrandDetection[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const previewRef = useRef<string | null>(null);

  function showPreview(f: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
  }

  // Release the object URL when the component unmounts.
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setNote(null);
    if (f && !f.type.startsWith("image/") && f.type !== "") {
      setError("Please choose an image file.");
      return;
    }
    setFile(f);
    showPreview(f);
  }

  function clear() {
    setFile(null);
    showPreview(null);
    setNote(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function scan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const blob = await downscaleImage(file);
      const form = new FormData();
      const name = blob.type === "image/jpeg" ? "photo.jpg" : file.name;
      form.append("image", blob, name);
      const { detections } = await apiFetch<{ detections: BrandDetection[] }>("/api/detect/image", {
        method: "POST",
        body: form,
      });
      if (!detections.length)
        setNote("No brands spotted. Try a closer, well-lit photo where labels face the camera.");
      onDetections(detections);
    } catch (err) {
      setError(messageFor(err, "Photo scanning"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p id="own-photo-hint" className="text-sm text-muted">
        Snap a shelf, pantry, bathroom counter, or room. We spot brand labels, then you confirm
        them. Photos are processed in memory and never stored.
      </p>
      {!preview ? (
        <label
          htmlFor="own-photo"
          className="group relative flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-pink-500/40 bg-gradient-to-br from-pink-500/[0.06] to-orange-400/[0.08] p-6 text-center transition-all duration-300 hover:border-pink-500/70 hover:from-pink-500/10 hover:to-orange-400/15"
        >
          <span className="grid h-14 w-14 animate-float place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-orange-400 text-white shadow-lift transition-transform group-hover:scale-110">
            <IconCamera size={26} />
          </span>
          <span className="font-semibold">Take or upload a photo</span>
          <span className="text-xs text-muted">JPEG, PNG or WebP</span>
        </label>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="relative overflow-hidden rounded-2xl border border-border shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img
              src={preview}
              alt="Preview of the photo you selected"
              className="max-h-64 w-auto object-contain"
            />
            {busy && (
              <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-pink-500/10 to-violet-500/10">
                <div className="absolute inset-x-0 h-1 animate-scan-line bg-gradient-to-r from-transparent via-pink-400 to-transparent shadow-[0_0_24px_6px_rgba(236,72,153,0.55)]" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={scan} disabled={busy}>
              Scan photo
            </button>
            <button type="button" className="btn-secondary" onClick={clear} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        id="own-photo"
        type="file"
        accept="image/*"
        capture="environment"
        aria-describedby="own-photo-hint"
        aria-label="Take or upload a photo"
        onChange={onPick}
        className="sr-only"
      />
      {busy && <Spinner label="Looking for brands…" />}
      {error && <Alert>{error}</Alert>}
      {note && <Alert tone="info">{note}</Alert>}
    </div>
  );
}
