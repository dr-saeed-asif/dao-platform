"use client";

import { useEffect, useState } from "react";

export function CopyValueButton({
  value,
  label = "Copy transaction hash",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
  }

  return (
    <button
      type="button"
      className={copied ? "copy-value-button copied" : "copy-value-button"}
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function CopyableHash({
  value,
  display,
}: {
  value: string;
  display?: string;
}) {
  return (
    <span className="copyable-value">
      <code title={value}>{display ?? value}</code>
      <CopyValueButton value={value} />
    </span>
  );
}
