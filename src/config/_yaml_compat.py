"""Lightweight YAML loader used when PyYAML isn't available.

The project normally depends on :mod:`PyYAML`, but the execution environment
for automated tests doesn't always have the package installed.  Rather than
failing outright we provide a tiny, pure-Python parser that understands the
very small YAML subset used by the repository's configuration files.

This implementation purposefully keeps the feature surface area narrow—it
supports mappings, nested mappings, and simple lists with scalar values.  That
covers files like ``config/dev.yaml`` and ``config/prod.yaml`` without pulling
in additional third-party dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, List, Sequence, Tuple


@dataclass(frozen=True)
class _Line:
    indent: int
    content: str


def _preprocess(stream: str) -> List[_Line]:
    """Convert a YAML string into indentation-aware line objects."""

    processed: List[_Line] = []
    for raw_line in stream.splitlines():
        stripped = raw_line.split("#", 1)[0].rstrip()
        if not stripped:
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        content = stripped.lstrip()
        processed.append(_Line(indent=indent, content=content))

    return processed


def _parse_scalar(value: str) -> Any:
    """Parse a scalar YAML value into an appropriate Python object."""

    lowered = value.lower()
    if lowered in {"null", "~", "none"}:
        return None
    if lowered == "true":
        return True
    if lowered == "false":
        return False

    if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
        return value[1:-1]

    # Try integers before floats to avoid losing precision.
    try:
        return int(value, 10)
    except ValueError:
        pass

    try:
        return float(value)
    except ValueError:
        pass

    return value


def _parse_block(lines: Sequence[_Line], index: int, indent: int) -> Tuple[Any, int]:
    """Parse a block starting at ``index`` with the given ``indent``."""

    if index >= len(lines):
        return {}, index

    current = lines[index]
    if current.indent != indent:
        raise ValueError("Invalid indentation in YAML document")

    if current.content.startswith("- "):
        items: List[Any] = []
        while index < len(lines) and lines[index].indent == indent:
            item_line = lines[index]
            if not item_line.content.startswith("- "):
                break

            remainder = item_line.content[2:].strip()
            index += 1

            # Nested structure under the list item.
            if index < len(lines) and lines[index].indent > indent:
                nested, index = _parse_block(lines, index, indent + 2)
                if remainder:
                    raise ValueError(
                        "Inline values with nested structures are not supported in minimal YAML parser"
                    )
                items.append(nested)
            else:
                items.append(_parse_scalar(remainder))

        return items, index

    mapping: dict[str, Any] = {}
    while index < len(lines) and lines[index].indent == indent:
        line = lines[index]
        if ":" not in line.content:
            raise ValueError("Expected key/value pair in YAML mapping")

        key, raw_value = line.content.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        index += 1

        # Nested block follows the key.
        if not value:
            if index < len(lines) and lines[index].indent > indent:
                mapping[key], index = _parse_block(lines, index, indent + 2)
            else:
                mapping[key] = None
            continue

        mapping[key] = _parse_scalar(value)

    return mapping, index


def safe_load(stream: str) -> Any:
    """Parse ``stream`` using the minimal YAML subset supported here."""

    lines = _preprocess(stream)
    if not lines:
        return {}

    document, index = _parse_block(lines, 0, lines[0].indent)
    if index != len(lines):
        raise ValueError("Unable to parse entire YAML document")
    return document


__all__ = ["safe_load"]
