import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

selectors = [
    r'\.card\s*\{',
    r'\.stat-card\s*\{',
    r'\.academic-stat-card\s*\{',
    r'\.btn-primary\s*\{',
    r'\.nav-item\s*\{',
    r'\.nav-sub-item\s*\{',
    r'input\s*\{',
    r'select\s*\{'
]

for sel in selectors:
    print(f"Searching for selector: {sel}")
    matches = list(re.finditer(sel, css_content))
    for m in matches:
        line_no = css_content.count('\n', 0, m.start()) + 1
        lines = css_content.split('\n')
        print(f"  Line {line_no}:")
        for idx in range(line_no, min(len(lines), line_no + 12)):
            print(f"    {idx}: {lines[idx-1]}")
        print("-" * 50)
