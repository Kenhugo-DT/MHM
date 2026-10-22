"""Learn cautious research priorities from human-reviewed candidate outcomes."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

FINAL_STATUSES = {"approved", "imported", "rejected"}
SOURCE_OR_IDENTITY_REASONS = {
    "duplicate", "wrong_entity", "weak_source", "weak_connection", "incorrect_fact"
}
PAGE_SIZE = 250
MIN_GROUP_WEIGHT = 4.0


def normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().replace("_", " ").split())


def node_kind(node: dict[str, Any]) -> str:
    roles = {normalize(role) for role in node.get("roles", [])}
    metadata = {normalize(item) for item in node.get("metadata", [])}
    if node.get("type") == "artist" and "guitarist" in roles | metadata:
        return "guitarist"
    return str(node.get("type", ""))


def graph_seed_index(graph: dict[str, Any]) -> dict[tuple[str, str], str]:
    index = {}
    for node in graph.get("nodes", []):
        kind = node_kind(node)
        for label in [node.get("label"), *(node.get("aliases") or [])]:
            if label:
                index[(normalize(label), kind)] = str(node.get("zone") or "")
    return index


def fetch_review_rows(client: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = list(
            client.table("research_candidates")
            .select("*")
            .in_("status", sorted(FINAL_STATUSES))
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data or []
        )
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def prepare_decisions(rows: list[dict[str, Any]], graph: dict[str, Any]) -> tuple[list[dict[str, Any]], Counter[str]]:
    index = graph_seed_index(graph)
    skipped: Counter[str] = Counter()
    decisions = []
    for row in rows:
        status = str(row.get("status") or "")
        payload = row.get("payload") or {}
        kind = str(row.get("requested_kind") or "")
        name = str(row.get("seed_name") or "")
        if status not in FINAL_STATUSES or not kind or not name:
            skipped["not_a_decision"] += 1
            continue
        if payload.get("kind") == "typed_connection":
            skipped["connection_review"] += 1
            continue

        zone = index.get((normalize(name), kind)) or ""
        reason = str(row.get("review_reason_code") or "").strip()
        legacy_reason = normalize(row.get("reason"))
        duplicate = reason == "duplicate" or any(
            phrase in legacy_reason for phrase in ("duplicate", "already in graph", "existing node")
        )
        if status == "rejected" and (reason in SOURCE_OR_IDENTITY_REASONS or duplicate):
            skipped["rejection_not_about_frontier"] += 1
            continue

        weight = 1.0 if status != "rejected" or reason else 0.2
        decisions.append({
            "id": str(row.get("id") or ""),
            "seedKey": f"{kind}:{normalize(name)}",
            "status": status,
            "positive": status in {"approved", "imported"},
            "kind": kind,
            "zone": zone,
            "reasonCode": reason or "unspecified",
            "weight": weight,
            "reviewedAt": str(row.get("updated_at") or row.get("created_at") or ""),
        })
    decisions.sort(key=lambda item: (item["reviewedAt"], item["id"]))
    seed_weights: Counter[str] = Counter()
    for decision in decisions:
        seed_weights[decision["seedKey"]] += decision["weight"]
    for decision in decisions:
        decision["learningWeight"] = decision["weight"] / seed_weights[decision["seedKey"]]
    return decisions, skipped


def counts_for(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, dict[str, list[dict[str, Any]]]] = {
        "kind": defaultdict(list), "zone": defaultdict(list)
    }
    for decision in decisions:
        groups["kind"][decision["kind"]].append(decision)
        if decision["zone"]:
            groups["zone"][decision["zone"]].append(decision)

    def summary(items: list[dict[str, Any]]) -> dict[str, Any]:
        positive = sum(item["learningWeight"] for item in items if item["positive"])
        negative = sum(item["learningWeight"] for item in items if not item["positive"])
        return {
            "approved": sum(item["positive"] for item in items),
            "rejected": sum(not item["positive"] for item in items),
            "positiveWeight": round(positive, 3),
            "negativeWeight": round(negative, 3),
            "examples": [item["id"] for item in items[-4:] if item["id"]],
        }

    return {
        "overall": summary(decisions),
        "kind": {key: summary(value) for key, value in sorted(groups["kind"].items())},
        "zone": {key: summary(value) for key, value in sorted(groups["zone"].items())},
    }


def posterior(group: dict[str, Any]) -> float:
    positive = group["positiveWeight"]
    negative = group["negativeWeight"]
    return (positive + 2) / (positive + negative + 4)


def group_adjustment(group: dict[str, Any] | None, baseline: float) -> float:
    if not group:
        return 0.0
    weight = group["positiveWeight"] + group["negativeWeight"]
    if weight < MIN_GROUP_WEIGHT:
        return 0.0
    return max(-4.0, min(4.0, (posterior(group) - baseline) * 16 * weight / (weight + 8)))


def priority_adjustment(model: dict[str, Any], kind: str, zone: str) -> dict[str, Any]:
    stats = model["training"]
    baseline = posterior(stats["overall"])
    parts = []
    total = 0.0
    for dimension, value in (("kind", kind), ("zone", zone)):
        group = stats[dimension].get(value)
        delta = group_adjustment(group, baseline)
        if group and delta:
            parts.append({
                "feature": f"{dimension}:{value}",
                "score": round(delta, 2),
                "approved": group["approved"],
                "rejected": group["rejected"],
                "reviewExamples": group["examples"],
            })
            total += delta
    return {"score": round(max(-6.0, min(6.0, total)), 2), "reasons": parts}


def evaluate(train: list[dict[str, Any]], holdout: list[dict[str, Any]]) -> dict[str, Any]:
    stats = counts_for(train)
    model = {"training": stats}
    baseline = posterior(stats["overall"])
    base_error = 0.0
    learned_error = 0.0
    total_weight = 0.0
    for item in holdout:
        target = 1.0 if item["positive"] else 0.0
        adjustment = priority_adjustment(model, item["kind"], item["zone"])["score"]
        predicted = max(0.05, min(0.95, baseline + adjustment / 16))
        base_error += item["learningWeight"] * (baseline - target) ** 2
        learned_error += item["learningWeight"] * (predicted - target) ** 2
        total_weight += item["learningWeight"]
    return {
        "holdoutCount": len(holdout),
        "holdoutApproved": sum(item["positive"] for item in holdout),
        "holdoutRejected": sum(not item["positive"] for item in holdout),
        "baselineBrier": round(base_error / total_weight, 4),
        "learnedBrier": round(learned_error / total_weight, 4),
    }


def split_independent_seeds(decisions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if len(decisions) < 20:
        return decisions, []

    by_seed: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for decision in decisions:
        by_seed[decision["seedKey"]].append(decision)
    if len(by_seed) < 2:
        return decisions, []

    # Keep every review of a seed on one side, so validation tests unseen seeds.
    seeds = sorted(by_seed, key=lambda key: (by_seed[key][-1]["reviewedAt"], key))
    holdout_keys: set[str] = set()
    holdout_size = 0
    target = max(4, round(len(decisions) * 0.2))
    for key in reversed(seeds[1:]):
        if holdout_size >= target and len(holdout_keys) >= 4:
            break
        holdout_keys.add(key)
        holdout_size += len(by_seed[key])
    return (
        [item for item in decisions if item["seedKey"] not in holdout_keys],
        [item for item in decisions if item["seedKey"] in holdout_keys],
    )


def build_learning_model(rows: list[dict[str, Any]], graph: dict[str, Any]) -> dict[str, Any]:
    decisions, skipped = prepare_decisions(rows, graph)
    all_rejection_reasons = Counter(
        str(row.get("review_reason_code") or "unspecified").strip()
        for row in rows if row.get("status") == "rejected"
    )
    train, holdout = split_independent_seeds(decisions)
    training_seeds = {item["seedKey"] for item in train}
    holdout_seeds = {item["seedKey"] for item in holdout}
    validation = evaluate(train, holdout) if holdout else {
        "holdoutCount": 0, "holdoutApproved": 0, "holdoutRejected": 0,
    }
    validation.update({
        "trainingSeedCount": len(training_seeds),
        "holdoutSeedCount": len(holdout_seeds),
        "sharedSeedCount": len(training_seeds & holdout_seeds),
        "holdoutApprovedSeedCount": len({
            item["seedKey"] for item in holdout if item["positive"]
        }),
        "holdoutRejectedSeedCount": len({
            item["seedKey"] for item in holdout if not item["positive"]
        }),
    })
    clear_rejections = sum(
        not item["positive"] and item["reasonCode"] != "unspecified"
        for item in decisions
    )
    explicit_rejection_seeds = len({
        item["seedKey"] for item in decisions
        if not item["positive"] and item["reasonCode"] != "unspecified"
    })
    eligibility_checks = {
        "enoughTrainingDecisions": len(train) >= 40,
        "enoughIndependentSeeds": len(training_seeds) >= 8 and len(holdout_seeds) >= 4,
        "enoughExplicitRejections": clear_rejections >= 10,
        "enoughIndependentRejections": explicit_rejection_seeds >= 4,
        "enoughHoldoutDecisions": len(holdout) >= 8,
        "holdoutHasBothOutcomes": (
            validation["holdoutApproved"] >= 3 and validation["holdoutRejected"] >= 3
            and validation["holdoutApprovedSeedCount"] >= 2
            and validation["holdoutRejectedSeedCount"] >= 2
        ),
        "beatsBaseline": bool(holdout) and (
            validation["learnedBrier"] + 0.01 < validation["baselineBrier"]
        ),
    }
    eligible = all(eligibility_checks.values())
    return {
        "version": 1,
        "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source": "human research candidate reviews",
        "reviewedRows": len(rows),
        "usableDecisions": len(decisions),
        "clearRejections": clear_rejections,
        "explicitRejectionSeedCount": explicit_rejection_seeds,
        "rejectionReasons": dict(Counter(
            item["reasonCode"] for item in decisions if not item["positive"]
        )),
        "allRejectionReasons": dict(sorted(all_rejection_reasons.items())),
        "skipped": dict(skipped),
        "training": counts_for(train),
        "validation": validation,
        "eligibilityChecks": eligibility_checks,
        "activationEligible": eligible,
        "policy": "Ranking activates only after validation and durable storage. Reviews and publication stay manual.",
    }


def save_snapshot(client: Any, model: dict[str, Any], mode: str) -> None:
    client.table("research_learning_snapshots").insert({
        "mode": mode,
        "decision_count": model["usableDecisions"],
        "model": model,
    }).execute()
