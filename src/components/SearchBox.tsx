import Form from "next/form";

export function SearchBox({ defaultValue }: { defaultValue?: string }) {
  return (
    <Form action="/cases" role="search" className="flex gap-2">
      <label htmlFor="site-search" className="sr-only">
        Search lawsuits by company, product, or case name
      </label>
      <input
        id="site-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search a company, product, or case"
        className="input"
      />
      <button type="submit" className="btn-primary shrink-0">
        Search
      </button>
    </Form>
  );
}
