export function ComplaintViewer({ url }: { url: string | null }) {
  return (
    <section aria-labelledby="complaint-heading" className="card space-y-4 p-6 sm:p-8">
      <h2 id="complaint-heading" className="text-2xl font-bold">Complaint</h2>
      {!url ? (
        <p className="text-sm text-muted">The complaint document isn&apos;t available yet. Check the source docket below.</p>
      ) : (
        <>
          <object
            data={url}
            type="application/pdf"
            aria-label="Complaint PDF"
            className="hidden h-[70vh] w-full rounded-2xl border border-border bg-surface-muted sm:block"
          >
            <p className="p-4 text-sm">
              Your browser can&apos;t show the PDF here.{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="link">Open the complaint PDF</a>.
            </p>
          </object>
          <p className="text-sm">
            <a href={url} target="_blank" rel="noopener noreferrer" download className="btn-secondary">
              Open or download complaint (PDF)
            </a>
          </p>
        </>
      )}
    </section>
  );
}
