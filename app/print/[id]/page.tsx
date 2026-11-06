"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { LoanForm } from "@/components/loan-form";
import { Button } from "@/components/ui/button";
import type { AppState } from "@/lib/types";

export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/state", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load data");
        return d as AppState;
      })
      .then((d) => alive && setState(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return <p className="p-8 text-sm">{error || "Loading…"}</p>;
  const r = state.db.requests.find((x) => x.id === id);
  if (!r) return <p className="p-8 text-sm">Request not found.</p>;
  const e = state.db.employees.find((x) => x.id === r.employeeId);

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] justify-end gap-2 px-4">
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <div className="mx-auto max-w-[210mm] bg-white shadow print:shadow-none">
        <LoanForm r={r} e={e} settings={state.db.settings} />
      </div>
    </div>
  );
}
