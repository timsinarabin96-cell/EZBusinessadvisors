#!/bin/bash
echo "===== 1. middleware.ts ====="
cat middleware.ts 2>/dev/null || echo "(no middleware.ts found)"

echo ""
echo "===== 2. auth-related files under app/ ====="
find app -iregex '.*\(login\|auth\|session\).*' 2>/dev/null

echo ""
echo "===== 3. any supabase.auth usage in the codebase ====="
grep -rn "supabase.auth" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules

echo ""
echo "===== 4. supabase client setup ====="
find . -iname "supabase*.ts" -not -path "*/node_modules/*" -exec echo "--- {} ---" \; -exec cat {} \;

echo ""
echo "===== 5. is service_role key referenced anywhere client-side? ====="
grep -rn "SERVICE_ROLE" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules

echo ""
echo "===== 6. git status ====="
git log origin/main -3 2>/dev/null
git status

echo ""
echo "===== 7. where blackshield / websecure-ez are actually used ====="
grep -rn "blackshield" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | grep -v node_modules
grep -rn "websecure-ez" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | grep -v node_modules
