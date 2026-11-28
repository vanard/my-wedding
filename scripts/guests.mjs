// Owner tool for the guest list. Runs on your computer with the server-only key from .env;
// writes personal links and exports to private/ (git-ignored, never deployed).
//
//   npm run guests -- import private/guests.csv   add parties, write private/links-<time>.csv
//   npm run guests -- reissue "Exact Name"        new link for one party (the old one stops working)
//   npm run guests -- export                      RSVP/check-in + wishes backup to private/
//   npm run guests -- members "Group" "A|B|C"     add member names to an existing group
//
// guests.csv columns (header row required): name,max_guests[,group][,members]
//   e.g.  Bapak Budi & Keluarga,4
//         Teman Kantor,1,ya,Budi Santoso|Sari Dewi|Andi
// RSVP is hadir / tidak hadir only: "hadir" counts max_guests on a personal link. A row with
// group = ya/yes/1 is a group link shared by many people, each answering for themselves (one
// person each). With `members` (names separated by |), each person picks their own name from
// that list, the name is locked to the first phone that answers, and their Entry Access Card
// checks in that person. Without members, they type their name.
// Each personal link is /?to=<name>&k=<code>. Only a SHA-256 hash of the code is stored, so
// the links file is the only copy: keep it private and back it up. Lost links can be reissued.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

try { process.loadEnvFile('.env'); } catch { /* variables may come from the shell */ }

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;
const SITE = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const OUT = 'private';

function die(message) { console.error(message); process.exit(1); }
if (!SUPABASE_URL || !KEY) die('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');

async function db(path, init = {}) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers };
  if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) die(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const newCode = () => randomBytes(32).toString('base64url');
const hash = (code) => createHash('sha256').update(code).digest('hex');
const link = (name, code) => `${SITE}/?to=${encodeURIComponent(name)}&k=${code}`;
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const cell = (value) => {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (rows) => `${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`;

async function save(name, rows) {
  await mkdir(OUT, { recursive: true });
  const path = `${OUT}/${name}-${stamp()}.csv`;
  // UTF-8 BOM so Excel shows names with accents correctly.
  await writeFile(path, `﻿${toCsv(rows)}`, { mode: 0o600 });
  return path;
}

async function importGuests(file) {
  if (!SITE.startsWith('https://')) die('Set SITE_URL in .env to the live site, e.g. https://your-project.vercel.app');
  const [header, ...lines] = parseCsv((await readFile(file, 'utf8')).replace(/^﻿/, ''));
  const columns = header?.map((h) => h.trim().toLowerCase());
  const nameAt = columns?.indexOf('name') ?? -1;
  const maxAt = columns?.indexOf('max_guests') ?? -1;
  const groupAt = columns?.indexOf('group') ?? -1;
  const membersAt = columns?.indexOf('members') ?? -1;
  if (nameAt < 0 || maxAt < 0) die('The first row must be the header: name,max_guests (optionally ,group,members)');

  const existing = new Set((await db('invitation_parties?select=display_name')).map((p) => p.display_name.toLowerCase()));
  const seen = new Set();
  const parties = [];
  const skipped = [];
  lines.forEach((line, index) => {
    const name = (line[nameAt] ?? '').trim().replace(/\s+/g, ' ');
    const max = Number((line[maxAt] ?? '').trim());
    const groupCell = groupAt < 0 ? '' : (line[groupAt] ?? '').trim().toLowerCase();
    const where = `row ${index + 2}`;
    if (!['', 'ya', 'yes', 'y', '1', 'true', 'tidak', 'no', 'n', '0', 'false'].includes(groupCell)) {
      die(`${where}: group must be "ya" for a group link or empty for a personal link.`);
    }
    const group = ['ya', 'yes', 'y', '1', 'true'].includes(groupCell);
    if (!name || [...name].length > 100) die(`${where}: name is required (at most 100 characters).`);
    if (!Number.isInteger(max) || max < 1 || max > 100) die(`${where}: max_guests must be a whole number from 1 to 100.`);
    const lower = name.toLowerCase();
    if (seen.has(lower)) die(`${where}: "${name}" appears twice. Make each name unique, e.g. "Budi (Kantor)".`);
    seen.add(lower);
    const members = memberNames(membersAt < 0 ? '' : line[membersAt] ?? '', where);
    if (members.length && !group) die(`${where}: members are only for a group row (group = ya).`);
    if (existing.has(lower)) { skipped.push(name); return; }
    parties.push({ name, max, group, members, code: newCode() });
  });

  for (let i = 0; i < parties.length; i += 200) {
    const batch = parties.slice(i, i + 200);
    const saved = await db('invitation_parties?select=id,display_name', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(batch.map((p) => ({ display_name: p.name, max_guests: p.max, is_group: p.group, token_hash: hash(p.code) }))),
    });
    const idOf = new Map(saved.map((p) => [p.display_name, p.id]));
    const rows = batch.flatMap((p) => p.members.map((member) => ({ party_id: idOf.get(p.name), name: member })));
    if (rows.length) await db('group_members', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
  }
  if (parties.length) {
    const path = await save('links', [['name', 'max_guests', 'group', 'link'],
      ...parties.map((p) => [p.name, p.max, p.group ? 'ya' : '', link(p.name, p.code)])]);
    const memberCount = parties.reduce((sum, p) => sum + p.members.length, 0);
    console.log(`Added ${parties.length} parties${memberCount ? ` (${memberCount} group members)` : ''}. Personal links: ${path}`);
  } else console.log('No new parties to add.');
  if (skipped.length) console.log(`Skipped ${skipped.length} already imported (use "reissue" for a new link): ${skipped.join(', ')}`);
}

async function reissue(name) {
  if (!SITE.startsWith('https://')) die('Set SITE_URL in .env to the live site, e.g. https://your-project.vercel.app');
  if (!name) die('Usage: npm run guests -- reissue "Exact Name"');
  const code = newCode();
  const updated = await db(`invitation_parties?display_name=eq.${encodeURIComponent(name)}&select=display_name,max_guests,is_group`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ token_hash: hash(code) }),
  });
  if (!updated.length) die(`No party named exactly "${name}".`);
  const p = updated[0];
  const path = await save('links-reissued', [['name', 'max_guests', 'group', 'link'], [p.display_name, p.max_guests, p.is_group ? 'ya' : '', link(p.display_name, code)]]);
  console.log(`New link for ${updated[0].display_name} (the previous link no longer works): ${path}`);
}

/** Member names from one cell, separated by |; each trimmed, unique within the group. */
function memberNames(cell, where) {
  const names = cell.split('|').map((name) => name.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const seen = new Set();
  for (const name of names) {
    if ([...name].length > 100) die(`${where}: member "${name}" is longer than 100 characters.`);
    if (seen.has(name.toLowerCase())) die(`${where}: member "${name}" appears twice in this group.`);
    seen.add(name.toLowerCase());
  }
  return names;
}

async function addMembers(group, cell) {
  if (!group || !cell) die('Usage: npm run guests -- members "Exact Group Name" "Name A|Name B"');
  const [party] = await db(`invitation_parties?display_name=eq.${encodeURIComponent(group)}&select=id,is_group`);
  if (!party) die(`No party named exactly "${group}".`);
  if (!party.is_group) die(`"${group}" is a personal invitation, not a group.`);
  const current = new Set((await db(`group_members?party_id=eq.${party.id}&select=name`)).map((m) => m.name.toLowerCase()));
  const names = memberNames(cell, 'members').filter((name) => !current.has(name.toLowerCase()));
  if (!names.length) { console.log('No new members to add.'); return; }
  await db('group_members', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(names.map((name) => ({ party_id: party.id, name }))) });
  console.log(`Added ${names.length} members to "${group}": ${names.join(', ')}. The group's link is unchanged.`);
}

async function exportAll() {
  const all = await db('invitation_parties?select=display_name,max_guests,is_group,checked_in_at,created_at,rsvps(attendance,guest_count,updated_at),group_rsvps(name,attendance,guest_count,updated_at),group_members(name,attendance,answered_at,checked_in_at)&order=display_name');
  const parties = all.filter((p) => !p.is_group);
  const groups = all.filter((p) => p.is_group);
  const answers = groups.flatMap((g) => (g.group_rsvps ?? []).map((r) => ({ ...r, group: g })));
  const members = groups.flatMap((g) => (g.group_members ?? []).map((m) => ({ ...m, group: g })));
  // One row per personal invitation, one per person who answered through a group link, and one
  // per listed group member (answered or not).
  const guests = await save('attendance', [
    ['name', 'group', 'max_guests', 'attendance', 'guest_count', 'rsvp_updated_at', 'checked_in_at'],
    ...parties.map((p) => {
      const r = Array.isArray(p.rsvps) ? p.rsvps[0] : p.rsvps;
      return [p.display_name, '', p.max_guests, r?.attendance ?? '', r?.guest_count ?? '', r?.updated_at ?? '', p.checked_in_at ?? ''];
    }),
    ...answers.map((r) => [r.name, r.group.display_name, r.group.max_guests, r.attendance, r.guest_count, r.updated_at, r.group.checked_in_at ?? '']),
    ...members.map((m) => [m.name, m.group.display_name, 1, m.attendance ?? '', m.attendance === 'attending' ? 1 : m.attendance ? 0 : '', m.answered_at ?? '', m.checked_in_at ?? '']),
  ]);
  const wishes = await db('wishes?select=name,message,approved,created_at,invitation_parties(display_name)&order=created_at');
  const wishesPath = await save('wishes', [
    ['party', 'name', 'message', 'approved', 'created_at'],
    ...wishes.map((w) => [w.invitation_parties?.display_name ?? '', w.name, w.message, w.approved, w.created_at]),
  ]);
  const attending = parties.filter((p) => (Array.isArray(p.rsvps) ? p.rsvps[0] : p.rsvps)?.attendance === 'attending');
  const people = attending.reduce((sum, p) => sum + ((Array.isArray(p.rsvps) ? p.rsvps[0] : p.rsvps)?.guest_count ?? 0), 0);
  console.log(`${parties.length} parties, ${attending.length} attending (${people} people), ${parties.filter((p) => p.checked_in_at).length} checked in.`);
  for (const g of groups) {
    const rows = g.group_rsvps ?? [];
    const listed = g.group_members ?? [];
    const coming = rows.filter((r) => r.attendance === 'attending').reduce((sum, r) => sum + r.guest_count, 0)
      + listed.filter((m) => m.attendance === 'attending').length;
    const answered = rows.length + listed.filter((m) => m.attendance).length;
    console.log(`Group "${g.display_name}": ${answered} answers${listed.length ? ` of ${listed.length} members` : ''}, ${coming} people attending.`);
  }
  console.log(`Saved ${guests} and ${wishesPath}`);
}

const [command, arg, extra] = process.argv.slice(2);
if (command === 'import') await importGuests(arg ?? die('Usage: npm run guests -- import private/guests.csv'));
else if (command === 'reissue') await reissue(arg);
else if (command === 'export') await exportAll();
else if (command === 'members') await addMembers(arg, extra);
else die('Usage: npm run guests -- import <file.csv> | reissue "<name>" | export | members "<group>" "A|B"');
