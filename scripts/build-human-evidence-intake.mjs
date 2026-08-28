import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import { canonicalHash, canonicalizeExact } from '../packages/core-hash/dist/index.js'
import {
  createQualificationIntakeTemplate,
  evaluateQualificationIntake,
  QUALIFICATION_ANCHOR_VERDICTS,
  QUALIFICATION_ASSURANCE_DIMENSIONS,
  QUALIFICATION_DEFECT_CLASSES,
  QUALIFICATION_INTAKE_TARGETS,
} from '../packages/human-evidence/dist/src/qualification-intake.js'

const EXPECTED_WORK_PACKAGE = 'G-02F'
const EXPECTED_NAMESPACE = 'qualification'
const MARKER_PATH = resolve('qualification-runs/human-evidence-intake.json')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const requireInside = (root, path) => {
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`OUTPUT_PATH_OUTSIDE_ROOT:${path}`)
  }
}

const writeExact = async (path, bytes) => {
  await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}

const writeCanonical = async (path, value) => writeExact(
  path,
  Buffer.from(`${canonicalizeExact(value)}\n`, 'utf8'),
)

const readMarker = async () => {
  const marker = JSON.parse(await readFile(MARKER_PATH, 'utf8'))
  if (marker.schemaVersion !== 1
    || marker.workPackage !== EXPECTED_WORK_PACKAGE
    || marker.namespace !== EXPECTED_NAMESPACE
    || marker.state !== 'DRAFT_ONLY'
    || marker.productionEligible !== false
    || marker.providerDispatch !== 'OFF'
    || marker.autoPublish !== 'OFF'
    || typeof marker.createdAt !== 'string') {
    throw new Error('INVALID_HUMAN_EVIDENCE_INTAKE_MARKER')
  }
  return marker
}

const renderReviewSurface = (template) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>G-02F · Human Evidence Batch Review</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#07111f; color:#e6edf7 }
    * { box-sizing:border-box } body { margin:0; background:radial-gradient(circle at top right,#17345a 0,#07111f 42%); min-height:100vh }
    main { width:min(1180px,calc(100% - 32px)); margin:32px auto 80px }
    header,.panel { background:#0d1b2d; border:1px solid #27415f; border-radius:16px; padding:22px; box-shadow:0 18px 60px #0005 }
    header { display:grid; gap:16px } h1 { margin:0; font-size:clamp(24px,4vw,42px) } h2 { margin:0 0 12px }
    .eyebrow { color:#7dd3fc; letter-spacing:.12em; text-transform:uppercase; font-weight:750; font-size:12px }
    .guard { display:flex; flex-wrap:wrap; gap:8px } .guard span,.badge { border:1px solid #365574; border-radius:999px; padding:6px 10px; font-size:12px }
    .danger { color:#fecaca; border-color:#7f1d1d!important; background:#450a0a80 } .safe { color:#bbf7d0; border-color:#166534!important; background:#052e1680 }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:16px 0 }
    .metric { background:#0a1626; border:1px solid #243b56; border-radius:14px; padding:16px } .metric strong { display:block; font-size:28px }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-top:16px }
    label { display:grid; gap:6px; color:#bad0e6; font-size:13px } input,textarea,button { font:inherit }
    input,textarea { color:#e6edf7; background:#07111f; border:1px solid #365574; border-radius:9px; padding:9px 11px }
    textarea { width:100%; min-height:68px; resize:vertical }
    button,.file-label { cursor:pointer; color:#e6edf7; background:#17345a; border:1px solid #3f6a96; border-radius:10px; padding:10px 14px; font-weight:700 }
    button:hover,.file-label:hover { background:#20466f } input[type=file] { position:absolute; width:1px; height:1px; opacity:0 }
    nav { display:flex; gap:8px; margin:18px 0 } nav button[aria-selected=true] { background:#0ea5e9; color:#06111e }
    table { width:100%; border-collapse:collapse; font-size:13px } th,td { text-align:left; padding:10px; border-bottom:1px solid #243b56; vertical-align:top }
    th { color:#90b4d4; position:sticky; top:0; background:#0d1b2d } code { color:#bae6fd; word-break:break-all }
    .empty { color:#90a4bb; text-align:center; padding:36px } .status { margin-top:12px; color:#fcd34d }
    @media(max-width:800px){ .grid{grid-template-columns:repeat(2,1fr)} table{display:block;overflow:auto} }
  </style>
</head>
<body><main>
  <header>
    <div class="eyebrow">G-02F · Qualification-only workspace</div>
    <h1>Human Evidence Batch Review</h1>
    <div class="guard"><span class="danger">DRAFT_ONLY</span><span class="safe">Provider dispatch OFF</span><span class="safe">Auto-publish OFF</span><span class="safe">Production eligible: false</span></div>
    <p>Nạp packet JSON đã chứa tham chiếu bằng chứng thật, rà theo batch, ghi owner rationale rồi tải packet đã cập nhật. Trang này chạy offline và không gửi dữ liệu ra mạng.</p>
    <div class="toolbar">
      <label class="file-label">Nạp intake packet<input id="packetFile" type="file" accept="application/json"></label>
      <label class="file-label">Nạp read-back seals<input id="readbackFile" type="file" accept="application/json"></label>
      <label>Owner allowlist identity<input id="ownerIdentity" autocomplete="off" placeholder="Không dùng service/bot identity"></label>
      <button id="exportButton" type="button">Tải packet đã review</button>
    </div>
    <div id="status" class="status">Template đang trống; chưa có bằng chứng thật và chưa đủ điều kiện qualification.</div>
  </header>
  <section class="grid" aria-label="Tiến độ">
    <div class="metric"><span>Rejected masters</span><strong id="rejectedCount">0 / ${QUALIFICATION_INTAKE_TARGETS.rejectedMasterMin}</strong></div>
    <div class="metric"><span>Human-reader audio</span><strong id="alignerCount">0 / ${QUALIFICATION_INTAKE_TARGETS.alignerMin}-${QUALIFICATION_INTAKE_TARGETS.alignerMax}</strong></div>
    <div class="metric"><span>Rubric anchors</span><strong id="anchorCount">0 / ${QUALIFICATION_INTAKE_TARGETS.rubricAnchorCount}</strong></div>
    <div class="metric"><span>Sealed assets</span><strong id="sealedCount">0 / 0</strong></div>
  </section>
  <nav aria-label="Evidence lane">
    <button type="button" data-lane="rejectedMasters" aria-selected="true">Rejected masters</button>
    <button type="button" data-lane="alignerSamples" aria-selected="false">Aligner audio</button>
    <button type="button" data-lane="rubricAnchors" aria-selected="false">Rubric anchors</button>
  </nav>
  <section class="panel"><h2 id="laneTitle">Rejected masters</h2><div id="tableRoot"></div></section>
</main>
<script>
const TEMPLATE=${JSON.stringify(template).replace(/</gu, '\\u003c')};
const DEFECT_CLASSES=${JSON.stringify(QUALIFICATION_DEFECT_CLASSES)};
const DIMENSIONS=${JSON.stringify(QUALIFICATION_ASSURANCE_DIMENSIONS)};
const VERDICTS=${JSON.stringify(QUALIFICATION_ANCHOR_VERDICTS)};
let packet=structuredClone(TEMPLATE),readbacks=[],lane='rejectedMasters';
const byId=(id)=>document.getElementById(id);
const readJson=async(file)=>JSON.parse(await file.text());
const items=()=>Array.isArray(packet[lane])?packet[lane]:[];
function sealCount(){const map=new Map(readbacks.map(x=>[x.r2Key,x]));return ['rejectedMasters','alignerSamples','rubricAnchors'].flatMap(k=>packet[k]||[]).filter(x=>{const r=map.get(x.asset?.r2Key);return r&&r.sha256===x.asset.sha256&&r.sizeBytes===x.asset.sizeBytes}).length}
function totals(){const total=['rejectedMasters','alignerSamples','rubricAnchors'].flatMap(k=>packet[k]||[]).length;byId('rejectedCount').textContent=(packet.rejectedMasters||[]).filter(x=>x.ownerJudgment).length+' / ${QUALIFICATION_INTAKE_TARGETS.rejectedMasterMin}';byId('alignerCount').textContent=(packet.alignerSamples||[]).length+' / ${QUALIFICATION_INTAKE_TARGETS.alignerMin}-${QUALIFICATION_INTAKE_TARGETS.alignerMax}';byId('anchorCount').textContent=(packet.rubricAnchors||[]).filter(x=>x.ownerJudgment).length+' / ${QUALIFICATION_INTAKE_TARGETS.rubricAnchorCount}';byId('sealedCount').textContent=sealCount()+' / '+total}
function reviewCell(item,index){if(lane==='alignerSamples')return '<span class="badge">human_reader</span><p>'+escapeHtml(item.transcript||'')+'</p>';const rationale=item.ownerJudgment?.rationale||'';return '<textarea data-index="'+index+'" placeholder="Owner rationale ≥ ${QUALIFICATION_INTAKE_TARGETS.ownerRationaleMinChars} ký tự">'+escapeHtml(rationale)+'</textarea>'}
function escapeHtml(value){return String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){const labels={rejectedMasters:'Rejected masters',alignerSamples:'Aligner audio',rubricAnchors:'Rubric anchors'};byId('laneTitle').textContent=labels[lane];const rows=items();if(!rows.length){byId('tableRoot').innerHTML='<div class="empty">Chưa có record thật trong lane này.</div>';totals();return}byId('tableRoot').innerHTML='<table><thead><tr><th>ID</th><th>Classification</th><th>Evidence seal</th><th>Owner review</th></tr></thead><tbody>'+rows.map((item,index)=>{const classification=lane==='rejectedMasters'?(item.groundTruth?.defectClass||'—')+' · '+(item.groundTruth?.severity||'—'):lane==='rubricAnchors'?(item.dimension||'—')+' · '+(item.verdict||'—'):(item.speakerId||'—');return '<tr><td>'+escapeHtml(item.id||'—')+'</td><td>'+escapeHtml(classification)+'</td><td><code>'+escapeHtml(item.asset?.r2Key||'missing')+'</code><br><small>'+escapeHtml((item.asset?.sha256||'').slice(0,16))+'… · '+escapeHtml(item.asset?.sizeBytes||0)+' B</small></td><td>'+reviewCell(item,index)+'</td></tr>'}).join('')+'</tbody></table>';totals()}
function applyReviews(){const actor=byId('ownerIdentity').value.trim();packet.ownerActorIdentity=actor||null;if(lane!=='alignerSamples')document.querySelectorAll('textarea[data-index]').forEach(field=>{const item=packet[lane][Number(field.dataset.index)];const rationale=field.value.trim();item.ownerJudgment=rationale?{actorIdentity:actor,rationale,decidedAt:item.ownerJudgment?.decidedAt||new Date().toISOString()}:null})}
document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>{applyReviews();lane=button.dataset.lane;document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',String(x===button)));render()}));
byId('packetFile').addEventListener('change',async event=>{packet=await readJson(event.target.files[0]);byId('ownerIdentity').value=packet.ownerActorIdentity||'';byId('status').textContent='Đã nạp packet. Hãy xác minh seal và owner rationale trước khi export.';render()});
byId('readbackFile').addEventListener('change',async event=>{const value=await readJson(event.target.files[0]);readbacks=Array.isArray(value)?value:(value.readbacks||[]);byId('status').textContent='Đã nạp read-back seals; chỉ seal khớp SHA-256 và byte length mới được đếm.';render()});
byId('exportButton').addEventListener('click',()=>{applyReviews();const blob=new Blob([JSON.stringify(packet,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='human-evidence-intake.reviewed.json';link.click();URL.revokeObjectURL(link.href);render()});
render();
</script></body></html>`

const materialize = async (outputArgument) => {
  const outputRoot = resolve(outputArgument)
  await mkdir(outputRoot, { recursive: true })
  const marker = await readMarker()
  const template = createQualificationIntakeTemplate(marker.createdAt)
  const readiness = evaluateQualificationIntake({ packet: template, actors: [], readbacks: [] })
  if (readiness.intakeComplete || readiness.providerCallCount !== 0 || readiness.productionEligible) {
    throw new Error('EMPTY_INTAKE_TEMPLATE_MUST_FAIL_CLOSED')
  }

  const templatePath = resolve(outputRoot, 'intake-template.json')
  const readinessPath = resolve(outputRoot, 'readiness.json')
  const surfacePath = resolve(outputRoot, 'batch-review.html')
  for (const path of [templatePath, readinessPath, surfacePath]) requireInside(outputRoot, path)
  const files = {
    'intake-template.json': await writeCanonical(templatePath, template),
    'readiness.json': await writeCanonical(readinessPath, readiness),
    'batch-review.html': await writeExact(surfacePath, Buffer.from(renderReviewSurface(template), 'utf8')),
  }
  const manifest = {
    schemaVersion: 1,
    workPackage: EXPECTED_WORK_PACKAGE,
    namespace: EXPECTED_NAMESPACE,
    state: 'DRAFT_ONLY',
    createdAt: marker.createdAt,
    productionEligible: false,
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    qualificationState: 'NOT_QUALIFIED',
    targets: QUALIFICATION_INTAKE_TARGETS,
    assuranceDimensions: QUALIFICATION_ASSURANCE_DIMENSIONS,
    anchorVerdicts: QUALIFICATION_ANCHOR_VERDICTS,
    defectClasses: QUALIFICATION_DEFECT_CLASSES,
    files,
  }
  const manifestPath = resolve(outputRoot, 'manifest.json')
  const manifestSha256 = await writeCanonical(manifestPath, manifest)
  await writeCanonical(resolve(outputRoot, 'manifest.sha256.json'), {
    algorithm: 'sha256', file: 'manifest.json', sha256: manifestSha256,
  })
  process.stdout.write(`${canonicalizeExact({ manifestSha256, state: manifest.state, targets: manifest.targets })}\n`)
}

const outputSnapshot = async (rootArgument) => {
  const root = resolve(rootArgument)
  const names = (await readdir(root)).filter((name) => name !== 'replay-receipt.json').sort()
  const files = {}
  for (const name of names) {
    const path = resolve(root, name)
    requireInside(root, path)
    files[name] = sha256(await readFile(path))
  }
  return files
}

const verifyReplay = async (firstArgument, replayArgument) => {
  const [first, replay] = await Promise.all([outputSnapshot(firstArgument), outputSnapshot(replayArgument)])
  if (canonicalHash(first) !== canonicalHash(replay)) throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  const receipt = {
    schemaVersion: 1,
    workPackage: EXPECTED_WORK_PACKAGE,
    namespace: EXPECTED_NAMESPACE,
    accepted: true,
    replayed: true,
    fileCount: Object.keys(first).length,
    canonicalOutputHash: canonicalHash(first),
    providerDispatch: 'OFF',
    autoPublish: 'OFF',
    productionEligible: false,
    qualificationState: 'NOT_QUALIFIED',
  }
  const receiptSha256 = await writeCanonical(resolve(firstArgument, 'replay-receipt.json'), receipt)
  process.stdout.write(`${canonicalizeExact({ ...receipt, receiptSha256 })}\n`)
}

const args = process.argv.slice(2)
if (args[0] === '--output' && args[1] !== undefined && args.length === 2) {
  await materialize(args[1])
} else if (args[0] === '--verify-replay' && args[1] !== undefined && args[2] !== undefined && args.length === 3) {
  await verifyReplay(args[1], args[2])
} else {
  throw new Error('Usage: --output <dir> | --verify-replay <first-dir> <replay-dir>')
}
