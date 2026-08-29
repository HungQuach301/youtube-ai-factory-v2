import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

const CONFIG_PATH = resolve('qualification-runs/g02i-evidence-closure.json')
const DIMENSIONS = [
  'FACTUAL_SAFETY', 'SEMANTIC_ALIGNMENT', 'VOICE_INTELLIGIBILITY', 'STORY_PAYOFF',
  'VISUAL_DIRECTION', 'MUSIC_SOUND_DESIGN', 'RETENTION', 'MOBILE_LEGIBILITY',
  'PACKAGING_CTR', 'EXECUTIVE_PRODUCER', 'COMPETITIVE_EDITOR', 'OVERALL',
]
const VERDICTS = ['FAIL', 'BORDERLINE', 'PASS']
const DEFECT_CLASSES = [
  'BLACK_FRAME', 'FREEZE_FRAME', 'SILENCE', 'CLIPPING', 'DROP_FRAME',
  'MOBILE_LEGIBILITY', 'SAFE_ZONE', 'TIMELINE',
]

const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const requireInside = (root, path) => {
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) throw new Error(`OUTPUT_PATH_OUTSIDE_ROOT:${path}`)
}
const writeExact = async (path, bytes) => {
  await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}
const writeCanonical = async (path, value) => writeExact(path, Buffer.from(`${canonicalize(value)}\n`, 'utf8'))

function validateConfig(config) {
  const source = config.sourceCalibration
  if (config.workPackage !== 'G-02I-0' || config.namespace !== 'qualification'
    || config.state !== 'AWAITING_REAL_CANDIDATES' || config.productionEligible !== false
    || config.providerDispatch !== 'OFF' || config.autoPublish !== 'OFF') throw new Error('INVALID_G02I0_CONFIG')
  if (source.workPackage !== 'G-02H-B' || source.runId !== 33239075196 || source.artifactId !== 9710824802
    || source.artifactZipSha256 !== '51e8d62fa1ea029c8bfb109581fceb50329b1c602dbb0121c22512c786d1ae73'
    || source.canonicalBundleSha256 !== '05ad1486bc78f2e9f7e897c6dd9dce9ec4dfbacb16a9c843cf039d43d03da0d9'
    || source.passed !== true || source.threshold !== 0.01 || source.residualSampleIds.length !== 0) {
    throw new Error('UNSEALED_OR_FAILED_G02H_SOURCE')
  }
  if (config.targets.rejectedMasters !== 15 || config.targets.rubricAnchors !== 36
    || config.targets.ownerJudgments !== 51 || config.targets.ownerRationaleMinChars !== 20) throw new Error('INVALID_CLOSURE_TARGETS')
}

function createPacket(config) {
  const rejectedMasters = Array.from({ length: config.targets.rejectedMasters }, (_, index) => ({
    slotId: `rejected-master-${String(index + 1).padStart(2, '0')}`,
    requirement: 'REAL_TRACK_G_REJECTED_MASTER',
    candidate: null,
    ownerJudgment: null,
  }))
  const rubricAnchors = DIMENSIONS.flatMap((dimension) => VERDICTS.map((requiredVerdict) => ({
    slotId: `anchor-${dimension.toLowerCase().replaceAll('_', '-')}-${requiredVerdict.toLowerCase()}`,
    dimension,
    requiredVerdict,
    candidate: null,
    ownerJudgment: null,
  })))
  return {
    schemaVersion: 1,
    workPackage: 'G-02I-0',
    namespace: 'qualification',
    state: 'AWAITING_REAL_CANDIDATES',
    createdAt: config.createdAt,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    qualificationState: 'NOT_QUALIFIED',
    sourceCalibration: config.sourceCalibration,
    targets: config.targets,
    ownerActorIdentity: null,
    rejectedMasters,
    rubricAnchors,
  }
}

function evaluate(packet) {
  const realRejected = packet.rejectedMasters.filter((slot) => slot.candidate?.provenance === 'track_g_rejected_master')
  const anchorCandidates = packet.rubricAnchors.filter((slot) => slot.candidate !== null)
  const rejectedJudgments = packet.rejectedMasters.filter((slot) => slot.ownerJudgment !== null)
  const anchorJudgments = packet.rubricAnchors.filter((slot) => slot.ownerJudgment !== null)
  const blockers = []
  if (realRejected.length < packet.targets.rejectedMasters) blockers.push(`REJECTED_MASTER_CANDIDATES_REQUIRED:${packet.targets.rejectedMasters - realRejected.length}`)
  if (anchorCandidates.length < packet.targets.rubricAnchors) blockers.push(`RUBRIC_ANCHOR_CANDIDATES_REQUIRED:${packet.targets.rubricAnchors - anchorCandidates.length}`)
  if (packet.ownerActorIdentity === null) blockers.push('ACTIVE_OWNER_IDENTITY_REQUIRED')
  const judgmentMissing = packet.targets.ownerJudgments - rejectedJudgments.length - anchorJudgments.length
  if (judgmentMissing > 0) blockers.push(`OWNER_JUDGMENTS_REQUIRED:${judgmentMissing}`)
  return {
    schemaVersion: 1,
    workPackage: 'G-02I-0',
    state: blockers.length === 0 ? 'EVIDENCE_READY' : 'AWAITING_REAL_CANDIDATES',
    calibrationReady: packet.sourceCalibration.passed && packet.sourceCalibration.residualSampleIds.length === 0,
    criticQualificationReady: blockers.length === 0,
    qualificationState: 'NOT_QUALIFIED',
    productionEligible: false,
    providerCallCount: 0,
    counts: {
      rejectedMasterSlots: packet.rejectedMasters.length,
      realRejectedMasterCandidates: realRejected.length,
      rejectedMasterJudgments: rejectedJudgments.length,
      rubricAnchorSlots: packet.rubricAnchors.length,
      rubricAnchorCandidates: anchorCandidates.length,
      rubricAnchorJudgments: anchorJudgments.length,
    },
    blockers,
  }
}

const escapeScriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
function renderWorkspace(packet) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G-02I-0 Evidence Closure</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#07111f;color:#e5edf7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 90% 0,#173b67,#07111f 40%);min-height:100vh}main{width:min(1240px,calc(100% - 28px));margin:28px auto 70px}header,.panel{background:#0c1a2b;border:1px solid #284463;border-radius:16px;padding:22px}.eyebrow{color:#7dd3fc;font-size:12px;font-weight:800;letter-spacing:.12em}h1{margin:8px 0}.guard{display:flex;gap:8px;flex-wrap:wrap}.badge{border:1px solid #3a5775;border-radius:999px;padding:5px 9px;font-size:12px}.bad{color:#fecaca;border-color:#7f1d1d}.good{color:#bbf7d0;border-color:#166534}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.metric{background:#0e2137;border:1px solid #294963;border-radius:12px;padding:14px}.metric span{display:block;color:#8eabc5;font-size:12px}.metric strong{font-size:24px}.toolbar,nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}button,.file{background:#173654;color:#e5edf7;border:1px solid #3a648b;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer}.file input{display:none}input[type=text],textarea,select{width:100%;background:#081625;color:#e5edf7;border:1px solid #35526e;border-radius:8px;padding:8px}textarea{min-height:76px}nav button[aria-selected=true]{background:#0ea5e9;color:#04111d}.panel{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px;border-bottom:1px solid #233d55;text-align:left;vertical-align:top}th{color:#8fb4d4}.empty{color:#94a3b8}.status{color:#fcd34d;margin-top:12px}.locked{opacity:.55}small,code{color:#9cc6e8}@media(max-width:820px){.metrics{grid-template-columns:repeat(2,1fr)}table{min-width:920px}}</style></head><body><main>
<header><div class="eyebrow">G-02I-0 · QUALIFICATION ONLY</div><h1>Evidence Closure Workspace</h1><div class="guard"><span class="badge bad">NOT_QUALIFIED</span><span class="badge good">G-02H calibration sealed</span><span class="badge good">Provider dispatch OFF</span><span class="badge good">Auto-publish OFF</span></div><p>Nạp packet có asset thật, chọn media files cục bộ để xem/nghe, rồi ghi phán quyết owner. Trang chạy offline; không gửi media hoặc judgment ra mạng.</p><div class="toolbar"><label class="file">Nạp closure packet<input id="packetInput" type="file" accept="application/json"></label><label class="file">Chọn media để review<input id="mediaInput" type="file" multiple accept="audio/*,video/*,image/*"></label><label style="min-width:280px">Owner identity<input id="owner" type="text" placeholder="Active OWNER allowlist identity"></label><button id="export">Xuất packet đã review</button></div><div id="status" class="status">Chưa có candidate thật; các ô phán quyết đang khóa.</div></header>
<section class="metrics"><div class="metric"><span>Calibration</span><strong>PASS</strong></div><div class="metric"><span>Rejected masters</span><strong id="rm">0 / 15</strong></div><div class="metric"><span>Rubric anchors</span><strong id="ra">0 / 36</strong></div><div class="metric"><span>Owner judgments</span><strong id="oj">0 / 51</strong></div></section>
<nav><button data-lane="rejectedMasters" aria-selected="true">Rejected masters</button><button data-lane="rubricAnchors" aria-selected="false">Rubric anchors</button></nav><section class="panel"><div id="root"></div></section>
</main><script>
const TEMPLATE=${escapeScriptJson(packet)};const DEFECTS=${escapeScriptJson(DEFECT_CLASSES)};let packet=structuredClone(TEMPLATE),lane='rejectedMasters',media=new Map();const el=id=>document.getElementById(id);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function candidateCount(){return packet[lane].filter(s=>s.candidate).length}function judgmentCount(){return [...packet.rejectedMasters,...packet.rubricAnchors].filter(s=>s.ownerJudgment).length}function totals(){el('rm').textContent=packet.rejectedMasters.filter(s=>s.candidate?.provenance==='track_g_rejected_master').length+' / 15';el('ra').textContent=packet.rubricAnchors.filter(s=>s.candidate).length+' / 36';el('oj').textContent=judgmentCount()+' / 51'}
function preview(slot){const name=slot.candidate?.asset?.fileName;if(!name||!media.has(name))return '<small>Chọn media file: '+esc(name||'chưa có candidate')+'</small>';const file=media.get(name),url=URL.createObjectURL(file);return file.type.startsWith('video/')?'<video controls width="260" src="'+url+'"></video>':file.type.startsWith('audio/')?'<audio controls src="'+url+'"></audio>':'<img width="220" src="'+url+'" alt="evidence">'}
function judgment(slot,index){if(!slot.candidate)return '<span class="locked">Khóa đến khi có asset thật</span>';const j=slot.ownerJudgment||{};if(lane==='rejectedMasters')return '<select data-field="defect" data-index="'+index+'"><option value="">Defect class</option>'+DEFECTS.map(x=>'<option '+(j.defectClass===x?'selected':'')+'>'+x+'</option>').join('')+'</select><select data-field="severity" data-index="'+index+'"><option value="">Severity</option>'+['P0','P1','P2'].map(x=>'<option '+(j.severity===x?'selected':'')+'>'+x+'</option>').join('')+'</select><div style="display:flex;gap:6px"><input type="text" data-field="tStart" data-index="'+index+'" placeholder="t_start" value="'+esc(j.tStart??'')+'"><input type="text" data-field="tEnd" data-index="'+index+'" placeholder="t_end" value="'+esc(j.tEnd??'')+'"></div><textarea data-field="rationale" data-index="'+index+'" placeholder="Lý do ≥20 ký tự">'+esc(j.rationale||'')+'</textarea>';return '<select data-field="verdict" data-index="'+index+'">'+['','FAIL','BORDERLINE','PASS'].map(x=>'<option '+(j.verdict===x?'selected':'')+'>'+x+'</option>').join('')+'</select><textarea data-field="rationale" data-index="'+index+'" placeholder="Lý do ≥20 ký tự">'+esc(j.rationale||'')+'</textarea>'}
function save(){const actor=el('owner').value.trim();packet.ownerActorIdentity=actor||null;document.querySelectorAll('[data-field]').forEach(input=>{const slot=packet[lane][Number(input.dataset.index)];if(!slot.candidate)return;slot.ownerJudgment=slot.ownerJudgment||{actorIdentity:actor,decidedAt:new Date().toISOString()};slot.ownerJudgment.actorIdentity=actor;const key=input.dataset.field;slot.ownerJudgment[key]=key==='tStart'||key==='tEnd'?Number(input.value):input.value.trim()});packet[lane].forEach(s=>{if(s.ownerJudgment&&!s.ownerJudgment.rationale)s.ownerJudgment=null})}
function render(){const rows=packet[lane];el('root').innerHTML='<table><thead><tr><th>Slot</th><th>Required class</th><th>Evidence</th><th>Owner judgment</th></tr></thead><tbody>'+rows.map((s,i)=>'<tr><td><code>'+esc(s.slotId)+'</code></td><td>'+esc(lane==='rubricAnchors'?s.dimension+' · '+s.requiredVerdict:s.requirement)+'</td><td>'+preview(s)+'</td><td>'+judgment(s,i)+'</td></tr>').join('')+'</tbody></table>';totals()}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{save();lane=b.dataset.lane;document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',String(x===b)));render()});el('packetInput').onchange=async e=>{packet=JSON.parse(await e.target.files[0].text());el('owner').value=packet.ownerActorIdentity||'';el('status').textContent='Đã nạp packet; chỉ candidate có asset thật mới mở ô review.';render()};el('mediaInput').onchange=e=>{media=new Map([...e.target.files].map(f=>[f.name,f]));render()};el('export').onclick=()=>{save();const blob=new Blob([JSON.stringify(packet,null,2)+'\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='g02i-evidence-closure.reviewed.json';a.click();URL.revokeObjectURL(a.href);render()};render();
</script></body></html>`
}

async function materialize(outputArg) {
  const output = resolve(outputArg)
  await mkdir(output, { recursive: true })
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  validateConfig(config)
  const packet = createPacket(config)
  const readiness = evaluate(packet)
  if (readiness.criticQualificationReady || readiness.providerCallCount !== 0 || readiness.productionEligible) throw new Error('EMPTY_CLOSURE_PACKET_MUST_FAIL_CLOSED')
  const outputs = {
    'closure-packet.json': `${canonicalize(packet)}\n`,
    'readiness.json': `${canonicalize(readiness)}\n`,
    'batch-review.html': renderWorkspace(packet),
    'OWNER-ACTION.md': '# G-02I-0 Owner review\n\nNo action is required until real candidate assets are loaded. Review requires 15 rejected masters and 36 rubric anchors. AI/service identities cannot create owner judgments.\n',
  }
  const files = {}
  for (const [name, content] of Object.entries(outputs)) {
    const path = resolve(output, name); requireInside(output, path); files[name] = await writeExact(path, Buffer.from(content, 'utf8'))
  }
  const manifest = { schemaVersion: 1, workPackage: 'G-02I-0', namespace: 'qualification', state: readiness.state, createdAt: config.createdAt, productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF', qualificationState: 'NOT_QUALIFIED', sourceCalibration: config.sourceCalibration, targets: config.targets, slotCounts: { rejectedMasters: packet.rejectedMasters.length, rubricAnchors: packet.rubricAnchors.length }, files }
  const manifestSha256 = await writeCanonical(resolve(output, 'manifest.json'), manifest)
  await writeCanonical(resolve(output, 'manifest.sha256.json'), { algorithm: 'sha256', file: 'manifest.json', sha256: manifestSha256 })
  process.stdout.write(`${canonicalize({ manifestSha256, state: readiness.state, providerCallCount: 0 })}\n`)
}

async function snapshot(rootArg) {
  const root = resolve(rootArg), names = (await readdir(root)).filter((name) => name !== 'replay-receipt.json').sort(), files = {}
  for (const name of names) { const path = resolve(root, name); requireInside(root, path); files[name] = sha256(await readFile(path)) }
  return files
}
async function verify(firstArg, replayArg) {
  const [first, replay] = await Promise.all([snapshot(firstArg), snapshot(replayArg)])
  const firstHash = sha256(Buffer.from(canonicalize(first))), replayHash = sha256(Buffer.from(canonicalize(replay)))
  if (firstHash !== replayHash) throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  await writeCanonical(resolve(firstArg, 'replay-receipt.json'), { schemaVersion: 1, workPackage: 'G-02I-0', accepted: true, replayed: true, canonicalOutputHash: firstHash, providerCallsDuringReplay: 0, productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF', qualificationState: 'NOT_QUALIFIED' })
}
const args = process.argv.slice(2)
if (args[0] === '--output' && args.length === 2) await materialize(args[1])
else if (args[0] === '--verify-replay' && args.length === 3) await verify(args[1], args[2])
else throw new Error('Usage: --output <dir> | --verify-replay <first> <replay>')
