"use client";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="card space-y-3 p-6">
      <h1 className="text-xl font-bold">Something went wrong loading this page.</h1>
      <p className="text-muted">Please try again. If it keeps happening, the case index may be updating.</p>
      <button type="button" className="btn-primary" onClick={() => retry()}>Try again</button>
    </div>
  );
}
