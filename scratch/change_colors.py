with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Primary colors
content = content.replace('#7c3aed', '#003366') # Classic Blue
content = content.replace('#6d28d9', '#002244') # Darker Blue
content = content.replace('#8b5cf6', '#1e40af') # Medium Blue

# Light background purples to greys/whites
content = content.replace('#f5f3ff', '#f1f5f9') # Soft grey-white active background
content = content.replace('#f3e8ff', '#e2e8f0') # Soft grey border
content = content.replace('#faf5ff', '#f8fafc') # Soft hover background
content = content.replace('#e9d5ff', '#dbeafe') # Light blue accent badge

# RGB values
content = content.replace('124, 58, 237', '0, 51, 102')
content = content.replace('124,58,237', '0,51,102')

# Purple gradients/themes
content = content.replace('#a78bfa', '#3b82f6')
content = content.replace('#c084fc', '#60a5fa')

# Let's adjust body background to be cleaner grey-white
content = content.replace(
    "background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #eff6ff 100%) fixed;",
    "background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%) fixed;"
)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete!")
