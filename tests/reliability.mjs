import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const { createServer } = await import('vite')
const { spawn } = await import('node:child_process')
const { tmpdir } = await import('node:os')
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } })
await server.listen()
const origin = 'http://127.0.0.1:' + server.httpServer.address().port
const profile = await fs.mkdtemp(tmpdir() + '/pehchaan-test-')
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', '--user-data-dir='+profile, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore','ignore','pipe'] })
const debugPort = await new Promise((resolve,reject) => {
  const timer = setTimeout(()=>reject(new Error('Chrome startup timed out')),15000)
  chrome.on('error', reject)
  chrome.stderr.on('data', data => { const match=String(data).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if(match){clearTimeout(timer);resolve(Number(match[1]))} })
})
const targets = await (await fetch('http://127.0.0.1:'+debugPort+'/json')).json()
const target = targets.find(t => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
let serial = 0
const requests = new Map()
const errors = []
ws.addEventListener('message', event => {
  const m = JSON.parse(event.data)
  if (m.id) {
    const entry = requests.get(m.id)
    if (!entry) return
    requests.delete(m.id)
    m.error ? entry.reject(new Error(JSON.stringify(m.error))) : entry.resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description ?? ''))
})
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial
    requests.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(expression, timeout = 12000) {
  const until = Date.now() + timeout
  while (Date.now() < until) { if (await evaluate(expression)) return; await pause(60) }
  throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`)
}
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`)
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error('Button unavailable: '+${JSON.stringify(text)}); b.click(); })()`)
}
async function reload() { await cdp('Page.reload'); await pause(300); await wait("document.querySelector('.attract, .review, .capture, .hold, .capture-status') && !document.querySelector('vite-error-overlay')") }
async function records() { return evaluate(`(async()=>{const s=await import('/src/lib/photoStore.ts');return {active:await s.getMetaValue('activeSession'),stats:await s.getStorageStats(),photos:await s.listPhotoSummaries()}})()`) }
async function login() {
  await click('Staff'); await wait("!!document.querySelector('.pin-pad')")
  for (const digit of '482917') { await click(digit); await pause(25) }
  await wait("!!document.querySelector('.staff-body')")
}
async function capture() {
  await wait("document.querySelector('.capture-shutter') && !document.querySelector('.capture-shutter').disabled")
  await evaluate("document.querySelector('.capture-shutter').click()")
  await wait("!!document.querySelector('.review')", 15000)
}
async function loadPack(pack) {
  await evaluate(`(() => { const input=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(pack))}], 'test-pack.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await wait(`document.querySelector('.staff-pack-name')?.textContent === ${JSON.stringify(pack.eventName)}`)
}
function pass(name) { console.log('PASS', name) }
try {
  await cdp('Runtime.enable')
  await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true })
  await cdp('Page.navigate', { url: origin })
  await wait("!!document.querySelector('.attract')", 30000)
  assert.deepEqual(await evaluate('[innerWidth,innerHeight]'), [820,1180])
  pass('Chrome 820 × 1180 boots')
  const initial = await records()
  assert.equal(initial.stats.count, 0, 'Use a fresh isolated Chrome profile')
  await click('1 Shot'); await click('Start'); await capture()
  await wait("!!document.querySelector('.is-composed')")
  let r = await records(); assert.equal(r.active.mode,1);assert.equal(r.stats.count,1)
  const guestIds = r.photos.map(p=>p.id)
  await click('Done'); await wait("!!document.querySelector('.attract')")
  pass('1-shot capture, JPEG composition and Done')
  await click('3 Shots');await click('Start')
  for(let i=0;i<3;i++){await capture();if(i<2)await click('Next')}
  await wait("!!document.querySelector('.is-composed')")
  r=await records();assert.equal(r.active.photoIds.filter(Boolean).length,3);assert.equal(r.stats.count,4)
  guestIds.splice(0,guestIds.length,...r.photos.map(p=>p.id))
  await click('Done');await wait("!!document.querySelector('.attract')")
  pass('3-shot flow saves exactly three photos')
  await login()
  await fs.writeFile('/tmp/pehchaan-staff-820.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await click('Test Shot');await capture();await wait("!!document.querySelector('.is-composed')");await click('Done')
  await wait("!!document.querySelector('.staff-body')")
  assert.equal((await records()).stats.count,5)
  await click('Reset test data');assert.equal((await records()).stats.count,5)
  await click('Cancel reset');assert.equal((await records()).stats.count,5)
  await click('Reset test data');await click('Confirm reset test data')
  await wait("document.querySelector('.staff-storage strong')?.textContent === '4'")
  r=await records();assert.deepEqual(r.photos.map(p=>p.id).sort(),guestIds.sort());assert.equal(r.stats.count,4)
  assert.match(await evaluate("document.querySelector('.storage-hud').textContent"),/^4/)
  pass('PIN, Test Shot, reset confirmation, guest preservation and shared statistics')
  const share=JSON.parse(await fs.readFile(new URL('../public/event-packs/share-enabled.json',import.meta.url),'utf8'))
  share.eventName='Geometry test';share.composition.width=500;share.composition.height=700;share.composition.overlayEnabled=false
  share.composition.slots=[{id:'custom',shotNumber:1,x:25,y:35,width:450,height:550,fit:'contain',effect:'none'}]
  share.composition.texts=[]
  await loadPack(share);await click('Back to booth');await wait("!!document.querySelector('.attract')")
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='3 Shots').disabled"),true)
  await click('Start');await capture();await wait("!!document.querySelector('.is-composed')")
  assert.deepEqual(await evaluate("(()=>{const i=document.querySelector('.is-composed');return [i.naturalWidth,i.naturalHeight]})()"),[500,700])
  r=await records();assert.equal(r.active.packSnapshot.id,share.id);assert.equal(r.active.packSnapshot.composition.slots[0].x,25)
  await reload();await wait("!!document.querySelector('.is-composed')")
  assert.deepEqual(await evaluate("(()=>{const i=document.querySelector('.is-composed');return [i.naturalWidth,i.naturalHeight]})()"),[500,700])
  await click('Done');await wait("!!document.querySelector('.attract')")
  pass('Local pack load, incompatible mode disabled, custom geometry and reload')
  await login();await click('Use Default Design');await wait("document.querySelector('.staff-pack-name')?.textContent === 'Pehchaan Photobooth'");await click('Back to booth')
  await wait("!!document.querySelector('.attract')")
  await evaluate(`window.__encode=HTMLCanvasElement.prototype.toBlob;window.__pending=[];HTMLCanvasElement.prototype.toBlob=function(cb,...args){if(this.width===820&&this.height===1180){window.__encode.call(this,b=>window.__pending.push(()=>cb(b)),...args)}else window.__encode.call(this,cb,...args)}`)
  await click('1 Shot');await click('Start');await capture();await wait('window.__pending.length>0')
  const old=(await records()).active
  await click('Retake');await wait("!!document.querySelector('.capture')")
  await evaluate('window.__pending.splice(0).forEach(f=>f())');await pause(150)
  assert.equal(await evaluate(`(async()=>{const s=await import('/src/lib/photoStore.ts');return Boolean(await s.getDerived(${JSON.stringify('composition:'+old.id)}))})()`),false)
  await capture();await wait('window.__pending.length>0')
  await click('Done');await wait("!!document.querySelector('.attract')")
  await evaluate('window.__pending.splice(0).forEach(f=>f());HTMLCanvasElement.prototype.toBlob=window.__encode');await pause(150)
  assert.equal((await records()).active,undefined)
  assert.equal(await evaluate(`(async()=>{const s=await import('/src/lib/photoStore.ts');return Boolean(await s.getDerived(${JSON.stringify('composition:'+old.id)}))})()`),false)
  pass('Retake and Done discard deliberately delayed composition results')
  await login()
  await evaluate(`window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...args){if(this.name==='meta'&&v.key==='eventStatus')throw new DOMException('Test write failure','QuotaExceededError');return window.__put.call(this,v,...args)}`)
  await click('Pause');await wait("document.querySelector('.staff-alert')?.textContent.includes('Action failed')")
  assert.equal(await evaluate("document.querySelector('.staff-live').textContent"),'live')
  await evaluate('IDBObjectStore.prototype.put=window.__put')
  await click('Back to booth');await wait("!!document.querySelector('.attract')")
  pass('Failed event-status persistence does not advance UI')
  await evaluate(`(async()=>{const s=await import('/src/lib/photoStore.ts');window.__validAuth=await s.getMetaValue('staffAuth');await s.putMetaValue('staffAuth',{hash:'bad',salt:'bad'})})()`)
  await reload();await click('Staff');await wait("!!document.querySelector('.pin-pad')")
  assert.equal(await evaluate("!!document.querySelector('.staff-body')"),false)
  assert.equal(await evaluate("document.querySelector('.pin-key').disabled"),true)
  pass('Corrupt authentication fails closed')
  await evaluate(`(async()=>{const s=await import('/src/lib/photoStore.ts');const p=await import('/src/staff/pinAuth.ts');await s.putMetaValue('staffAuth',await p.createStaffAuth())})()`)
  await reload();await login();await click('Test Shot');await capture();await wait("!!document.querySelector('.is-composed')")
  await reload();await wait("!!document.querySelector('.review')");await click('Done');await wait("!!document.querySelector('.pin-pad')")
  assert.equal(await evaluate("!!document.querySelector('.staff-body')"),false)
  pass('Restored test session requires fresh Staff authentication')
  const validation = await evaluate(`(async()=>{
    const {validateEventPack}=await import('/src/eventPack/validatePack.ts');const {getFallbackPack}=await import('/src/eventPack/fallbackPack.ts');const {validateSession}=await import('/src/lib/validateSession.ts');const pin=await import('/src/staff/pinAuth.ts');
    const p=getFallbackPack();p.composition.slots[0].x=-1;
    let a=await pin.createStaffAuth('123456');for(let i=0;i<5;i++)a=(await pin.verifyStaffPin('000000',a,1000)).auth;
    return [!validateEventPack(p).ok,validateSession({id:'bad',mode:3,photoIds:[]})===null,!(await pin.verifyStaffPin('123456',a,2000)).ok,(await pin.verifyStaffPin('123456',a,61001)).ok,!pin.isStaffAuthState({...a,iterations:1})];
  })()`)
  assert.deepEqual(validation,[true,true,true,true,true]);pass('Geometry/session/auth validation and PIN lockout/expiry')
  console.log('Runtime exceptions:',JSON.stringify(errors))
  assert.equal(errors.length,0)
} finally {
  ws.close();
  chrome.kill();
  await server.close();
  await pause(300);
  await fs.rm(profile,{recursive:true,force:true});
  process.exit(0);
}
