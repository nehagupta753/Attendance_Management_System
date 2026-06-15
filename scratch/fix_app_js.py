import re

with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'r', encoding='utf-8') as f:
    code = f.read()

lines = code.split('\n')

def insert_tilt_call(lines, function_name):
    start_idx = -1
    for idx, line in enumerate(lines):
        if f'function {function_name}' in line:
            start_idx = idx
            break
    if start_idx == -1:
        print(f"Error: {function_name} not found!")
        return False
    
    # Track open/close braces
    open_braces = 0
    closing_idx = -1
    for idx in range(start_idx, len(lines)):
        line = lines[idx]
        open_braces += line.count('{')
        open_braces -= line.count('}')
        if open_braces == 0:
            closing_idx = idx
            break
            
    if closing_idx == -1:
        print(f"Error: Could not find closing brace for {function_name}")
        return False
        
    # Check if init3DTilt is already called in the last few lines
    scope = "\n".join(lines[start_idx:closing_idx])
    if 'init3DTilt' in scope:
        print(f"{function_name} already calls init3DTilt.")
        return True
        
    # Insert call right before closing brace
    indent = " " * (len(lines[closing_idx]) - len(lines[closing_idx].lstrip()))
    # Let's inspect the indent of the line before the closing brace
    lines.insert(closing_idx, f"    setTimeout(window.init3DTilt, 100);")
    print(f"Successfully inserted init3DTilt call to {function_name} (inserted on line {closing_idx+1})")
    return True

# Insert into the async view functions
async_views = [
    'renderMarkAttendance',
    'renderStudentHistory',
    'renderCoordAllStudents',
    'renderCoordEditStudents',
    'renderCoordEditAttendance'
]

success = True
for view in async_views:
    if not insert_tilt_call(lines, view):
        success = False
        break

if success:
    # Now let's modify window.init3DTilt
    # We want to insert 'if (window.initScrollReveal) window.initScrollReveal();' at the start of init3DTilt
    tilt_start = -1
    for idx, line in enumerate(lines):
        if 'window.init3DTilt = () => {' in line:
            tilt_start = idx
            break
            
    if tilt_start != -1:
        lines.insert(tilt_start + 1, "    if (window.initScrollReveal) window.initScrollReveal();")
        print("Successfully updated window.init3DTilt to call initScrollReveal.")
        
        # Write back to app.js
        with open(r'c:\Users\yagye\OneDrive\Documents\attendance system\app.js', 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))
        print("app.js updated successfully!")
    else:
        print("Error: window.init3DTilt definition not found!")
else:
    print("Updates aborted due to errors.")
