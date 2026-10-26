import json
import re
import sys
from pathlib import Path

import openpyxl


def parsed(raw):
    if raw is None:
        return None, ""
    if isinstance(raw, (int, float)):
        return float(raw), ""
    text = str(raw).replace("��", "°").strip()
    fraction = re.search(r"(?:(\d+)\s+)?(\d+)\s*/\s*(\d+)", text)
    if fraction:
        value = float(fraction.group(1) or 0) + float(fraction.group(2)) / float(fraction.group(3))
        return value, text[fraction.end():].strip()
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    return (float(match.group()) if match else None), text[match.end():].strip() if match else text


def parameter(name_zh, name_en, raw):
    value, unit = parsed(raw)
    item = {"name_zh": name_zh, "name_en": name_en, "value": value, "unit": unit}
    if value is None:
        return item
    normalized = unit.lower().replace(" ", "")
    if normalized in {"in", "inch", '"'}:
        item.update(si_value=round(value * 25.4, 6), si_unit="mm")
    elif normalized in {"lb/in", "lb-in", "lbin"}:
        item.update(si_value=round(value * 0.112984829, 6), si_unit="N·m")
    elif normalized in {"°f", "f"}:
        item.update(si_value=round((value - 32) * 5 / 9, 3), si_unit="°C")
    else:
        item.update(si_value=value, si_unit=unit)
    return item


def main(workbook_path, parts_path, commerce_path):
    workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    parts_file, commerce_file = Path(parts_path), Path(commerce_path)
    payload = json.loads(parts_file.read_text(encoding="utf-8"))
    commerce = json.loads(commerce_file.read_text(encoding="utf-8"))
    old_helical_models = {r["model"] for r in payload["records"] if r.get("brand") == "Helical Products"}
    payload["records"] = [r for r in payload["records"] if r.get("brand") != "Helical Products"]
    for model in old_helical_models:
        commerce.pop(model, None)

    new_records = []
    new_commerce = {}
    categories = {
        "Clamp couplings": "夹紧式螺旋联轴器",
        "Set Screw Couplings": "顶丝式螺旋联轴器",
        "Servo Couplings": "伺服十字槽联轴器",
    }
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(min_row=2, values_only=True):
            model = str(row[0] or "").strip()
            if not model:
                continue
            params = [
                parameter("外径", "Outside Diameter", row[7]), parameter("长度", "Length", row[8]),
                parameter("大孔径", "Major Bore", row[9]), parameter("小孔径", "Minor Bore", row[10]),
                parameter("最高转速", "Max. RPM", row[11]), parameter("最大扭矩", "Max. Torque", row[12]),
                parameter("最高工作温度", "Max. Operating Temperature", row[13]),
                parameter("平行偏移", "Parallel Misalignment", row[14]),
                parameter("角向偏差", "Angular Misalignment", row[15]),
                parameter("轴向位移", "Axial Motion", row[16]),
            ]
            record = {
                "model": model, "brand": "Helical Products", "category": categories[sheet.title],
                "family": str(row[2] or ""), "material": str(row[5] or ""),
                "notes": f"连接方式：{row[3] or '—'}；运动类型：{row[4] or '—'}；表面处理：{row[6] or '—'}。价格来自用户提供的 2026 年 Helical 规格及价格表。",
                "configurable": False, "parameters": params,
                "source_url": "https://www.mwcomponents.com/brands/helical-products",
            }
            new_records.append(record)
            breaks = [("1–4 件", row[17]), ("5–9 件", row[18]), ("10–24 件", row[19]), ("25–49 件", row[20]), ("50–99 件", row[21]), ("100–249 件", row[22]), ("250–499 件", row[23])]
            tiers = [{"quantity": label, "amount": float(amount)} for label, amount in breaks if isinstance(amount, (int, float))]
            new_commerce[model] = {
                "brand": "Helical Products", "status": "spreadsheet", "url": record["source_url"],
                "link_kind": "品牌官网", "checked_at": "2026-09-21",
                "price": {"amount": tiers[0]["amount"], "currency": "CNY", "basis": "表格单件价（1–4 件）", "source": "Helical标准联轴器规格及价格表.xlsx"} if tiers else None,
                "price_tiers": tiers, "price_note": str(row[24] or "500 件及以上请联系查询"),
            }

    payload["records"].extend(new_records)
    payload["records"].sort(key=lambda r: (r.get("brand", ""), r.get("category", ""), r.get("model", "")))
    payload["record_count"] = len(payload["records"])
    payload["helical_spreadsheet_import"] = {"file": Path(workbook_path).name, "records": len(new_records), "updated_at": "2026-09-21"}
    commerce.update(new_commerce)
    parts_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    commerce_file.write_text(json.dumps(commerce, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"helical_records": len(new_records), "total_records": len(payload["records"]), "prices": len(new_commerce)}, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:4])
