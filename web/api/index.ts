// VeilPay backend: one Vercel Function behind a rewrite of /api/*.
// Stores orgs, member roster, payment addresses (ownerTag + viewPub), payroll runs as employer-sealed blobs,
// and a cache of public vault events. It never sees spend secrets, view keys, or salary amounts.
import { randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import postgres from 'postgres'
import { createPublicClient, getAddress, http, isAddress, parseAbiItem, type Address } from 'viem'
import { parseSiweMessage } from 'viem/siwe'
import { LOG_SPAN, VAULT, VAULT_DEPLOY_BLOCK, arcTestnet } from '../src/lib/veilpay/config.js'

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const SESSION_COOKIE = 'vp_session'
const SESSION_DAYS = 7
const MAX_BATCH = 500

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing env ${name}`)
  return v
}

// onnotice: 'create table if not exists' emits harmless NOTICEs on every cold start
const sql = postgres(env('DATABASE_URL'), { max: 5, idle_timeout: 20, onnotice: () => undefined })
const chain = createPublicClient({ chain: arcTestnet, transport: http() })
const sessionKey = new TextEncoder().encode(env('SESSION_SECRET'))

// ponytail: idempotent schema bootstrap on cold start; move to migrations once the schema starts changing.
let schema: Promise<unknown> | undefined
const ensureSchema = () =>
  (schema ??= sql.unsafe(SCHEMA).catch((err) => {
    schema = undefined
    throw err
  }))
const SCHEMA = `
  create table if not exists nonces (nonce text primary key, expires_at timestamptz not null);
  create table if not exists orgs (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_address text not null,
    owner_tag text not null,
    view_pub text not null,
    created_at timestamptz not null default now()
  );
  create index if not exists orgs_owner on orgs(owner_address);
  -- default amounts per member, sealed to the employer's view key in the browser; the server stores ciphertext only
  alter table orgs add column if not exists salary_book text;
  create table if not exists members (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references orgs(id) on delete cascade,
    name text not null,
    email text,
    invite_code text not null unique,
    wallet_address text,
    owner_tag text,
    view_pub text,
    joined_at timestamptz,
    created_at timestamptz not null default now()
  );
  create index if not exists members_org on members(org_id);
  create index if not exists members_wallet on members(wallet_address);
  create table if not exists payroll_runs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references orgs(id) on delete cascade,
    status text not null,
    recipients int not null,
    sealed text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists runs_org on payroll_runs(org_id);
  create table if not exists commitments (idx int primary key, commitment text not null, ciphertext text not null, block bigint not null);
  create table if not exists nullifiers (nullifier text primary key, block bigint not null);
  create table if not exists index_state (id int primary key, last_block bigint not null);
  -- the cache belongs to one vault; switching VAULT clears it (see catchUp)
  alter table index_state add column if not exists vault text;
`

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

// ---------- validation ----------

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} required`)
  const s = v.trim()
  if (s.length > max) throw new HttpError(400, `${field} too long`)
  return s
}

function optionalEmail(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null
  const s = text(v, 'email', 200)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `invalid email: ${s}`)
  return s.toLowerCase()
}

function paymentAddress(v: { ownerTag?: unknown; viewPub?: unknown }) {
  if (typeof v.ownerTag !== 'string' || !/^\d{1,78}$/.test(v.ownerTag) || BigInt(v.ownerTag) >= FIELD) {
    throw new HttpError(400, 'invalid ownerTag')
  }
  if (typeof v.viewPub !== 'string' || !/^[0-9a-f]{64}$/.test(v.viewPub)) throw new HttpError(400, 'invalid viewPub')
  return { ownerTag: v.ownerTag, viewPub: v.viewPub }
}

function sealedBlob(v: unknown): string {
  if (typeof v !== 'string' || !/^0x[0-9a-f]+$/.test(v) || v.length > 200_000) throw new HttpError(400, 'invalid sealed payload')
  return v
}

// ---------- session ----------

function cookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return undefined
}

async function sessionAddress(req: Request): Promise<Address | null> {
  const token = cookie(req, SESSION_COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, sessionKey, { algorithms: ['HS256'] })
    return typeof payload.sub === 'string' && isAddress(payload.sub) ? getAddress(payload.sub) : null
  } catch {
    return null // expired or forged token is treated as logged out
  }
}

async function requireSession(req: Request): Promise<Address> {
  const a = await sessionAddress(req)
  if (!a) throw new HttpError(401, 'login required')
  return a
}

function sessionCookie(value: string, maxAge: number, req: Request) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

// ---------- auth ----------

async function nonce() {
  const n = randomBytes(16).toString('hex')
  await sql`delete from nonces where expires_at < now()`
  await sql`insert into nonces (nonce, expires_at) values (${n}, now() + interval '10 minutes')`
  return json({ nonce: n })
}

async function verify(req: Request) {
  const { message, signature } = await body<{ message?: string; signature?: `0x${string}` }>(req)
  if (typeof message !== 'string' || typeof signature !== 'string') throw new HttpError(400, 'message and signature required')
  const parsed = parseSiweMessage(message)
  if (!parsed.nonce || !parsed.address) throw new HttpError(400, 'malformed SIWE message')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (parsed.domain !== host) throw new HttpError(400, 'SIWE domain mismatch')
  if (parsed.chainId !== arcTestnet.id) throw new HttpError(400, 'SIWE chain mismatch')

  const [used] = await sql`delete from nonces where nonce = ${parsed.nonce} and expires_at > now() returning nonce`
  if (!used) throw new HttpError(400, 'nonce expired or already used')
  const ok = await chain.verifySiweMessage({ message, signature, domain: host, nonce: parsed.nonce })
  if (!ok) throw new HttpError(401, 'invalid signature')

  const address = getAddress(parsed.address)
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(address)
    .setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(sessionKey)
  return json({ address }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400, req) })
}

async function me(req: Request) {
  const address = await sessionAddress(req)
  if (!address) return json({ address: null })
  const orgs = await sql`select id, name, created_at from orgs where owner_address = ${address} order by created_at desc`
  const memberships = await sql`
    select m.id, m.name, m.org_id, o.name as org_name, m.owner_tag, m.joined_at
    from members m join orgs o on o.id = m.org_id
    where m.wallet_address = ${address} order by m.joined_at desc`
  return json({ address, orgs, memberships })
}

// ---------- orgs & members ----------

async function ownedOrg(orgId: string, address: Address) {
  if (!/^[0-9a-f-]{36}$/.test(orgId)) throw new HttpError(404, 'org not found')
  const [org] = await sql`select * from orgs where id = ${orgId}`
  if (!org || org.owner_address !== address) throw new HttpError(404, 'org not found')
  return org
}

async function createOrg(req: Request) {
  const address = await requireSession(req)
  const b = await body<{ name?: unknown; ownerTag?: unknown; viewPub?: unknown }>(req)
  const name = text(b.name, 'name', 100)
  const pa = paymentAddress(b)
  const [org] = await sql`
    insert into orgs (name, owner_address, owner_tag, view_pub) values (${name}, ${address}, ${pa.ownerTag}, ${pa.viewPub})
    returning id, name, created_at`
  return json(org, 201)
}

async function getOrg(req: Request, orgId: string) {
  const address = await requireSession(req)
  const org = await ownedOrg(orgId, address)
  const members = await sql`
    select id, name, email, invite_code, wallet_address, owner_tag, view_pub, joined_at, created_at
    from members where org_id = ${org.id} order by created_at, name`
  return json({ org: { id: org.id, name: org.name, owner_tag: org.owner_tag, view_pub: org.view_pub, salary_book: org.salary_book }, members })
}

async function addMembers(req: Request, orgId: string) {
  const address = await requireSession(req)
  const org = await ownedOrg(orgId, address)
  const b = await body<{ members?: { name?: unknown; email?: unknown }[] }>(req)
  if (!Array.isArray(b.members) || b.members.length === 0) throw new HttpError(400, 'members required')
  if (b.members.length > MAX_BATCH) throw new HttpError(400, `at most ${MAX_BATCH} members per batch`)
  const rows = b.members.map((m, i) => ({
    org_id: org.id,
    name: text(m.name, `members[${i}].name`, 100),
    email: optionalEmail(m.email),
    invite_code: randomBytes(12).toString('base64url'),
  }))
  const created = await sql`
    insert into members ${sql(rows, 'org_id', 'name', 'email', 'invite_code')}
    returning id, name, email, invite_code, created_at`
  return json({ members: created }, 201)
}

async function removeMember(req: Request, orgId: string, memberId: string) {
  const address = await requireSession(req)
  const org = await ownedOrg(orgId, address)
  const [m] = await sql`delete from members where id = ${memberId} and org_id = ${org.id} returning id`
  if (!m) throw new HttpError(404, 'member not found')
  return json({ ok: true })
}

async function getInvite(code: string) {
  const [m] = await sql`
    select m.name, m.joined_at, m.wallet_address, o.name as org_name
    from members m join orgs o on o.id = m.org_id where m.invite_code = ${code}`
  if (!m) throw new HttpError(404, 'invite not found')
  return json({ orgName: m.org_name, memberName: m.name, joined: m.joined_at !== null, wallet: m.wallet_address })
}

async function acceptInvite(req: Request, code: string) {
  const address = await requireSession(req)
  const pa = paymentAddress(await body(req))
  const [m] = await sql`select id, wallet_address from members where invite_code = ${code}`
  if (!m) throw new HttpError(404, 'invite not found')
  if (m.wallet_address && m.wallet_address !== address) throw new HttpError(409, 'invite already used by another wallet')
  await sql`
    update members set wallet_address = ${address}, owner_tag = ${pa.ownerTag}, view_pub = ${pa.viewPub},
      joined_at = coalesce(joined_at, now())
    where id = ${m.id}`
  return json({ ok: true })
}

async function saveSalaryBook(req: Request, orgId: string) {
  const org = await ownedOrg(orgId, await requireSession(req))
  const b = await body<{ sealed?: unknown }>(req)
  await sql`update orgs set salary_book = ${sealedBlob(b.sealed)} where id = ${org.id}`
  return json({ ok: true })
}

// ---------- payroll runs (sealed to the employer's view key) ----------

async function listRuns(req: Request, orgId: string) {
  const org = await ownedOrg(orgId, await requireSession(req))
  const runs = await sql`
    select id, status, recipients, sealed, created_at, updated_at from payroll_runs
    where org_id = ${org.id} order by created_at desc limit 100`
  return json({ runs })
}

const RUN_STATUS = ['pending', 'running', 'done', 'failed']

async function createRun(req: Request, orgId: string) {
  const org = await ownedOrg(orgId, await requireSession(req))
  const b = await body<{ sealed?: unknown; recipients?: unknown }>(req)
  if (!Number.isInteger(b.recipients) || (b.recipients as number) < 1) throw new HttpError(400, 'recipients required')
  const [run] = await sql`
    insert into payroll_runs (org_id, status, recipients, sealed)
    values (${org.id}, 'pending', ${b.recipients as number}, ${sealedBlob(b.sealed)}) returning id, status, created_at`
  return json(run, 201)
}

async function updateRun(req: Request, orgId: string, runId: string) {
  const org = await ownedOrg(orgId, await requireSession(req))
  const b = await body<{ sealed?: unknown; status?: unknown }>(req)
  if (typeof b.status !== 'string' || !RUN_STATUS.includes(b.status)) throw new HttpError(400, 'invalid status')
  const [run] = await sql`
    update payroll_runs set status = ${b.status}, sealed = ${sealedBlob(b.sealed)}, updated_at = now()
    where id = ${runId} and org_id = ${org.id} returning id, status, updated_at`
  if (!run) throw new HttpError(404, 'run not found')
  return json(run)
}

// ---------- public event index ----------

const commitmentEvent = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, bytes encryptedOutput)')
const nullifierEvent = parseAbiItem('event NewNullifier(uint256 indexed nullifier)')
const INDEX_LOCK = 5042002

/** Pulls new vault logs into Postgres. Only one instance catches up at a time; others serve cached rows. */
async function catchUp() {
  const reserved = await sql.reserve()
  try {
    const [{ locked }] = await reserved`select pg_try_advisory_lock(${INDEX_LOCK}) as locked`
    if (!locked) return
    try {
      const vault = VAULT.toLowerCase()
      const [state] = await reserved`select last_block, vault from index_state where id = 1`
      const sameVault = state !== undefined && state.vault === vault
      if (state && !sameVault) {
        // cached events belong to a previous vault deployment
        await reserved`begin`
        try {
          await reserved`delete from commitments`
          await reserved`delete from nullifiers`
          await reserved`delete from index_state`
          await reserved`commit`
        } catch (err) {
          await reserved`rollback`
          throw err
        }
      }
      let from = sameVault ? BigInt(state.last_block) + 1n : VAULT_DEPLOY_BLOCK
      const head = await chain.getBlockNumber()
      while (from <= head) {
        // up to 8 parallel 10k-block windows per round
        const windows: [bigint, bigint][] = []
        for (let i = 0; i < 8 && from <= head; i++) {
          const to = from + LOG_SPAN - 1n > head ? head : from + LOG_SPAN - 1n
          windows.push([from, to])
          from = to + 1n
        }
        const results = await Promise.all(windows.map(([fromBlock, toBlock]) =>
          chain.getLogs({ address: VAULT, events: [commitmentEvent, nullifierEvent], fromBlock, toBlock })))
        const logs = results.flat()
        const cs = logs.filter((l) => l.eventName === 'NewCommitment').map((l) => ({
          idx: Number(l.args.index), commitment: l.args.commitment!.toString(), ciphertext: l.args.encryptedOutput!, block: l.blockNumber.toString(),
        }))
        const ns = logs.filter((l) => l.eventName === 'NewNullifier').map((l) => ({
          nullifier: l.args.nullifier!.toString(), block: l.blockNumber.toString(),
        }))
        const last = windows[windows.length - 1][1].toString()
        // reserved connections have no .begin(); run the transaction by hand on the same connection
        await reserved`begin`
        try {
          if (cs.length) await reserved`insert into commitments ${reserved(cs)} on conflict (idx) do nothing`
          if (ns.length) await reserved`insert into nullifiers ${reserved(ns)} on conflict (nullifier) do nothing`
          await reserved`insert into index_state (id, last_block, vault) values (1, ${last}, ${vault})
            on conflict (id) do update set last_block = excluded.last_block, vault = excluded.vault`
          await reserved`commit`
        } catch (err) {
          await reserved`rollback`
          throw err
        }
      }
    } finally {
      await reserved`select pg_advisory_unlock(${INDEX_LOCK})`
    }
  } finally {
    reserved.release()
  }
}

async function events(req: Request) {
  const url = new URL(req.url)
  const afterIndex = Number(url.searchParams.get('afterIndex') ?? '-1')
  const afterBlock = BigInt(url.searchParams.get('afterBlock') ?? '0')
  if (!Number.isInteger(afterIndex)) throw new HttpError(400, 'invalid afterIndex')
  await catchUp()
  const commitments = await sql`select idx, commitment, ciphertext, block from commitments where idx > ${afterIndex} order by idx`
  const nullifiers = await sql`select nullifier, block from nullifiers where block > ${afterBlock.toString()} order by block`
  const [state] = await sql`select last_block from index_state where id = 1`
  return json({ commitments, nullifiers, lastBlock: state ? String(state.last_block) : null })
}

/** Public counters for the landing page. */
async function stats() {
  await catchUp()
  const [row] = await sql`
    select (select count(*) from commitments)::int as notes, (select count(*) from nullifiers)::int as spent,
           (select last_block from index_state where id = 1) as last_block`
  return json({ notes: row.notes, spent: row.spent, lastBlock: row.last_block === null ? null : String(row.last_block) })
}

// ---------- router ----------

type Handler = (req: Request, ...params: string[]) => Promise<Response>
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/auth\/nonce$/, () => nonce()],
  ['POST', /^\/api\/auth\/verify$/, (r) => verify(r)],
  ['POST', /^\/api\/auth\/logout$/, async (r) => json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, r) })],
  ['GET', /^\/api\/me$/, (r) => me(r)],
  ['POST', /^\/api\/orgs$/, (r) => createOrg(r)],
  ['GET', /^\/api\/orgs\/([^/]+)$/, getOrg],
  ['POST', /^\/api\/orgs\/([^/]+)\/members$/, addMembers],
  ['DELETE', /^\/api\/orgs\/([^/]+)\/members\/([0-9a-f-]{36})$/, removeMember],
  ['PUT', /^\/api\/orgs\/([^/]+)\/salary-book$/, saveSalaryBook],
  ['GET', /^\/api\/orgs\/([^/]+)\/runs$/, listRuns],
  ['POST', /^\/api\/orgs\/([^/]+)\/runs$/, createRun],
  ['PATCH', /^\/api\/orgs\/([^/]+)\/runs\/([0-9a-f-]{36})$/, updateRun],
  ['GET', /^\/api\/invites\/([A-Za-z0-9_-]+)$/, (_r, code) => getInvite(code)],
  ['POST', /^\/api\/invites\/([A-Za-z0-9_-]+)\/accept$/, acceptInvite],
  ['GET', /^\/api\/events$/, (r) => events(r)],
  ['GET', /^\/api\/stats$/, () => stats()],
]

export async function handle(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname
  try {
    await ensureSchema()
    for (const [method, re, h] of routes) {
      const m = path.match(re)
      if (m && req.method === method) return await h(req, ...m.slice(1))
    }
    return json({ error: 'not found' }, 404)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error('api error', req.method, path, err)
    return json({ error: 'internal error' }, 500)
  }
}

export default { fetch: handle }
