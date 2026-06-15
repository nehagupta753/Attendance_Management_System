import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Search for '#10b981' and 'rgb' values corresponding to it
matches = list(re.finditer(r'#10b981|rgba?\(16,\s*185,\s*129', js_content, re.IGNORECASE))
print(f"Found {len(matches)} matches.")
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    print(f"Line {line_no}: {lines[line_no-1].strip()}")
