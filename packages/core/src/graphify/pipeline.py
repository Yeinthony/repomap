#!/usr/bin/env python3
"""Run the graphify pipeline on a code-only repo without any LLM call.

Mirrors the orchestration the /graphify Claude Code skill does, but
restricted to the AST-only path. Runs in seconds, zero LLM cost.

Exit codes:
  0  success — <out>/{graph.json, GRAPH_REPORT.md} written
  2  repo contains non-code files (docs/papers/images) — caller should fall
     back to the /graphify skill so they get semantic extraction
  3  no code files detected
  4  graph is empty after extraction
  1  any other failure
"""
import argparse
import json
import sys
from pathlib import Path

try:
    from graphify.detect import detect
    from graphify.extract import collect_files, extract
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.report import generate
    from graphify.export import to_json
except ImportError as e:
    print(f"IMPORT_ERROR: {e}", file=sys.stderr)
    sys.exit(1)


def run(repo_path: str, out_dir: str | None) -> int:
    repo = Path(repo_path).resolve()
    out = Path(out_dir).resolve() if out_dir else repo / "graphify-out"
    out.mkdir(parents=True, exist_ok=True)

    detection = detect(repo)
    (out / ".graphify_detect.json").write_text(
        json.dumps(detection, ensure_ascii=False), encoding="utf-8"
    )

    files_by_kind = detection.get("files", {})
    non_code = sum(
        len(files_by_kind.get(k, [])) for k in ("docs", "papers", "images", "video")
    )
    if non_code > 0:
        print(
            f"NON_CODE_FILES_PRESENT: {non_code} non-code files require semantic extraction",
            file=sys.stderr,
        )
        return 2

    code_files: list[Path] = []
    for f in files_by_kind.get("code", []):
        p = Path(f)
        code_files.extend(collect_files(p) if p.is_dir() else [p])

    if not code_files:
        print("NO_CODE_FILES", file=sys.stderr)
        return 3

    # Cache lives next to the graph so re-runs are fast and the analyzed
    # repo stays clean.
    extraction = extract(code_files, cache_root=out)
    G = build_from_json(extraction)

    if G.number_of_nodes() == 0:
        print("EMPTY_GRAPH", file=sys.stderr)
        return 4

    communities = cluster(G)
    cohesion = score_all(G, communities)
    tokens = {"input": 0, "output": 0}
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    labels = {cid: f"Community {cid}" for cid in communities}
    questions = suggest_questions(G, communities, labels)

    report = generate(
        G, communities, cohesion, labels, gods, surprises,
        detection, tokens, str(repo), suggested_questions=questions,
    )
    (out / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(G, communities, str(out / "graph.json"))

    print(
        f"OK: {G.number_of_nodes()} nodes, "
        f"{G.number_of_edges()} edges, "
        f"{len(communities)} communities"
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="repomap graphify pipeline (AST-only)")
    parser.add_argument("repo_path", help="Repo to analyze")
    parser.add_argument("--out", dest="out_dir", default=None,
                        help="Output directory for graphify artifacts. "
                             "Defaults to <repo>/graphify-out (legacy).")
    args = parser.parse_args()
    try:
        sys.exit(run(args.repo_path, args.out_dir))
    except Exception as e:
        print(f"PIPELINE_ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
