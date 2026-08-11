#!/bin/bash
BASE="http://localhost:3000"

# Login as Josh
echo "=== Logging in as Josh ==="
RESP=$(curl -s -X POST "$BASE/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"joshsosme@gmail.com","password":"P@ssword123"}')
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "FAILED: login"
  exit 1
fi
echo "Logged in"

# High6 tenant ID
TENANT="6a33cc24b8484fab9369a4d3"

# Query High6 sites
echo ""
echo "=== High6 sites ==="
SITES=$(curl -s "$BASE/api/sites?where%5Btenant%5D%5Bequals%5D=$TENANT" \
  -H "Authorization: Bearer $TOKEN")
echo "$SITES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Total: {d[\"totalDocs\"]} sites')
for s in d['docs']:
    print(f'  {s[\"id\"]} — {s[\"name\"]} ({s[\"url\"]})')
"

# Set defaultSite to apir-tayo
echo ""
echo "=== Setting High6 defaultSite to apir-tayo ==="
curl -s -X PATCH "$BASE/api/tenants/$TENANT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultSite":"6a352f382054dfd250819c26"}' | python3 -c "
import sys,json
d=json.load(sys.stdin).get('doc',{})
ds = d.get('defaultSite',{})
name = ds.get('name','?') if isinstance(ds, dict) else ds
site_id = ds.get('id','?') if isinstance(ds, dict) else '?'
print(f'defaultSite: {name} ({site_id})')
"

echo ""
echo "=== DONE ==="
echo "Now verify in browser at http://localhost:3000/admin :"
echo "1. Login as Josh (P@ssword123)"
echo "2. Select 'High6' in the top tenant selector"
echo "3. Site dropdown should appear below nav — apir-tayo + High6 Labs"
echo "4. Switch to High6 Labs → page reloads"
echo "5. Check devtools → Application → Cookies → payload-site cookie"
echo "6. Clear payload-site cookie → reload → should fall back to apir-tayo (defaultSite)"
