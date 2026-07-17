#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

PROJECT_DIR = Path(__file__).resolve().parents[1]
WORKBOOK_CONFIG = PROJECT_DIR / ".codex" / "workbook-path"
OUTPUT_PATH = PROJECT_DIR / "data" / "energy.json"
SHEET_NAME = "rates and calcs"
START_ROW = 10
END_ROW = 200
START_COL = "N"
END_COL = "V"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_xml(zf: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(zf.read(name).decode("utf-8"))


def col_to_num(col: str) -> int:
    value = 0
    for char in col:
        value = value * 26 + ord(char) - 64
    return value


def num_to_col(num: int) -> str:
    value = ""
    while num:
        num, remainder = divmod(num - 1, 26)
        value = chr(65 + remainder) + value
    return value


def cell_ref_to_col(ref: str) -> str:
    match = re.match(r"([A-Z]+)", ref or "")
    return match.group(1) if match else ""


def parse_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = parse_xml(zf, "xl/sharedStrings.xml")
    except KeyError:
        return []

    strings: list[str] = []
    for item in root.iter():
        if local_name(item.tag) != "si":
            continue
        strings.append(
            "".join(
                (node.text or "")
                for node in item.iter()
                if local_name(node.tag) == "t"
            ).strip()
        )
    return strings


def extract_cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    value = None
    for child in cell:
        if local_name(child.tag) == "v":
            value = (child.text or "").strip()
            break

    if cell_type == "s" and value is not None:
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return ""

    if cell_type == "inlineStr":
        return " ".join("".join(child.itertext()).strip() for child in cell).strip()

    if value is not None:
        return value

    return "".join(cell.itertext()).strip()


def workbook_sheets(zf: zipfile.ZipFile) -> dict[str, str]:
    workbook = parse_xml(zf, "xl/workbook.xml")
    rels = parse_xml(zf, "xl/_rels/workbook.xml.rels")
    rel_map: dict[str, str] = {}

    for rel in rels.iter():
        if local_name(rel.tag) != "Relationship":
            continue
        rid = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        if not rid or not target:
            continue
        rel_map[rid] = target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"

    sheets: dict[str, str] = {}
    rel_ns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    for sheet in workbook.iter():
        if local_name(sheet.tag) != "sheet":
            continue
        name = sheet.attrib.get("name", "").strip().lower()
        rid = sheet.attrib.get(rel_ns) or sheet.attrib.get("r:id")
        if name and rid in rel_map:
            sheets[name] = rel_map[rid]
    return sheets


def parse_number(value: str) -> float | None:
    text = str(value or "").strip()
    if not text or text.lower() == "n/a":
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def excel_date(value: str) -> str:
    number = parse_number(value)
    if number is None:
        return str(value or "").strip()
    return (datetime(1899, 12, 30) + timedelta(days=int(number))).strftime("%Y-%m-%d")


def month_start(value: str) -> str:
    date_value = excel_date(value)
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_value):
        return f"{date_value[:7]}-01"
    return ""


def money(value: str) -> float | None:
    number = parse_number(value)
    return round(number, 2) if number is not None else None


def usage_type(row: dict[str, object]) -> str:
    has_electricity = any(row.get(key) not in (None, "") for key in ("electricityKwh", "electricityCharge"))
    has_gas = any(row.get(key) not in (None, "") for key in ("gasKwh", "gasCharge"))
    if has_electricity and has_gas:
        return "Electricity and Gas"
    if has_electricity:
        return "Electricity"
    if has_gas:
        return "Gas"
    return "Direct Debit"


def build_payload() -> dict[str, object]:
    workbook_path = Path(WORKBOOK_CONFIG.read_text(encoding="utf-8").strip()).expanduser()
    if not workbook_path.exists():
        raise FileNotFoundError(f"Workbook not found: {workbook_path}")

    with zipfile.ZipFile(workbook_path) as zf:
        shared_strings = parse_shared_strings(zf)
        sheets = workbook_sheets(zf)
        sheet_path = sheets.get(SHEET_NAME)
        if not sheet_path:
            raise RuntimeError(f'No "{SHEET_NAME}" sheet found in workbook.')

        root = parse_xml(zf, sheet_path)
        columns = [num_to_col(num) for num in range(col_to_num(START_COL), col_to_num(END_COL) + 1)]
        raw_rows: dict[int, dict[str, str]] = {}

        for row in root.iter():
            if local_name(row.tag) != "row":
                continue
            row_num = int(row.attrib.get("r", "0") or 0)
            if row_num < START_ROW or row_num > END_ROW:
                continue
            values: dict[str, str] = {}
            for cell in row:
                if local_name(cell.tag) != "c":
                    continue
                col = cell_ref_to_col(cell.attrib.get("r", ""))
                if col in columns:
                    values[col] = extract_cell_text(cell, shared_strings)
            if values:
                raw_rows[row_num] = values

    records: list[dict[str, object]] = []
    for row_num in range(START_ROW + 1, END_ROW + 1):
        raw = raw_rows.get(row_num, {})
        if not any((raw.get(col) or "").strip() for col in columns):
            continue

        date = excel_date(raw.get("O", ""))
        source_month = excel_date(raw.get("N", ""))
        record: dict[str, object] = {
            "sourceRow": row_num,
            "month": month_start(raw.get("O", "")),
            "sourceMonth": source_month,
            "date": date,
            "electricityKwh": parse_number(raw.get("P", "")),
            "gasKwh": parse_number(raw.get("Q", "")),
            "electricityCharge": money(raw.get("R", "")),
            "gasCharge": money(raw.get("S", "")),
            "directDebit": money(raw.get("U", "")),
            "balance": money(raw.get("V", "")),
        }
        record["type"] = usage_type(record)
        records.append(record)

    return {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceWorkbook": "Energy usage workbook",
        "sourceRange": "Rates and Calcs!N10:V200",
        "records": records,
    }


def main() -> int:
    payload = build_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(payload['records'])} records.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
