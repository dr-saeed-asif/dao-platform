"""Exact budget explanations from explicit document allocation tables."""
import re
from decimal import Decimal


def budget_answer(question: str, evidence: list[dict]) -> str | None:
    # Only explain a budget here; other financial questions still use generation.
    if not re.search(r'\b(explain|breakdown|break down|budget|allocations?)\b', question, re.I):
        return None
    if re.search(r'\b(paid|payment|approved|who|when|why|risk|compare|vot\w*|on.chain|spent)\b', question, re.I):
        return None
    for source in evidence:
        content = source.get('content')
        if not isinstance(content, str) or not source.get('source_id', '').startswith('D'):
            continue
        # Extract explicit adjacent label/amount rows, not arbitrary numbers or
        # currencies embedded in prose. No schema or proposal-specific amounts.
        rows = [(m[1].strip(), Decimal(m[2].replace(',', ''))) for m in re.finditer(
            r'(?m)^([^\n]+)\n(?:EUR\s*|€\s*)(\d[\d,]*(?:\.\d+)?)\s*$', content)]
        totals = [(label, amount) for label, amount in rows if re.search(r'\btotal\b', label, re.I)]
        allocations = [(label, amount) for label, amount in rows if not re.search(r'\btotal\b', label, re.I)]
        if len(totals) != 1 or not allocations:
            continue
        total = totals[0][1]
        if sum(amount for _, amount in allocations) != total:
            # A discrepancy needs explanation, never a silently corrected total.
            return None
        def money(value):
            return f'EUR {value:,.0f}' if value == value.to_integral_value() else f'EUR {value:,.2f}'
        cite = f"[{source['source_id']}]"
        parts = [f'The document proposes a total budget of {money(total)}. {cite}',
                 '\n'.join(f'- {money(amount)} for {label[0].lower() + label[1:]}. {cite}' for label, amount in allocations),
                 f"The allocations add up to {money(total)}. {cite}"]
        # Report how each number the user typed relates to the document. Never guess a typo
        # or a relationship between the numbers: unmatched values are asked about, not "corrected".
        typed = [(m[0], Decimal(m[0].replace(',', ''))) for m in re.finditer(r'(?<![\w.])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?', question)]
        lines = []
        for raw, value in typed:
            item = next((label for label, amount in allocations if amount == value), None)
            if value == total:
                lines.append(f'- "{raw}" matches the documented total budget of {money(total)}. {cite}')
            elif item:
                lines.append(f'- "{raw}" matches the documented allocation of {money(value)} for {item[0].lower() + item[1:]}. {cite}')
            else:
                lines.append(f'- "{raw}" does not match the total or any listed allocation in the cited budget. '
                             f'Which amount or budget item do you mean? {cite}')
        if lines:
            note = ' I have not assumed how these amounts relate to each other.' if len(lines) > 1 else ''
            parts.append('Numbers in your question, compared with the cited budget:\n' + '\n'.join(lines) + note)
        return '\n\n'.join(parts)
    return None
