const FUNDO = [235, 45, 7];
const PUNHO = 0.25;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const numBracos = (c) => round(map(c.aberta, PUNHO, 1, 3, 12, true));
const BASE = 52;
const TIMBRES = [
  { nome: 'sino', onda: 'sine', ratio: 3.01, mix: 0.45, dur: 1.8 },
  { nome: 'harpa', onda: 'triangle', ratio: 2, mix: 0.30, dur: 1.0 },
  { nome: 'vidro', onda: 'sine', ratio: 4.2, mix: 0.25, dur: 2.4 },
  { nome: 'marimba', onda: 'sine', ratio: 4, mix: 0.60, dur: 0.5 },
];
const ESCALAS = [
  { nome: 'pentatónica maior', notas: [0, 2, 4, 7, 9] },
  { nome: 'pentatónica menor', notas: [0, 3, 5, 7, 10] },
  { nome: 'hirajoshi', notas: [0, 2, 3, 7, 8] },
];

let pg;
let raio;
let permanente = false;
let cam, landmarker, ultimoT = -1, maos = [];
let estado = 'a iniciar a câmara...';
let mostrarCam = true;
let canetas = [];
let luz = new Array(15).fill(0);
let timbre = 0, esc = 0, mudo = false;
let ac, saida, eco, feedback;

function setup() {
  createCanvas (windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 1);
  textFont('Georgia');
  criarCamada();
  iniciarMaos();
}

function criarCamada() {
  pg = createGraphics(width, height);
  pg.colorMode(HSB, 360, 100, 100, 1);
  pg.background(...FUNDO);
}

function draw() {
  raio = min(width, height) * 0.45;
  lerMaos();
  atualizarCanetas();
  if (!permanente) {
    pg.blendMode(BLEND);
    pg.noStroke();
    pg.fill(...FUNDO, 0.035);
    pg.rect(0, 0, width, height);
  }
  canetas.forEach((c, i) => { tocarNota(c, i); desenhar(c); });
  atualizarSom();
  image(pg, 0, 0);
  moldura();
  cursores();
  previsao();
  mensagens();
}

function simetria(n, fn) {
  for (let k = 0; k < n; k++) {
    pg.push();
    pg.rotate((k / n) * TWO_PI);
    fn();
    pg.scale(1, -1);
    fn();
    pg.pop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  criarCamada();
}

async function iniciarMaos() {
  try {
    cam = createCapture(VIDEO);
    cam.size(640, 480);
    cam.hide();
    estado = 'a carregar o modelo das mãos...';
    const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const { HandLandmarker, FilesetResolver } = await import(V + '/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(V + '/wasm');
    const opcoes = (delegate) => ({
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate,
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    try { landmarker = await HandLandmarker.createFromOptions(fileset, opcoes('GPU')); }
    catch (e) { landmarker = await HandLandmarker.createFromOptions(fileset, opcoes('CPU')); }
    estado= '';
  } catch (e) {
    estado = 'não foi possível iniciar as mãos (' + (e.name || e.message) + '). Recarrega a página.';
  }
}

function lerMaos() {
  const v = cam && cam.elt;
if (!landmarker || !v || v.readyState < 2 || v.currentTime === ultimoT) return;
ultimoT = v.currentTime;
try { maos = landmarker.detectForVideo(v, performance.now()).landmarks; }
catch (e) { maos = []; }
}

function previsao() {
  if (!mostrarCam || !cam) return;
  const w = 180, h = 135, x = width - w - 12, y = height - h - 12;
  push();
  translate(x + w, y);
  scale(-1, 1);
  tint(0, 0, 100, 0.45);
  image(cam, 0, 0, w, h);
  pop();
  noTint();
  noStroke();
  fill(0, 0, 100, 0.8);
  for (const lm of maos) for (const p of lm) circle(x + (1 - p.x) * w, y + p.y * h, 3);
}

function abertura(lm) {
  let r = 0;
  for (const f of [8, 12, 16, 20]) r += dist2(lm[f], lm[0]) / dist2(lm[9], lm[0]);
  return constrain(map(r / 4, 1.1, 1.9, 0, 1), 0, 1);
}

function atualizarCanetas() {
  canetas.length = maos.length;
  maos.forEach((lm, i) => {
    const px = (lm[0].x + lm[5].x + lm[9].x + lm[17].x) / 4;
    const py = (lm[0].y + lm[5].y + lm[9].y + lm[17].y) / 4;
    const alvoX = constrain(map(px, 0.85, 0.15, -1, 1), -1, 1) * raio;
    const alvoY = constrain(map(py, 0.15, 0.85, -1, 1), -1, 1) * raio;

    const c = canetas[i] || (canetas[i] = { x: alvoX, y: alvoY, aberta: 0, acc: 0, ultima: 0, nota: 0 });
    c.ax = c.x; c.ay = c.y;
    c.x = lerp(c.x, alvoX, 0.4);
    c.y = lerp(c.y, alvoY, 0.4);
    c.aberta = lerp(c.aberta, abertura(lm), 0.4);
    c.ativa = c.aberta > PUNHO;
    c.vel = dist(c.ax, c.ay, c.x, c.y);
  });
}

function desenhar(c) {
  if (!c.ativa || c.vel < 0.5) return;
  const n = numBracos(c);
  const matiz = map(dist(0, 0, c.x, c.y), 0, raio, 175, 330, true);
  pg.push();
  pg.translate(width / 2, height / 2);
  pg.blendMode(ADD);
  pg.strokeWeight(constrain(1 + c.vel * 0.04, 1, 3.5));
  pg.stroke(matiz, 60, 100, 0.5);
  simetria(n, () => pg.line(c.ax, c.ay, c.x, c.y));
  if (c.nota) {
    pg.noStroke();
    pg.fill(45, 25, 100, 0.9);
    simetria(n, () => pg.circle(c.x, c.y, 3 + c.nota * 25));
    c.nota = 0;
  }
  pg.blendMode(BLEND);
  pg.pop();
}

function cursores () {
  push();
  translate(width / 2, height / 2);
  noFill();
  strokeWeight(1.2);
  for (const c of canetas) {
    stroke(0, 0, 100, c.ativa ? 0.7 : 0.25);
    const n = c.ativa ? numBracos(c) : 1;
    for (let k = 0; k < n; k++) {
      push();
      rotate((k / n) * TWO_PI); 
      circle(c.x, c.y, c.ativa ? 10 : 6);
      pop();
    }
  }
  pop();
}

function moldura() {
  push();
  translate(width / 2, height / 2);
  noFill();
  stroke(0, 0, 100, 0.10);
  strokeWeight(1);
  for (let i = 1; i <= 4; i++) circle(0, 0, (raio * 2 * i) / 4);
  line(-raio, 0, raio, 0);
  line(0, -raio, 0, raio);

  strokeWeight(2);
  for (let i = 0; i < 15; i++) {
    stroke(45, 25, 100, 0.2 + luz[i] * 0.8);
    const y = map(i, 0, 14, raio, -raio);
    const x = -width / 2 + 24;
    line(x, y, x + (i % 5 === 0 ? 16 : 8), y);
    luz[i] *= 0.92;
  }
  pop();
}

function iniciarSom() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  saida = ac.createGain();
  saida.gain.value = 0;
  const comp = ac.createDynamicsCompressor();
  saida.connect(comp);
  comp.connect(ac.destination);
  eco = ac.createDelay(1);
  eco.delayTime.value = 0.32;
  feedback = ac.createGain();
  feedback.gain.value = 0.35;
  const filtro = ac.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 1800;
  eco.connect(filtro);
  filtro.connect(feedback);
  feedback.connect(eco);
  filtro.connect(saida);
}

function atualizarSom() {
  if (!ac) return;
  const ligado = !mudo && canetas.some((c) => c.ativa);
  saida.gain.setTargetAtTime(ligado ? 0.9 : 0, ac.currentTime, 0.04);
  feedback.gain.setTargetAtTime(ligado ? 0.35 : 0, ac.currentTime, 0.04);
}

function tocarNota(c, i) {
  if (!c.ativa) { c.acc = 0; return; }
  c.acc += c.vel;
  if (c.acc < raio * 0.14 || millis() - c.ultima < 70) return;
  c.acc = 0;
  c.ultima = millis();
  const notas = ESCALAS[esc].notas;
  const idx = constrain(floor(map(c.y, -raio, raio, 15, 0)), 0, 14);
  const oitava = random() < 0.08 ? 12 : 0;
  const midi = BASE + notas[idx % 5] + 12 * floor(idx / 5) + oitava;
  const forca = constrain(map(c.vel, 2, 40, 0.08, 0.35), 0.08, 0.35);
  c.nota = forca;
  luz[idx] = 1;
  if (ac) tocar(midi, forca, constrain(c.x / raio, -1, 1), c.aberta, (timbre + i) % TIMBRES.length);
}

function tocar(midi, forca, pan, brilho, qual) {
  const T = TIMBRES[qual];
  const t = ac.currentTime;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const o1 = ac.createOscillator();
  o1.type = T.onda;
  o1.frequency.value = f;
  const o2 = ac.createOscillator();
  o2.frequency.value = f * T.ratio;
  const g2 = ac.createGain();
  g2.gain.value = T.mix * brilho;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(forca, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + T.dur);
  const p = ac.createStereoPanner();
  p.pan.value = pan;
  const envio = ac.createGain();
  envio.gain.value = 0.4;
  o1.connect(env); o2.connect(g2); g2.connect(env);
  env.connect(p);
  p.connect(saida);
  p.connect(envio); envio.connect(eco);
  o1.start(t); o2.start(t);
  o1.stop(t + T.dur + 0.1); o2.stop(t + T.dur + 0.1);
}

function mousePressed() { iniciarSom(); }

function keyPressed() {
  iniciarSom();
  if (key >= '1' && key <= '4') timbre = int(key) - 1;
  else if (key === 'e') esc = (esc + 1) % ESCALAS.length;
  else if (key === 'f') permanente = !permanente;
  else if (key === 'x') pg.background(...FUNDO);
  else if (key === 'c') mostrarCam = !mostrarCam;
  else if (key === 'm') mudo = !mudo;
  else if (key === 's') save(pg, 'maestro-de-luz.png');
}

function mensagens() {
  noStroke();
  fill(0, 0, 100, 0.65);
  textSize(13);
  textAlign(LEFT, BOTTOM);
  text('Timbre: ' + TIMBRES[timbre].nome + ' (1 a 4). Escala: ' + ESCALAS[esc].nome + ' (e)' + (mudo ? '. Mudo.' : ''), 16, height - 36);
  text('f permanente, x limpar, c câmara, m mudo, s guardar', 16, height - 16);
  let msg = '';
  if (estado) msg = estado;
  else if (!ac) msg = 'Clica no ecrã para ligar o som.';
  else if (maos.length === 0) msg = 'Mostra uma mão aberta à câmara.';
  else if (!canetas.some((c) => c.ativa)) msg = 'Abre a mão e mexe-a.';
  if (msg) {
    fill(0, 0, 100, 0.9);
    textSize(18);
    textAlign(CENTER, CENTER);
    text(msg, width / 2, height * 0.9);
  }
}