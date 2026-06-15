with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r"\`<td>", "`<td>")
content = content.replace(r"</td>\`;", "</td>`;")
content = content.replace(r"\${", "${")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
