import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

keywords = ['attendance-3d-card', 'attendance-mini-gauge', 'inner-card']
for kw in keywords:
    print(f"--- SEARCHING FOR {kw} ---")
    for m in re.finditer(kw, css_content, re.IGNORECASE):
        line_no = css_content.count('\n', 0, m.start()) + 1
        lines = css_content.split('\n')
        start_line = max(1, line_no - 10)
        end_line = min(len(lines), line_no + 10)
        print(f"Match found at line {line_no}:")
        for idx in range(start_line, end_line + 1):
            prefix = "-> " if idx == line_no else "   "
            print(f"{prefix}{idx}: {lines[idx-1]}")
        print("-" * 50)
