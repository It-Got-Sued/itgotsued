import Form from "next/form";
import Link from "next/link";
import { CASE_STATUSES } from "@/lib/types";
import { STATUS_INFO } from "./status";
import { US_STATES } from "./format";

export interface FilterValues {
  q: string;
  status: string;
  state: string;
  brand: string;
}

export function CaseFilters({
  values,
  brands,
}: {
  values: FilterValues;
  brands: { normalized: string; name: string }[] | null;
}) {
  return (
    <Form action="/cases" role="search" className="card-glass grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <label htmlFor="f-q" className="mb-1 block text-sm font-medium">Search</label>
        <input id="f-q" name="q" type="search" defaultValue={values.q} className="input" placeholder="Company, product, or case name" />
      </div>
      <div>
        <label htmlFor="f-status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="f-status" name="status" defaultValue={values.status} className="input">
          <option value="">Any status</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_INFO[s].label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-state" className="mb-1 block text-sm font-medium">State</label>
        <select id="f-state" name="state" defaultValue={values.state} className="input">
          <option value="">Any state</option>
          {US_STATES.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-brand" className="mb-1 block text-sm font-medium">Brand</label>
        {brands && brands.length > 0 ? (
          <select id="f-brand" name="brand" defaultValue={values.brand} className="input">
            <option value="">Any brand</option>
            {values.brand && !brands.some((b) => b.normalized === values.brand) && (
              <option value={values.brand}>{values.brand}</option>
            )}
            {brands.map((b) => (
              <option key={b.normalized} value={b.normalized}>{b.name}</option>
            ))}
          </select>
        ) : (
          <input id="f-brand" name="brand" defaultValue={values.brand} className="input" placeholder="e.g. coca-cola" />
        )}
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn-primary flex-1">Apply filters</button>
        <Link href="/cases" className="btn-secondary">Reset</Link>
      </div>
    </Form>
  );
}
