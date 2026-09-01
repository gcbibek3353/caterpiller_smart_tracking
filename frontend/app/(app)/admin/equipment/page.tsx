"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Equipment, EquipmentStatus, EquipmentType, Paginated } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { Drawer } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";

const TYPES: EquipmentType[] = [
  "EXCAVATOR", "CRANE", "BULLDOZER", "GRADER",
  "LOADER", "BACKHOE", "DUMP_TRUCK", "COMPACTOR", "FORKLIFT",
];

/**
 * RETIRED is deliberately absent from the editor's status list.
 *
 * Retiring goes through DELETE, which refuses a machine with active or
 * upcoming bookings. Offering RETIRED here would route around that guard and
 * strand a checked-out machine with no way to check it back in.
 */
const EDITABLE_STATUSES: EquipmentStatus[] = ["AVAILABLE", "RESERVED", "CHECKED_OUT", "MAINTENANCE"];
const FILTER_STATUSES: (EquipmentStatus | "")[] = ["", ...EDITABLE_STATUSES, "RETIRED"];

const PAGE_SIZE = 50;

export default function AdminEquipmentPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<EquipmentType | "">("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const [page, setPage] = useState(1);

  /** `null` = closed, `"new"` = create, an Equipment = edit that machine. */
  const [editing, setEditing] = useState<Equipment | "new" | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fleet = useApi<Paginated<Equipment>>("/api/equipment", {
    page,
    limit: PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(type ? { type } : {}),
    // No status filter means the API hides RETIRED. That is the right default
    // for a fleet list; picking "Retired" is how you go looking for one.
    ...(status ? { status } : {}),
  });

  const items = fleet.data?.items ?? [];
  const pages = fleet.data?.pages ?? 1;

  /** Retire (soft delete) or bring one back. Both are single PATCH/DELETE calls. */
  async function setRetired(machine: Equipment, retired: boolean) {
    setBusyId(machine.id);
    setRowError(null);
    try {
      if (retired) await api.delete(`/api/equipment/${machine.id}`);
      else await api.patch(`/api/equipment/${machine.id}`, { status: "AVAILABLE" });
      await fleet.refetch();
    } catch (e) {
      setRowError({
        id: machine.id,
        message: e instanceof ApiError ? e.message : "Could not update this machine",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-stamp-sm text-hivis">Fleet</p>
          <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
            Equipment
          </h1>
          <p className="mt-2 text-note text-mute">
            {fleet.data ? `${fleet.data.total} machine${fleet.data.total === 1 ? "" : "s"}` : "…"}
            {status ? ` · ${status.replace(/_/g, " ").toLowerCase()}` : " · retired hidden"}
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Add machine</Button>
      </header>

      <Plate title="Filter" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Search"
            name="q"
            placeholder="EXC-0007, excavator, CAT…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Type"
            name="type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as EquipmentType | "");
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </Select>
          <Select
            label="Status"
            name="status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EquipmentStatus | "");
              setPage(1);
            }}
          >
            {FILTER_STATUSES.map((s) => (
              <option key={s} value={s}>{s === "" ? "Active (hides retired)" : s.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </div>
      </Plate>

      {fleet.error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">
          {fleet.error.message}
        </p>
      ) : fleet.loading ? (
        <p className="stamp text-stamp text-mute">Reading the fleet…</p>
      ) : items.length === 0 ? (
        <Plate title="Equipment" meta="0 matching">
          <p className="text-body text-steel">
            Nothing matches these filters. Clear the search, or add the first machine.
          </p>
        </Plate>
      ) : (
        <>
          <div className="overflow-x-auto rounded-plate border border-line bg-plate">
            <table className="w-full text-left text-body">
              <thead>
                <tr className="stamp border-b border-line text-stamp-sm text-mute">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Daily</th>
                  <th className="px-4 py-3 text-right">Meter hrs</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-4 py-3 font-mono text-data">
                      <Link href={`/asset/${e.id}`} className="text-ink underline-offset-4 hover:text-hivis hover:underline">
                        {e.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-display text-title-sm font-semibold uppercase leading-none">{e.name}</p>
                      <p className="mt-1 text-note text-mute">
                        {[e.make, e.model, e.year].filter(Boolean).join(" ") || "—"}
                      </p>
                      {rowError?.id === e.id ? (
                        <p className="mt-1 text-note text-alert">{rowError.message}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-data-sm text-mute">{e.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3"><StatusPill status={e.status} /></td>
                    <td className="px-4 py-3 text-right font-mono text-data">${e.dailyRate.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-data text-mute">
                      {e.meterHours.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-stamp-sm"
                          onClick={() => setEditing(e)}
                        >
                          Edit
                        </Button>
                        {e.status === "RETIRED" ? (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-stamp-sm"
                            loading={busyId === e.id}
                            onClick={() => setRetired(e, false)}
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-stamp-sm"
                            loading={busyId === e.id}
                            onClick={() => setRetired(e, true)}
                          >
                            Retire
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="stamp text-stamp-sm text-mute">Page {page} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      {editing ? (
        <EquipmentEditor
          machine={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await fleet.refetch();
          }}
        />
      ) : null}
    </>
  );
}

// ── The create / edit drawer ─────────────────────────────────────────

/** Form state is all strings — that is what inputs give you. Coerced on submit. */
type FormState = Record<string, string>;

const toForm = (m: Equipment | null): FormState => ({
  code: m?.code ?? "",
  name: m?.name ?? "",
  type: m?.type ?? "EXCAVATOR",
  status: m && EDITABLE_STATUSES.includes(m.status) ? m.status : "AVAILABLE",
  make: m?.make ?? "",
  model: m?.model ?? "",
  year: m?.year != null ? String(m.year) : "",
  dailyRate: m ? String(m.dailyRate) : "",
  hourlyRate: m?.hourlyRate != null ? String(m.hourlyRate) : "",
  meterHours: m ? String(m.meterHours) : "0",
  fuelCapacityL: m ? String(m.fuelCapacityL) : "300",
  homeLat: m ? String(m.homeLat) : "",
  homeLng: m ? String(m.homeLng) : "",
  imageUrl: m?.imageUrl ?? "",
  notes: m?.notes ?? "",
});

/**
 * Fields where an empty box means "not set" rather than "set to empty".
 *
 * `year` coerces "" to 0 and fails min(1950); `imageUrl` fails `.url()`. Both
 * have to be dropped from the payload instead of sent blank. Prose fields are
 * not in this list, so clearing a note actually clears it.
 */
const OMIT_WHEN_BLANK = new Set(["year", "hourlyRate", "imageUrl"]);
const NUMERIC = new Set(["year", "dailyRate", "hourlyRate", "meterHours", "fuelCapacityL", "homeLat", "homeLng"]);

function EquipmentEditor({
  machine,
  onClose,
  onSaved,
}: {
  machine: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(machine));
  /** What the drawer opened with, so an edit can send only what actually moved. */
  const [initial] = useState<FormState>(() => toForm(machine));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload: Record<string, string | number> = {};
    for (const [k, raw] of Object.entries(form)) {
      const v = raw.trim();
      /**
       * An edit sends only what moved.
       *
       * Not just tidiness: RETIRED is not in the status select, so `toForm`
       * shows a retired machine as AVAILABLE. Sending every field would then
       * quietly reactivate it the moment someone opened Edit to fix a typo —
       * routing around the very guard that keeps Retire honest. It also stops
       * an unchanged `code` being rewritten through a unique index for nothing.
       */
      if (machine && v === initial[k]) continue;
      if (v === "" && OMIT_WHEN_BLANK.has(k)) continue;
      if (v === "" && NUMERIC.has(k)) continue;
      payload[k] = NUMERIC.has(k) ? Number(v) : v;
    }

    // PATCH refuses an empty body, and "I changed nothing" is not an error.
    if (machine && Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    try {
      if (machine) await api.patch(`/api/equipment/${machine.id}`, payload);
      else await api.post("/api/equipment", payload);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setError(String(e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={machine ? `Edit ${machine.code}` : "Add machine"}
      meta={machine ? machine.type.replace(/_/g, " ") : "New"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-5">
        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Identity</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Code" name="code" value={form.code} onChange={set("code")}
              required error={fieldErrors.code} hint="A–Z, 0–9 and dashes"
            />
            <Select label="Type" name="type" value={form.type} onChange={set("type")} error={fieldErrors.type}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <Field label="Name" name="name" value={form.name} onChange={set("name")} required error={fieldErrors.name} />
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Build</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Make" name="make" value={form.make} onChange={set("make")} error={fieldErrors.make} />
            <Field label="Model" name="model" value={form.model} onChange={set("model")} error={fieldErrors.model} />
            <Field label="Year" name="year" type="number" value={form.year} onChange={set("year")} error={fieldErrors.year} />
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Rates</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Daily rate" name="dailyRate" type="number" step="0.01" min="0"
              value={form.dailyRate} onChange={set("dailyRate")} required error={fieldErrors.dailyRate}
            />
            <Field
              label="Hourly rate" name="hourlyRate" type="number" step="0.01" min="0"
              value={form.hourlyRate} onChange={set("hourlyRate")} error={fieldErrors.hourlyRate}
              hint="Optional — billing runs on days"
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Operating</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Status" name="status" value={form.status} onChange={set("status")} error={fieldErrors.status}>
              {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            <Field
              label="Meter hours" name="meterHours" type="number" step="0.1" min="0"
              value={form.meterHours} onChange={set("meterHours")} error={fieldErrors.meterHours}
            />
            <Field
              label="Fuel cap. (L)" name="fuelCapacityL" type="number" min="1"
              value={form.fuelCapacityL} onChange={set("fuelCapacityL")} error={fieldErrors.fuelCapacityL}
            />
          </div>
          <p className="text-note text-mute">
            Retiring is not a status here — use Retire in the table, which refuses a machine that
            still has active or upcoming bookings.
          </p>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Home position</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Latitude" name="homeLat" type="number" step="any"
              value={form.homeLat} onChange={set("homeLat")} required error={fieldErrors.homeLat}
            />
            <Field
              label="Longitude" name="homeLng" type="number" step="any"
              value={form.homeLng} onChange={set("homeLng")} required error={fieldErrors.homeLng}
            />
          </div>
          <p className="text-note text-mute">
            Where the machine sits when it is not on hire. The geofence detector measures against
            the booking&apos;s site, not this.
          </p>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="stamp mb-1 text-stamp-sm text-mute">Media &amp; notes</legend>
          <Field
            label="Image URL" name="imageUrl" type="url" placeholder="https://…"
            value={form.imageUrl} onChange={set("imageUrl")} error={fieldErrors.imageUrl}
            hint="A link — there is no upload endpoint"
          />
          <TextArea label="Notes" name="notes" rows={3} value={form.notes} onChange={set("notes")} error={fieldErrors.notes} />
        </fieldset>

        {error ? (
          <p className="rounded-plate border border-alert/40 bg-alert/8 p-3 text-note text-alert">{error}</p>
        ) : null}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-plate px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{machine ? "Save changes" : "Create machine"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
