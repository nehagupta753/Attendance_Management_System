import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

view_fns = [
    'renderMarkAttendance',
    'renderStudentHistory',
    'renderCoordDashboard',
    'renderCoordAllStudents',
    'renderCoordEditStudents',
    'renderCoordEditAttendance'
]

for name in view_fns:
    matches = list(re.finditer(r'async\s+function\s+' + name, js_content))
    if not matches:
        continue
    start_pos = matches[0].start()
    # Find next function start
    end_pos = len(js_content)
    for next_m in re.finditer(r'(async\s+)?function\s+', js_content[start_pos + 10:]):
        end_pos = start_pos + 10 + next_m.start()
        break
    
    scope = js_content[start_pos:end_pos]
    card_count = len(re.findall(r'class=["\']card["\']', scope))
    print(f"Function {name} has {card_count} cards.")
