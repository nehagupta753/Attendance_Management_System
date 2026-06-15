import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

matches = list(re.finditer(r'\.auth-card\b', css_content))
print(f"Found {len(matches)} matches:")
for m in matches:
    line_no = css_content.count('\n', 0, m.start()) + 1
    lines = css_content.split('\n')
    print(f"  Line {line_no}:")
    for idx in range(line_no, min(len(lines), line_no + 12)):
        print(f"    {idx}: {lines[idx-1]}")
    print("-" * 50)
