import json

transcript_path = r"C:\Users\yagye\.gemini\antigravity\brain\dd031987-1aa6-42ce-83f8-4d67a54774dc\.system_generated\logs\transcript.jsonl"

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'USER_INPUT':
                print(f"Step {obj.get('step_index')}: {obj.get('content')}")
        except Exception as e:
            pass
