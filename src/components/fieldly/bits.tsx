import { Star } from "lucide-react";
import { useState } from "react";
import { getService } from "@/lib/fieldly/catalog";
import { STATUS_LABEL } from "@/lib/fieldly/i18n";
import { useFieldly } from "@/lib/fieldly/store";
import type { ChatMessage, FieldDef, ServiceDef } from "@/lib/fieldly/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const controlClass =
  "h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-ink outline-none focus-visible:border-ink";

export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-gold" aria-label={`${value} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={size === "lg" ? "size-6" : "size-3.5"} fill={i < full ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const lang = useFieldly((s) => s.lang);
  const label = STATUS_LABEL[lang][status] ?? status;
  const tone =
    status === "PAID" || status === "SERVICE_COMPLETED"
      ? "bg-field-soft text-field"
      : status === "DISPUTED" || status === "CANCELLED"
        ? "bg-danger-soft text-danger"
        : status === "ON_THE_WAY" || status === "ARRIVED" || status === "SERVICE_STARTED"
          ? "bg-gold-soft text-gold"
          : "bg-paper text-ink";
  return <span className={cn("inline-flex rounded-lg px-2 py-1 text-xs font-semibold", tone)}>{label}</span>;
}

export function FieldList({
  service,
  value,
  onChange,
}: {
  service: ServiceDef
  value: Record<string, string>
  onChange: (key: string, next: string) => void
}) {
  return (
    <div className="grid gap-5">
      {service.fields.map((field) => (
        <Field key={field.key} field={field} value={value[field.key] ?? ""} onChange={(v) => onChange(field.key, v)} />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{field.label}</span>
        {field.hint && <span className="text-xs text-muted">{field.hint}</span>}
      </div>
      {field.type === "select" ? (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-2">
          {field.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "h-11 rounded-full border px-3 text-sm font-semibold",
                value === opt ? "border-ink bg-ink text-on-ink" : "border-line bg-card text-ink",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : field.type === "number" ? (
        <span className={controlClass + " flex items-center gap-2"}>
          <input
            inputMode="decimal"
            value={value}
            aria-label={field.label}
            placeholder={"placeholder" in field ? field.placeholder : ""}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
            className="w-full bg-transparent outline-none"
          />
          {field.unit && <span className="text-sm font-semibold text-muted">{field.unit}</span>}
        </span>
      ) : (
        <textarea
          value={value}
          aria-label={field.label}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-28 w-full rounded-xl border border-line bg-card p-3 text-base outline-none focus-visible:border-ink"
        />
      )}
    </div>
  );
}

export function missingFields(service: ServiceDef, value: Record<string, string>, whenLabel: string) {
  const missing = service.fields.filter((f) => f.required && !(value[f.key] ?? "").trim()).map((f) => f.label);
  if (!whenLabel || whenLabel === "Pick a date") missing.push("When the work should happen");
  return missing;
}

export function requirementLines(serviceId: string, req: Record<string, string>) {
  const service = getService(serviceId);
  if (!service) return [];
  return service.fields
    .filter((f) => (req[f.key] ?? "").trim())
    .map((f) => ({
      label: f.label,
      value: f.type === "number" && f.unit ? `${req[f.key]} ${f.unit}` : req[f.key],
    }));
}

export function ChatBox({
  messages,
  onSend,
}: {
  messages: ChatMessage[]
  onSend: (text: string) => void
}) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="max-h-72 space-y-3 overflow-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("max-w-[90%] text-sm", m.from === "customer" ? "ml-auto text-right" : "")}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {m.from === "system" ? "Fieldly" : m.from === "provider" ? "Operator" : "You"}
            </div>
            <p
              className={cn(
                "mt-1 inline-block rounded-2xl px-3 py-2 text-left",
                m.from === "system" ? "bg-paper text-muted" : m.from === "customer" ? "bg-ink text-on-ink" : "bg-field-soft text-ink",
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message about access, timing, or the quote"
          className="h-11 flex-1 rounded-xl border border-line px-3 text-base outline-none focus-visible:border-ink"
        />
        <Button type="submit" variant="secondary">
          Send
        </Button>
      </form>
    </div>
  );
}
