import re
import sys

# Ensure stdout uses utf-8
sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

keywords = ['conic-gradient', 'present', 'absent', 'gauge', 'pie-chart', 'piechart']
# Let's search for occurrences of conic-gradient specifically
print("--- SEARCHING conic-gradient ---")
for m in re.finditer(r'conic-gradient', js_content, re.IGNORECASE):
    # print context line
    line_no = js_content.count('\n', 0, m.start()) + 1
    # print 5 lines before and after
    lines = js_content.split('\n')
    start_line = max(1, line_no - 10)
    end_line = min(len(lines), line_no + 10)
    print(f"Match found at line {line_no}:")
    for idx in range(start_line, end_line + 1):
        prefix = "-> " if idx == line_no else "   "
        print(f"{prefix}{idx}: {lines[idx-1]}")
    print("-" * 50)
