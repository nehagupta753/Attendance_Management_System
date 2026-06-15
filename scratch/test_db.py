import urllib.request
import json
import urllib.parse

url = 'https://heoxgbknrnxzhcdolgus.supabase.co/rest/v1/'
headers = {
    'apikey': 'sb_publishable_P2YPf-iogij7qNnwcK79XA_YUbJe1Ll',
    'Authorization': 'Bearer sb_publishable_P2YPf-iogij7qNnwcK79XA_YUbJe1Ll'
}

def get_data(endpoint):
    req = urllib.request.Request(url + endpoint, headers=headers)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

# 1. Get teacher Pawan
teachers = get_data('teachers?name=ilike.*Pawan*')
print("Teachers matching Pawan:")
print(json.dumps(teachers, indent=2))

if teachers:
    teacher_id = teachers[0]['id']
    # 2. Get timetable slots for this teacher
    timetable = get_data(f'timetable?teacher_id=eq.{teacher_id}')
    print("\nTimetable slots:")
    print(json.dumps(timetable, indent=2))
    
    # 3. Get all subjects
    subjects = get_data('subjects')
    print("\nSubjects:")
    for s in subjects:
        print(f"ID: {s['id']}, Code: {s['code']}, Name: {s['name']}, Branch: {s['branch']}")

    # 4. Get MST Timetable entries
    mst_timetable = get_data('mst_timetable')
    print("\nMST Timetable:")
    print(json.dumps(mst_timetable, indent=2))
