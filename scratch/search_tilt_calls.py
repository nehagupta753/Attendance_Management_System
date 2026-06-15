import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

matches = list(re.finditer(r'init3DTilt', js_content))
print(f"Found {len(matches)} occurrences:")
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    print(f"  Line {line_no}: {lines[line_no-1].strip()}")
