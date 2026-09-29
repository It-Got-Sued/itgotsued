/** Soft, slowly drifting color blobs behind every page. Pure CSS, no JS. */
export function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--aurora-opacity)" }}
    >
      <div className="absolute -left-[10%] -top-[20%] h-[60vmax] w-[60vmax] animate-aurora rounded-full bg-g1/40 blur-[100px]" />
      <div
        className="absolute -right-[15%] top-[10%] h-[50vmax] w-[50vmax] animate-aurora rounded-full bg-g2/30 blur-[110px]"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="absolute bottom-[-25%] left-[20%] h-[55vmax] w-[55vmax] animate-aurora rounded-full bg-g3/25 blur-[120px]"
        style={{ animationDelay: "-14s" }}
      />
      <div
        className="absolute bottom-[10%] right-[5%] h-[30vmax] w-[30vmax] animate-aurora rounded-full bg-g4/20 blur-[90px]"
        style={{ animationDelay: "-3s" }}
      />
      {/* Fine grain grid for texture */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to bottom, black, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
        }}
      />
    </div>
  );
}
