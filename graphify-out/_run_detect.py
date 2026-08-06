import json
from graphify.detect import detect
from pathlib import Path

result = detect(Path("."))
Path("graphify-out/.graphify_detect.json").write_text(
    json.dumps(result, ensure_ascii=False), encoding="utf-8"
)
files = result.get("files", {})
print("total_files", result.get("total_files"))
print("total_words", result.get("total_words"))
print("scan_root", result.get("scan_root"))
print("skipped_sensitive", len(result.get("skipped_sensitive") or []))
for k, v in files.items():
    print(k, len(v) if isinstance(v, list) else v)
