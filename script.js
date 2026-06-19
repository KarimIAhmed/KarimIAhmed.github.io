const MESSAGES = [
  { text: "Hello 👋" },
  { text: "I'm Karim" },
  { text: "I enjoy digging into problems that challenge my understanding; that's where I learn the most" },
  { html: "Currently working on <a href='https://anagoapp.com' target='_blank' rel='noopener noreferrer'>Anago</a>" },
  { html: "I'm also learning Spanish and trying to break 1600 in <a href='https://www.chess.com/member/whatischesschess' target='_blank' rel='noopener noreferrer'>Chess</a>" },
  { text: "Exploring my next engineering role. Reach out if you're building something challenging or ambitious" },
  { html: 'You can find me on <a href="https://www.linkedin.com/in/karimiahmed" target="_blank" rel="noopener noreferrer">Linkedin</a> and <a href="https://github.com/karimiahmed" target="_blank" rel="noopener noreferrer">Github</a>'},
  { html: "Otherwise, my inbox is always open at <a href='mailto:karimdev49@gmail.com' rel='noopener noreferrer'>karimdev49@gmail.com</a>" },
];

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Buenos días!";
  if (hour >= 12 && hour < 21) return "Buenas tardes!";
  return "Buenas noches!";
}

const CONFIG = {
  revealMs: 1500,
  /** Plain-text length above this uses pauseLongMs */
  pauseLengthThreshold: 50,
  pauseShortMs: 1000,
  pauseLongMs: 2000,
  dragThreshold: 4,
  rejoinDistance: 56,
  unfadeDelayMs: 1000,
  unfadeLineDelayMs: 220,
};

function plainTextLength(message) {
  if (message.text) return message.text.length;
  const temp = document.createElement("div");
  temp.innerHTML = message.html;
  return temp.textContent.length;
}

function enrichMessage(message) {
  const plainLength = plainTextLength(message);
  return {
    ...message,
    pauseMs:
      plainLength > CONFIG.pauseLengthThreshold
        ? CONFIG.pauseLongMs
        : CONFIG.pauseShortMs,
  };
}

function buildSequence() {
  return [
    ...MESSAGES.map(enrichMessage),
    enrichMessage({ text: getTimeGreeting() }),
  ];
}

const sequence = buildSequence();

const feed = document.getElementById("feed");
const scroller = document.getElementById("feed-scroller");
const btnSkip = document.getElementById("btn-skip");

if (!feed || !scroller || !btnSkip) {
  throw new Error("Missing required DOM elements");
}

let chunks = [];
let currentIndex = 0;
let skipRequested = false;
let timers = [];
let userDetached = false;
let suppressPinUpdate = false;
let lastScrollTop = 0;
let lastScrollDirection = null;

let isPointerDown = false;
let isDragging = false;
let dragStartY = 0;
let dragStartScrollTop = 0;
let fadeLocked = false;

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function schedule(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
}

function delay(ms) {
  if (skipRequested) return Promise.resolve();
  return new Promise((resolve) => schedule(resolve, ms));
}

function getDistanceFromBottom() {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
}

function getMaxScroll() {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

function getRejoinThreshold() {
  const lineHeight =
    parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.45;
  const base = Math.max(CONFIG.rejoinDistance, lineHeight * 1.5);
  const maxScroll = getMaxScroll();

  if (maxScroll === 0) return 0;

  if (maxScroll < base) {
    return Math.max(12, maxScroll * 0.2);
  }

  return base;
}

function isNearBottom() {
  return getDistanceFromBottom() <= getRejoinThreshold();
}

function detachUser() {
  userDetached = true;
}

function attachUser() {
  userDetached = false;
}

function tryResumeFollowing() {
  if (!isNearBottom()) return false;
  attachUser();
  scrollToBottom();
  return true;
}

function scrollToBottom() {
  suppressPinUpdate = true;
  const target = getMaxScroll();
  scroller.scrollTop = target;
  lastScrollTop = target;

  requestAnimationFrame(() => {
    const next = getMaxScroll();
    scroller.scrollTop = next;
    lastScrollTop = next;
    requestAnimationFrame(() => {
      suppressPinUpdate = false;
    });
  });
}

function scrollToBottomIfFollowing() {
  if (!userDetached) {
    scrollToBottom();
  }
}

function onUserScroll() {
  if (suppressPinUpdate || isDragging) return;

  const scrollingDown = scroller.scrollTop > lastScrollTop + 1;

  if (scrollingDown && isNearBottom()) {
    lastScrollDirection = "down";
    attachUser();
  }

  lastScrollTop = scroller.scrollTop;
}

function onScrollSettled() {
  if (suppressPinUpdate || isDragging) return;

  if (lastScrollDirection === "down" && isNearBottom()) {
    tryResumeFollowing();
  }

  lastScrollDirection = null;
  lastScrollTop = scroller.scrollTop;
}

function createChunkElement(message) {
  const el = document.createElement("p");
  el.className = "chunk";
  el.innerHTML = '<span class="text-reveal"><span class="text"></span></span>';
  const textEl = el.querySelector(".text");
  if (message.html) {
    textEl.innerHTML = message.html;
  } else {
    textEl.textContent = message.text;
  }
  return el;
}

function updateFadeLevels() {
  if (fadeLocked) return;

  const visible = chunks.filter((c) => c.el.classList.contains("visible"));
  const count = visible.length;

  visible.forEach((chunk, i) => {
    const age = count - 1 - i;
    chunk.el.classList.remove("faded", "more-faded", "oldest");

    if (age === 0) return;
    if (age === 1) chunk.el.classList.add("faded");
    else if (age === 2) chunk.el.classList.add("more-faded");
    else chunk.el.classList.add("oldest");
  });
}

function isChunkFaded(el) {
  return (
    el.classList.contains("faded") ||
    el.classList.contains("more-faded") ||
    el.classList.contains("oldest")
  );
}

async function restoreOpacityBottomUp() {
  await delay(CONFIG.unfadeDelayMs);
  if (skipRequested) return;

  fadeLocked = true;

  const fromBottom = chunks
    .filter((c) => c.el.classList.contains("visible"))
    .reverse();

  for (const chunk of fromBottom) {
    if (skipRequested) return;

    if (isChunkFaded(chunk.el)) {
      chunk.el.classList.remove("faded", "more-faded", "oldest");
      await delay(CONFIG.unfadeLineDelayMs);
    }
  }
}

async function revealChunk(el, message) {
  const revealEl = el.querySelector(".text-reveal");

  const animation = revealEl.animate(
    [
      { clipPath: "inset(0 100% 0 0)", opacity: 0.55 },
      { clipPath: "inset(0 0 0 0)", opacity: 1 },
    ],
    {
      duration: CONFIG.revealMs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    }
  );

  const scrollTicker = setInterval(() => scrollToBottomIfFollowing(), 80);
  const skipWatcher = setInterval(() => {
    if (skipRequested) animation.finish();
  }, 50);

  try {
    await animation.finished;
  } catch {
    // Animation aborted (e.g. skip) — fall through to done state.
  } finally {
    clearInterval(scrollTicker);
    clearInterval(skipWatcher);
  }

  revealEl.style.clipPath = "inset(0 0 0 0)";
  revealEl.style.opacity = "1";
  el.classList.add("done");
}

async function revealNext() {
  if (currentIndex >= sequence.length) return;

  const message = sequence[currentIndex];
  const el = createChunkElement(message);
  feed.appendChild(el);
  chunks.push({ el, message });

  requestAnimationFrame(() => {
    el.classList.add("visible");
    updateFadeLevels();
    scrollToBottomIfFollowing();
  });

  currentIndex++;

  await revealChunk(el, message);
  scrollToBottomIfFollowing();

  if (skipRequested) return;

  if (currentIndex >= sequence.length) {
    await restoreOpacityBottomUp();
    return;
  }

  await delay(message.pauseMs);
  await revealNext();
}

function showAllInstantly() {
  clearTimers();
  feed.innerHTML = "";
  chunks = [];

  sequence.forEach((msg) => {
    const el = createChunkElement(msg);
    el.classList.add("visible", "done");
    const revealEl = el.querySelector(".text-reveal");
    revealEl.style.clipPath = "inset(0 0 0 0)";
    revealEl.style.opacity = "1";
    feed.appendChild(el);
    chunks.push({ el, message: msg });
  });

  currentIndex = sequence.length;
  fadeLocked = true;
  attachUser();
  requestAnimationFrame(() => scrollToBottom());
}

btnSkip.addEventListener("click", () => {
  skipRequested = true;
  showAllInstantly();
});

revealNext();