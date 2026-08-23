#!/bin/bash
# Usage: .migration/run_sql.sh "SQL" 
TOKEN=$(cat ~/.supabase/access-token)
REF=urwnucdjmoavbdddrhsh
python3 -c '
import json, sys, urllib.request
query = sys.argv[1]
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{sys.argv[2]}/database/query",
    data=json.dumps({"query": query}).encode(),
    headers={"Authorization": "Bearer " + open(sys.argv[3]).read().strip(),
             "Content-Type": "application/json",
             "User-Agent": "openclaw"},
    method="POST")
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = resp.read().decode()
        print(body[:6000])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:3000])
' "$1" "$REF" "$HOME/.supabase/access-token"
