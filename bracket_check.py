import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

def strip_comments_and_strings(text):
    # Matches comments or strings
    pattern = re.compile(
        r'(//[^\n]*|/\*.*?\*/|\'(?:\\\\|\\\'|[^\'])*\'|"(?:\\\\|\\"|[^"])*"|`(?:\\\\|\\`|[^`])*`)',
        re.DOTALL
    )
    def repl(m):
        val = m.group(0)
        # Preserve newlines so line numbers remain exact
        return re.sub(r'[^\n]', ' ', val)
    return pattern.sub(repl, text)

def check_brackets(original_text):
    clean_text = strip_comments_and_strings(original_text)
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    
    # Calculate line numbers
    line_starts = [0]
    for i, char in enumerate(original_text):
        if char == '\n':
            line_starts.append(i + 1)
            
    def get_line_col(pos):
        # find line index
        for line_idx, start_pos in enumerate(line_starts):
            if start_pos > pos:
                line = line_idx
                col = pos - line_starts[line_idx - 1] + 1
                return line, col
        line = len(line_starts)
        col = pos - line_starts[-1] + 1
        return line, col

    for i, c in enumerate(clean_text):
        if c in "({[":
            stack.append((c, i))
        elif c in ")}]":
            if not stack:
                l, col = get_line_col(i)
                return f"Unmatched closing {c} at line {l}, col {col}"
            top, pos = stack.pop()
            if top != pairs[c]:
                l, col = get_line_col(i)
                l_open, col_open = get_line_col(pos)
                return f"Mismatched {c} at line {l}, col {col}; expected match for {top} opened at line {l_open}, col {col_open}"
                
    if stack:
        top, pos = stack[-1]
        l, col = get_line_col(pos)
        return f"Unclosed {top} opened at line {l}, col {col}"
    return "OK"

print(check_brackets(text))
