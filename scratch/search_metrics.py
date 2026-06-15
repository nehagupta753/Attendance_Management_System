import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

keywords = ['grandPresent', 'grandAbsent', 'weekPresent', 'monthPresent']
for kw in keywords:
    print(f"Searching for {kw}:")
    matches = list(re.finditer(kw, js_content))
    for m in matches:
        line_no = js_content.count('\n', 0, m.start()) + 1
        lines = js_content.split('\n')
        print(f"  Line {line_no}: {lines[line_no-1].strip()}")
