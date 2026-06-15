import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

view_fns = [
    'renderMarkAttendance',
    'renderStudentHistory',
    'renderCoordAllStudents',
    'renderCoordEditStudents',
    'renderCoordEditAttendance'
]

lines = js_content.split('\n')

for name in view_fns:
    print(f"=== {name} ===")
    matches = list(re.finditer(r'async\s+function\s+' + name, js_content))
    if not matches:
        continue
    start_pos = matches[0].start()
    
    # Find the end of this function scope
    end_pos = len(js_content)
    for next_m in re.finditer(r'\n(async\s+)?function\s+\w+', js_content[start_pos + 20:]):
        end_pos = start_pos + 20 + next_m.start()
        break
    
    line_no_end = js_content.count('\n', 0, end_pos) + 1
    print(f"  Line range ends at: {line_no_end}")
    for idx in range(max(1, line_no_end - 15), line_no_end + 1):
        print(f"    {idx}: {lines[idx-1]}")
    print("-" * 50)
