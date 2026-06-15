import urllib.request

try:
    response = urllib.request.urlopen("http://localhost:8000", timeout=5)
    html = response.read().decode('utf-8')
    print("HTTP Server status: OK")
    print(f"Content-type: {response.headers.get('Content-Type')}")
    print(f"Content length: {len(html)} characters")
    if "app.js" in html:
        print("Verification: index.html contains references to app.js ✅")
    if "style.css" in html:
        print("Verification: index.html contains references to style.css ✅")
except Exception as e:
    print(f"Error connecting to local server: {e}")
