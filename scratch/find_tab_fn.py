import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

matches = list(re.finditer(r'switchCoordTrendTab\s*=', js_content))
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    print(f"Line {line_no}:")
    for idx in range(max(1, line_no - 2), min(len(lines), line_no + 15) + 1):
        print(f"  {idx}: {lines[idx-1]}")
