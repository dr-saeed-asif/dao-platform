"""Render standalone vector and 300-dpi research figures from exported data."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "svg.fonttype": "none", "axes.titleweight": "bold"})


def save(fig, name):
    fig.savefig(ROOT / f"figures/{name}.svg", bbox_inches="tight")
    fig.savefig(ROOT / f"figures/{name}.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def consistency():
    data = json.loads((ROOT / "raw_results/live-verification.json").read_text(encoding="utf-8-sig"))["cases"]
    fig, ax = plt.subplots(figsize=(6.5, 2.8), layout="constrained")
    left = [0] * len(data)
    for key, label, color, hatch in [
        ("verified", "Verified", "#396a93", None), ("mismatched", "Mismatch", "#ab4936", "////"),
        ("unverified", "Unverified", "#dbb45c", "\\\\"),
    ]:
        n = [case.get("counts", {}).get(key, 0) for case in data]
        ax.barh([case["label"].title() for case in data], n, left=left, label=label, color=color, hatch=hatch)
        for y, count in enumerate(n):
            if count:
                ax.text(left[y] + count / 2, y, str(count), ha="center", va="center",
                        color="white" if key != "unverified" else "black", fontsize=8)
        left = [a + b for a, b in zip(left, n)]
    ax.invert_yaxis()
    ax.set(xlabel="Comparison rows", title="Live reconciliation by demo proposal")
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.05), ncol=3, frameon=False)
    save(fig, "live-reconciliation")


def performance(label):
    rows = [json.loads(line) for line in (ROOT / "raw_results" / label / "runs.jsonl").read_text(encoding="utf8").splitlines()]
    if not rows:
        return
    modes = sorted(set(row["mode"] for row in rows))
    fig, ax = plt.subplots(figsize=(7.4, 3.25), layout="constrained")
    for y, mode in enumerate(modes):
        group = [r for r in rows if r["mode"] == mode]
        for i, row in enumerate(group):
            status = row["status"] == "completed"
            ax.scatter(row["wall_ms"] / 1000, y + ((i % 5) - 2) * .075,
                       marker="o" if status else "x", color="#396a93" if status else "#ab4936", s=22)
    ax.set(yticks=range(len(modes)), yticklabels=[m.replace("_", " ") for m in modes],
           xlabel="Wall time per observed attempt (s)", title=f"Pilot response latency ({label})")
    ax.grid(axis="x", alpha=.2)
    ax.plot([], [], "o", color="#396a93", label="Completed")
    ax.plot([], [], "x", color="#ab4936", label="Failed")
    ax.legend(loc="best", frameon=False)
    save(fig, label + "-latency")


def streaming():
    rows = [json.loads(line) for line in (ROOT / "raw_results/http-stream.jsonl").read_text(encoding="utf8").splitlines()]
    fig, ax = plt.subplots(figsize=(6.5, 2.8), layout="constrained")
    for field, label, marker in (("first_section_ms", "First answer section", "o"), ("final_event_ms", "Final SSE event", "s")):
        ax.plot([r["repeat"] for r in rows], [r[field]/1000 for r in rows], marker=marker, label=label)
    ax.set(xticks=[1, 2, 3], xlabel="Repeated request (same DB1 question)", ylabel="Elapsed time (s)",
           title="Operator-authenticated FastAPI streaming")
    ax.grid(axis="y", alpha=.2)
    ax.legend(frameon=False)
    save(fig, "streaming-latency")


if __name__ == "__main__":
    consistency()
    streaming()
    for label in sys.argv[1:]:
        performance(label)
