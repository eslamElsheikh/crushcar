// Run #4 — generates the raw material for SECURITY_ROUTE_MATRIX.md:
// every API route file, its exported methods, and the security markers
// actually present in its source. Static classification only; live evidence
// is referenced separately from scripts/verify-security-suite.ts.
import fs from "node:fs"
import path from "node:path"

const API_ROOT = path.join(process.cwd(), "src", "app", "api")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full)
  }
  return out
}

interface Marker {
  name: string
  re: RegExp
}

const AUTH_MARKERS: Marker[] = [
  { name: "auth()", re: /\bauth\(\)/ },
  { name: "getServerSession", re: /getServerSession\s*\(/ },
  { name: "requireRole", re: /requireRole\s*\(/ },
  { name: "requireAdmin", re: /requireAdmin\s*\(/ },
  { name: "requireSuperAdmin", re: /requireSuperAdmin\s*\(/ },
  { name: "decode(jwt)", re: /\bdecode\s*\(\s*\{[\s\S]*?secret/ },
]

const ROLE_MARKERS: Marker[] = [
  { name: "SUPER_ADMIN", re: /SUPER_ADMIN/ },
  { name: "COMPANY_ADMIN", re: /COMPANY_ADMIN/ },
  { name: "CUSTOMER", re: /\bCUSTOMER\b/ },
  { name: "role-check", re: /\.role\s*===|role\s*!==|roles?\.(includes|indexOf)/ },
]

const SCOPE_MARKERS: Marker[] = [
  { name: "companyId", re: /companyId/ },
  { name: "ownership", re: /ownership|ownerId|userId\s*===|createdBy/ },
  { name: "customerId", re: /customerId/ },
]

const OTHER_MARKERS: Marker[] = [
  { name: "zod", re: /\bz\.|zodResolver|\.parse\(/ },
  { name: "rateLimit", re: /rateLimit(Request)?\(|checkRateLimit\s*\(/ },
  { name: "prisma.tx", re: /prisma\.\$transaction|\$transaction\s*\(/ },
  { name: "lockRow", re: /lockRow\s*\(/ },
]

function extractMethods(src: string): string[] {
  const methods = new Set<string>()
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g))
    methods.add(m[1])
  for (const m of src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g))
    methods.add(m[1])
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop()?.trim()
      if (name && /^(GET|POST|PUT|PATCH|DELETE)$/.test(name)) methods.add(name)
    }
  }
  return [...methods].sort()
}

function matches(src: string, markers: Marker[]): string {
  const hit = markers.filter((m) => m.re.test(src)).map((m) => m.name)
  return hit.length ? hit.join("+") : "—"
}

const files = walk(API_ROOT).sort()
const rows: string[] = []
for (const file of files) {
  const src = fs.readFileSync(file, "utf8")
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/")
  const routePath = "/" + rel
    .replace(/^src\/app\/api\//, "api/")
    .replace(/\/route\.tsx?$/, "")
    .replace(/\[([^/]+)\]/g, ":$1")
  const methods = extractMethods(src).join(",") || "?"
  rows.push(
    [
      routePath,
      methods,
      matches(src, AUTH_MARKERS),
      matches(src, ROLE_MARKERS),
      matches(src, SCOPE_MARKERS),
      matches(src, OTHER_MARKERS),
    ].join(" | ")
  )
}
console.log("path | methods | auth | roles | scope | other")
console.log(rows.join("\n"))
console.log(`\nTOTAL ROUTE FILES: ${files.length}`)
