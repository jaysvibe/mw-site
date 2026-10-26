"""Import verified Century Spring compression SKUs from the official 2023 catalog.

The catalog uses one physical row per SKU. Rows failing its inch/mm consistency
checks are skipped, so wrapped or OCR-damaged lines cannot become products.
"""

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "century-catalog.pdf"
OUT = ROOT / "dist" / "parts.json"
CATALOG = "https://info.centuryspring.com/hubfs/MWC%20Catalogs/CenturySpring_2021_Catalog.pdf"
NUMERIC = re.compile(r"^\d+(?:\.\d+)?$")
MATERIAL = {"MW": "琴钢丝", "SPR": "弹簧钢", "SST": "不锈钢", "HD": "硬拉钢丝", "OT": "油淬钢丝", "BC": "铍铜", "PB": "磷青铜"}
ENDS = {"C": "闭口", "CG": "闭口磨平", "O": "开口"}
FINISH = {"Z": "镀锌", "GI": "金色铬酸盐", "N": "无", "BO": "发黑"}
EXTENSION_ENDS = {"DL": "双环", "FL": "整环", "SH": "侧钩", "DSL": "双侧环", "MH": "机械钩", "SL": "侧环", "EH": "加长钩"}


def parameter(zh, en, value, original_unit, metric, metric_unit):
    return {"name_zh": zh, "name_en": en, "value": float(value),
            "unit": original_unit, "si_value": float(metric), "si_unit": metric_unit}


def parse_row(line, page):
    fields = line.split()
    if len(fields) != 21 or not all(NUMERIC.fullmatch(fields[i]) for i in [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]):
        return None
    if fields[18] not in MATERIAL or fields[19] not in ENDS or fields[20] not in FINISH:
        return None
    model = fields[2]
    if not re.fullmatch(r"[A-Za-z0-9-]+", model) or not re.search(r"\d", model):
        return None
    # Catches shifted columns and damaged extraction without rejecting printed rounding.
    for original, metric in [(0, 1), (3, 4), (5, 6), (9, 10), (13, 14), (15, 16)]:
        if abs(float(fields[original]) * 25.4 - float(fields[metric])) > 0.18:
            return None
    p = [parameter("外径", "Outside diameter", fields[0], "in", fields[1], "mm"),
         parameter("自由长度", "Free length", fields[3], "in", fields[4], "mm"),
         parameter("内径", "Inside diameter", fields[5], "in", fields[6], "mm"),
         parameter("弹簧刚度", "Spring rate", fields[7], "lbf/in", fields[8], "N/mm"),
         parameter("建议最大压缩量", "Suggested max deflection", fields[9], "in", fields[10], "mm"),
         parameter("建议最大载荷", "Suggested max load", fields[11], "lbf", fields[12], "N"),
         parameter("并紧长度", "Solid length", fields[13], "in", fields[14], "mm"),
         parameter("线径", "Wire diameter", fields[15], "in", fields[16], "mm"),
         parameter("总圈数", "Total coils", fields[17], "turns", fields[17], "turns")]
    return {"brand": "Century Spring", "category": "压缩弹簧", "family": "标准压缩弹簧",
            "model": model, "material": MATERIAL[fields[18]], "parameters": p,
            "source_url": f"{CATALOG}#page={page + 1}",
            "notes": f"端部：{ENDS[fields[19]]}；表面：{FINISH[fields[20]]}。官方目录 2023 版，PDF 第 {page + 1} 页。",
            "configurable": False}


def parse_extension(line, page):
    fields = line.split()
    if len(fields) != 18 or not all(NUMERIC.fullmatch(fields[i]) for i in [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]):
        return None
    if fields[15] not in MATERIAL or fields[16] not in FINISH or fields[17] not in EXTENSION_ENDS:
        return None
    model = fields[2]
    if not re.fullmatch(r"[A-Za-z0-9-]+", model) or not re.search(r"\d", model):
        return None
    for original, metric in [(0, 1), (3, 4), (9, 10), (13, 14)]:
        if abs(float(fields[original]) * 25.4 - float(fields[metric])) > 0.18:
            return None
    p = [parameter("外径", "Outside diameter", fields[0], "in", fields[1], "mm"),
         parameter("自由长度", "Length", fields[3], "in", fields[4], "mm"),
         parameter("弹簧刚度", "Spring rate", fields[5], "lbf/in", fields[6], "N/mm"),
         parameter("初拉力", "Initial tension", fields[7], "lbf", fields[8], "N"),
         parameter("建议最大拉伸量", "Suggested max deflection", fields[9], "in", fields[10], "mm"),
         parameter("建议最大载荷", "Suggested max load", fields[11], "lbf", fields[12], "N"),
         parameter("线径", "Wire diameter", fields[13], "in", fields[14], "mm")]
    return {"brand": "Century Spring", "category": "拉伸弹簧", "family": "标准拉伸弹簧",
            "model": model, "material": MATERIAL[fields[15]], "parameters": p,
            "source_url": f"{CATALOG}#page={page + 1}",
            "notes": f"端部：{EXTENSION_ENDS[fields[17]]}；表面：{FINISH[fields[16]]}。官方目录 2023 版，PDF 第 {page + 1} 页。",
            "configurable": False}


def main():
    reader = PdfReader(PDF)
    rows = {}
    seen = 0
    for page in range(18, 223):
        for line in (reader.pages[page].extract_text() or "").splitlines():
            item = parse_row(line, page)
            if item:
                seen += 1
                rows.setdefault(item["model"], item)
    compression_count = len(rows)
    for page in range(371, 433):
        for line in (reader.pages[page].extract_text() or "").splitlines():
            item = parse_extension(line, page)
            if item:
                seen += 1
                rows.setdefault(item["model"], item)
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    payload["records"] = [r for r in payload["records"] if r["brand"] != "Century Spring"]
    payload["record_count"] = len(payload["records"]) + len(rows)
    payload["sources"] = [s for s in payload["sources"] if s["brand"] != "Century Spring"]
    payload["sources"].append({"brand": "Century Spring", "title": "Century Spring Stock & Custom Springs 2023 Catalog（已导入标准压缩、拉伸弹簧）", "url": CATALOG})
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for category, filename in [("压缩弹簧", "century-compression.json"), ("拉伸弹簧", "century-extension.json")]:
        subset = [r for r in rows.values() if r["category"] == category]
        (ROOT / "dist" / filename).write_text(json.dumps(subset, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"parsed_rows={seen} compression_skus={compression_count} unique_skus={len(rows)} total_records={payload['record_count']}")


if __name__ == "__main__":
    main()
