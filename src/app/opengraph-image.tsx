import { ImageResponse } from "next/og";

// Default social card for every page that does not define its own.
export const alt = "It Got Sued: find class action lawsuits over the stuff you own";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0b0c38",
          color: "#f4f5ff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "12px 28px",
            border: "6px solid #e5322d",
            borderRadius: 16,
            color: "#e5322d",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: 2,
            transform: "rotate(-3deg)",
          }}
        >
          IT GOT SUED
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>Find out if your stuff got sued.</div>
          <div style={{ fontSize: 36, color: "#ffd23f" }}>Every U.S. class action lawsuit, matched to the brands you own.</div>
        </div>
      </div>
    ),
    size,
  );
}
