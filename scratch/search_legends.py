import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

print("Searching for patterns like 'Present (' or 'Absent (' or Chart.js config...")
matches = list(re.finditer(r'Present\s*\(|Absent\s*\(|Chart', js_content, re.IGNORECASE))
print(f"Found {len(matches)} matches.")
for m in matches[:20]:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    print(f"Line {line_no}: {lines[line_no-1].strip()}")
