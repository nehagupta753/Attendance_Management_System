import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

matches = list(re.finditer(r'academic metrics for your class', js_content, re.IGNORECASE))
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    print(f"Line {line_no}:")
    for idx in range(max(1, line_no - 15), min(len(lines), line_no + 20)):
        print(f"  {idx}: {lines[idx-1]}")
