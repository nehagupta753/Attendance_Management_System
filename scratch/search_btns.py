import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\style.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

# Find matches for btn-student, btn-teacher, btn-admin
btn_classes = ['btn-student', 'btn-teacher', 'btn-admin']
for bc in btn_classes:
    print(f"Searching for {bc}:")
    matches = list(re.finditer(bc, css_content))
    for m in matches:
        line_no = css_content.count('\n', 0, m.start()) + 1
        lines = css_content.split('\n')
        print(f"  Line {line_no}: {lines[line_no-1].strip()}")
