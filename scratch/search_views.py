import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

matches = list(re.finditer(r'switchView', js_content))
print(f"Found {len(matches)} occurrences of switchView.")
views = set()
for m in matches:
    line_no = js_content.count('\n', 0, m.start()) + 1
    lines = js_content.split('\n')
    # look for switchView('viewName')
    v = re.findall(r"switchView\(['\"](\w+)['\"]\)", lines[line_no-1])
    if v:
        views.update(v)

print("Views in switchView:", sorted(list(views)))
