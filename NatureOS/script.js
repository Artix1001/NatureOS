const desktop = document.querySelector("#desktop");
const desktopWorkspace = document.querySelector("#desktopWorkspace");
const menuButton = document.querySelector("#systemMenuButton");
const systemMenu = document.querySelector("#systemMenu");
const menuTime = document.querySelector("#menuTime");
const menuDate = document.querySelector("#menuDate");
const welcomeDate = document.querySelector("#welcomeDate");
const welcomeScreen = document.querySelector("#welcomeScreen");
const welcomeStage = document.querySelector(".welcome-stage");
const welcomeLandscape = document.querySelector(".welcome-stage__landscape");
const introMenu = document.querySelector("#introMenu");
const startButton = document.querySelector("#startButton");
const aboutButton = document.querySelector("#aboutButton");
const aboutCard = document.querySelector("#aboutCard");
const closeAboutButton = document.querySelector("#closeAboutButton");
const returnAboutButton = document.querySelector("#returnAboutButton");
const leafFieldBack = document.querySelector("#leafFieldBack");
const leafFieldFront = document.querySelector("#leafFieldFront");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const menuDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const welcomeDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const leafSprites = Array.from(
  { length: 11 },
  (_, index) => `assets/leaves/leaf-${String(index + 1).padStart(2, "0")}.png`,
);

let interfaceState = "welcome";
let leafTimer = 0;
let leafSystemVersion = 0;
let lastSideRoute = "";
const activeLeafAnimations = new Set();

function updateClock() {
  const now = new Date();

  menuTime.textContent = timeFormatter.format(now);
  menuTime.dateTime = now.toISOString();
  menuDate.textContent = menuDateFormatter.format(now);
  welcomeDate.textContent = welcomeDateFormatter.format(now);
}

function setMenuState(isOpen) {
  menuButton.setAttribute("aria-expanded", String(isOpen));
  systemMenu.setAttribute("aria-hidden", String(!isOpen));
  systemMenu.classList.toggle("is-open", isOpen);
}

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function shuffledLeafSprites() {
  return [...leafSprites].sort(() => Math.random() - 0.5);
}

function removeLeaves() {
  leafFieldBack.replaceChildren();
  leafFieldFront.replaceChildren();
}

function stopLeafSystem() {
  leafSystemVersion += 1;
  window.clearTimeout(leafTimer);
  leafTimer = 0;
  [...activeLeafAnimations].forEach((animation) => animation.cancel());
  activeLeafAnimations.clear();
  removeLeaves();
}

function point(x, y) {
  return { x, y };
}

function sampleCubic(start, controlA, controlB, end, steps = 8) {
  const points = [];

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const inverse = 1 - t;
    points.push(point(
      inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
      inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y,
    ));
  }

  return points;
}

function buildSmoothPath(segments, steps = 8) {
  const points = [segments[0][0]];
  segments.forEach(([start, controlA, controlB, end], index) => {
    points.push(...sampleCubic(start, controlA, controlB, end, index === 0 ? steps + 2 : steps));
  });
  return points;
}

function buildCatmullRomPath(knots, tension = 0.9) {
  const segments = [];

  for (let index = 0; index < knots.length - 1; index += 1) {
    const previous = knots[Math.max(0, index - 1)];
    const start = knots[index];
    const end = knots[index + 1];
    const next = knots[Math.min(knots.length - 1, index + 2)];
    const controlA = point(
      start.x + (end.x - previous.x) / 6 * tension,
      start.y + (end.y - previous.y) / 6 * tension,
    );
    const controlB = point(
      end.x - (next.x - start.x) / 6 * tension,
      end.y - (next.y - start.y) / 6 * tension,
    );
    segments.push([start, controlA, controlB, end]);
  }

  return buildSmoothPath(segments, 12);
}

function resamplePath(points, sampleCount = 48) {
  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distances.push(distances[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
  }

  const totalDistance = distances.at(-1);
  if (!totalDistance) return points;

  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const targetDistance = (sampleIndex / (sampleCount - 1)) * totalDistance;
    let pointIndex = 1;

    while (pointIndex < distances.length - 1 && distances[pointIndex] < targetDistance) {
      pointIndex += 1;
    }

    const segmentStartDistance = distances[pointIndex - 1];
    const segmentDistance = distances[pointIndex] - segmentStartDistance || 1;
    const progress = (targetDistance - segmentStartDistance) / segmentDistance;
    const start = points[pointIndex - 1];
    const end = points[pointIndex];

    return point(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
  });
}

function addWindTurbulence(points, strength, phase) {
  return points.map((pathPoint, index) => {
    const progress = index / (points.length - 1);
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const envelope = Math.sin(progress * Math.PI) ** 0.82;
    const broadSway = Math.sin(progress * Math.PI * 2.4 + phase) * 0.82;
    const secondarySway = Math.sin(progress * Math.PI * 4.8 + phase * 1.43) * 0.18;
    const sidewaysDrift = strength * (broadSway + secondarySway) * envelope;
    const forwardNudge = strength * 0.11 * Math.sin(progress * Math.PI * 3.6 + phase * 0.72) * envelope;

    return point(
      pathPoint.x - tangentY / tangentLength * sidewaysDrift + tangentX / tangentLength * forwardNudge,
      pathPoint.y + tangentX / tangentLength * sidewaysDrift + tangentY / tangentLength * forwardNudge,
    );
  });
}

function smoothPath(points, passes = 1) {
  let smoothed = points;

  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((pathPoint, index) => {
      if (index === 0 || index === smoothed.length - 1) return pathPoint;

      const previous = smoothed[index - 1];
      const next = smoothed[index + 1];
      return point(
        previous.x * 0.2 + pathPoint.x * 0.6 + next.x * 0.2,
        previous.y * 0.2 + pathPoint.y * 0.6 + next.y * 0.2,
      );
    });
  }

  return smoothed;
}

function createWindOffsets(count, surge, phase) {
  const elapsedTimes = [0];
  let elapsed = 0;

  for (let index = 1; index < count; index += 1) {
    const progress = (index - 0.5) / (count - 1);
    const windPulse = Math.sin(progress * Math.PI * 2.25 + phase) * 0.68;
    const smallerPulse = Math.sin(progress * Math.PI * 6.4 + phase * 1.37) * 0.32;
    const speed = Math.max(0.58, 1 + surge * (windPulse + smallerPulse));
    elapsed += 1 / speed;
    elapsedTimes.push(elapsed);
  }

  return elapsedTimes.map((time) => time / elapsed);
}

function createFlightPersonality(kind, index) {
  const styles = [
    { drift: 0.72, surge: 0.22, spin: 0.62, roll: 28, yaw: 34, wobble: 16, lift: 18, pace: 1.08 },
    { drift: 1.24, surge: 0.35, spin: 1.14, roll: 58, yaw: 48, wobble: 27, lift: 34, pace: 0.92 },
    { drift: 0.96, surge: 0.28, spin: 0.86, roll: 42, yaw: 40, wobble: 21, lift: 25, pace: 1 },
  ];
  const style = styles[(index + Math.floor(randomBetween(0, styles.length))) % styles.length];
  const isMain = kind === "main";
  const baseDrift = kind === "main" ? randomBetween(10, 17) : randomBetween(13, 23);

  return {
    drift: baseDrift * style.drift * (isMain ? 0.56 : 1),
    surge: style.surge * randomBetween(0.86, 1.14) * (isMain ? 0.8 : 1),
    spin: style.spin * randomBetween(0.88, 1.12),
    roll: style.roll * randomBetween(0.82, 1.18) * (isMain ? 0.84 : 1),
    yaw: style.yaw * randomBetween(0.84, 1.16) * (isMain ? 0.82 : 1),
    wobble: style.wobble * randomBetween(0.8, 1.2) * (isMain ? 0.86 : 1),
    lift: style.lift * randomBetween(0.8, 1.2) * (isMain ? 0.94 : 1),
    pace: style.pace * randomBetween(0.94, 1.06),
    flutterCycles: isMain ? randomBetween(3.1, 4.8) : randomBetween(3.2, 5.4),
    sampleCount: isMain ? 180 : 120,
    smoothingPasses: isMain ? 4 : 1,
    phase: randomBetween(0, Math.PI * 2),
  };
}

function getMenuMetrics() {
  const bounds = introMenu.getBoundingClientRect();
  const width = bounds.width || Math.min(340, window.innerWidth * 0.7);
  const height = bounds.height || Math.min(250, window.innerHeight * 0.42);

  return {
    width,
    height,
    centerX: bounds.width ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
    centerY: bounds.height ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
    left: bounds.width ? bounds.left : (window.innerWidth - width) / 2,
    right: bounds.width ? bounds.right : (window.innerWidth + width) / 2,
    top: bounds.height ? bounds.top : (window.innerHeight - height) / 2,
    bottom: bounds.height ? bounds.bottom : (window.innerHeight + height) / 2,
  };
}

function getStageMetrics() {
  const bounds = welcomeStage.getBoundingClientRect();
  const width = bounds.width || Math.min(1180, window.innerWidth * 0.9);
  const height = bounds.height || width * 941 / 1672;

  return {
    width,
    height,
    left: bounds.width ? bounds.left : (window.innerWidth - width) / 2,
    right: bounds.width ? bounds.right : (window.innerWidth + width) / 2,
    top: bounds.height ? bounds.top : (window.innerHeight - height) / 2,
    bottom: bounds.height ? bounds.bottom : (window.innerHeight + height) / 2,
  };
}

function createMainOrbitPath(size, index) {
  const menu = getMenuMetrics();
  const stage = getStageMetrics();
  const compact = window.innerWidth < 600;
  const lane = (index % 5) - 2;
  const variation = lane * randomBetween(compact ? 3 : 7, compact ? 7 : 13);
  const centerX = menu.centerX + randomBetween(-8, 8);
  const centerY = menu.centerY + variation * 0.18 + randomBetween(-4, 4);
  const minimumRadiusX = menu.width / 2 + size * 0.32 + (compact ? 13 : 34);
  const minimumRadiusY = menu.height / 2 + size * 0.27 + (compact ? 15 : 32);
  const availableRadiusX = Math.min(centerX, window.innerWidth - centerX) - size * 0.18;
  const availableRadiusY = Math.min(centerY, window.innerHeight - centerY) - size * 0.16;
  const preferredRadiusX = compact ? menu.width * 0.72 + size * 0.18 : stage.width * 0.35;
  const preferredRadiusY = compact ? menu.height * 0.92 + size * 0.18 : stage.height * 0.59;
  const radiusX = Math.max(minimumRadiusX, Math.min(preferredRadiusX + variation, availableRadiusX));
  const radiusY = Math.max(minimumRadiusY, Math.min(preferredRadiusY - variation * 0.28, availableRadiusY));
  const left = centerX - radiusX;
  const right = centerX + radiusX;
  const top = centerY - radiusY;
  const bottom = centerY + radiusY;
  const start = point(-size, Math.min(window.innerHeight + size * 0.12, bottom + radiusY * 0.34));
  const bottomPoint = point(centerX - radiusX * 0.04, bottom);
  const end = point(window.innerWidth + size, Math.min(window.innerHeight - size * 0.4, centerY + radiusY * 0.68));

  return buildCatmullRomPath([
    start,
    point(centerX - radiusX * 0.78, centerY + radiusY * 0.92),
    bottomPoint,
    point(centerX + radiusX * 0.7, centerY + radiusY * 0.73),
    point(right, centerY - radiusY * 0.04),
    point(centerX + radiusX * 0.72, centerY - radiusY * 0.78),
    point(centerX + radiusX * 0.05, top),
    point(centerX - radiusX * 0.72, centerY - radiusY * 0.8),
    point(left, centerY + radiusY * 0.02),
    point(centerX - radiusX * 0.7, centerY + radiusY * 0.74),
    point(centerX + radiusX * 0.02, bottom),
    point(centerX + radiusX * 0.72, centerY + radiusY * 0.8),
    end,
  ], 0.88);
}

function chooseSideRoute() {
  const routes = ["upper-dive", "upper-right", "cross-left", "lower-rise"];

  const alternatives = routes.filter((route) => route !== lastSideRoute);
  const route = alternatives[Math.floor(Math.random() * alternatives.length)] || routes[0];
  lastSideRoute = route;
  return route;
}

function createSidePath(route, size, index) {
  const menu = getMenuMetrics();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const spread = (index - 1) * randomBetween(5, 9);
  const sway = randomBetween(-height * 0.018, height * 0.018) + spread;

  if (route === "upper-dive") {
    return buildCatmullRomPath([
      point(width * 0.12, -size * 0.35),
      point(width * 0.25, height * 0.09 + sway),
      point(width * 0.4, height * 0.23 + sway),
      point(menu.centerX, menu.centerY - height * 0.04 + sway),
      point(width * 0.57, height * 0.72 + sway),
      point(width * 0.68, height + size),
    ]);
  }

  if (route === "upper-right") {
    return buildCatmullRomPath([
      point(width * 0.66, -size * 0.5),
      point(width * 0.76, height * 0.055 + sway),
      point(width * 0.86, height * 0.13 + sway),
      point(width * 0.94, height * 0.23 + sway),
      point(width + size, height * 0.34 + sway),
    ]);
  }

  if (route === "cross-left") {
    return buildCatmullRomPath([
      point(width + size, height * 0.57 + sway),
      point(width * 0.83, height * 0.47 + sway),
      point(width * 0.7, height * 0.43 + sway),
      point(menu.centerX, menu.centerY + height * 0.035 + sway),
      point(width * 0.33, height * 0.57 + sway),
      point(width * 0.14, height * 0.49 + sway),
      point(-size, height * 0.29 + sway),
    ]);
  }

  return buildCatmullRomPath([
    point(width * 0.045, height + size * 0.12),
    point(width * 0.1, height * 0.79 + sway),
    point(width * 0.21, height * 0.66 + sway),
    point(width * 0.38, height * 0.73 + sway),
    point(width * 0.54, height * 0.86 + sway),
    point(width * 0.7, height * 0.77 + sway),
    point(width * 0.86, height * 0.56 + sway),
    point(width + size, height * 0.36 + sway),
  ]);
}

function createFlightKeyframes(path, size, opacity, startRotation, rotationTravel, personality) {
  const evenPoints = resamplePath(path, personality.sampleCount);
  const turbulentPoints = addWindTurbulence(evenPoints, personality.drift, personality.phase);
  const points = resamplePath(
    smoothPath(turbulentPoints, personality.smoothingPasses),
    personality.sampleCount,
  );
  const windOffsets = createWindOffsets(points.length, personality.surge, personality.phase);

  return points.map((pathPoint, index) => {
    const progress = index / (points.length - 1);
    const fadeIn = Math.min(1, progress / 0.08);
    const fadeOut = Math.min(1, (1 - progress) / 0.12);
    const flutter = progress * Math.PI * 2 * personality.flutterCycles + personality.phase;
    const slowRoll = progress * Math.PI * 3.2 + personality.phase * 0.7;
    const scale = 0.83 + Math.sin(progress * Math.PI) * 0.14 + Math.sin(flutter) * 0.034;
    const rotationProgress = progress + Math.sin(progress * Math.PI * 2 + personality.phase) * 0.035;
    const rotation = startRotation + rotationTravel * rotationProgress + Math.sin(flutter * 0.82) * personality.wobble;
    const roll = Math.sin(flutter) * personality.roll;
    const yaw = Math.cos(slowRoll) * personality.yaw;
    const lift = Math.sin(progress * Math.PI) * personality.lift + Math.sin(flutter * 0.55) * personality.lift * 0.2;

    return {
      offset: windOffsets[index],
      opacity: opacity * Math.min(fadeIn, fadeOut),
      transform: `translate3d(${(pathPoint.x - size / 2).toFixed(1)}px, ${(pathPoint.y - size / 2).toFixed(1)}px, ${lift.toFixed(1)}px) rotateZ(${rotation.toFixed(1)}deg) rotateX(${roll.toFixed(1)}deg) rotateY(${yaw.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    };
  });
}

function createLeafFlight({ sprite, index, kind, route = "" }) {
  const isForeground = (index + (Math.random() > 0.58 ? 1 : 0)) % 3 === 0;
  const field = isForeground ? leafFieldFront : leafFieldBack;
  const leaf = document.createElement("img");
  const compact = window.innerWidth < 600;
  const personality = createFlightPersonality(kind, index);
  const sizeScale = compact ? 0.58 : 1;
  const baseRange = kind === "main"
    ? (isForeground ? [112, 188] : [68, 132])
    : (isForeground ? [86, 142] : [54, 104]);
  const size = randomBetween(baseRange[0], baseRange[1]) * sizeScale;
  const startRotation = randomBetween(-100, 70);
  const rotationDirection = Math.random() > 0.25 ? 1 : -1;
  const rotationTravel = randomBetween(kind === "main" ? 560 : 380, kind === "main" ? 920 : 680) * rotationDirection * personality.spin;
  const duration = (kind === "main" ? randomBetween(3950, 4650) : randomBetween(2450, 3300)) * personality.pace;
  const mainRhythm = [0, 74, 155, 262, 382, 455, 602, 715, 835];
  const delay = kind === "main"
    ? mainRhythm[index] + randomBetween(0, 58)
    : index * randomBetween(105, 178) + randomBetween(0, 48);
  const opacity = randomBetween(isForeground ? 0.7 : 0.42, isForeground ? 0.94 : 0.7);
  const path = kind === "main" ? createMainOrbitPath(size, index) : createSidePath(route, size, index);

  leaf.className = `wind-leaf wind-leaf--${kind}`;
  leaf.src = sprite;
  leaf.alt = "";
  leaf.draggable = false;
  leaf.style.setProperty("--leaf-size", `${size.toFixed(1)}px`);
  leaf.style.setProperty("--leaf-blur", `${randomBetween(isForeground ? 0.5 : 0.2, isForeground ? 2.4 : 1.5).toFixed(1)}px`);
  leaf.style.setProperty("--leaf-saturation", randomBetween(0.82, 1.18).toFixed(2));

  field.append(leaf);
  const animation = leaf.animate(
    createFlightKeyframes(path, size, opacity, startRotation, rotationTravel, personality),
    { duration, delay, easing: "linear", fill: "forwards" },
  );
  activeLeafAnimations.add(animation);

  const removeLeaf = () => {
    activeLeafAnimations.delete(animation);
    leaf.remove();
  };
  animation.onfinish = removeLeaf;
  animation.oncancel = removeLeaf;
}

function emitMainOrbit(version) {
  if (interfaceState !== "welcome" || reduceMotion.matches || version !== leafSystemVersion) return;

  const count = window.innerWidth < 600 ? 6 : 9;
  const sprites = shuffledLeafSprites().slice(0, count);
  sprites.forEach((sprite, index) => createLeafFlight({ sprite, index, kind: "main" }));
}

function emitSideGust(version) {
  if (interfaceState !== "welcome" || reduceMotion.matches || version !== leafSystemVersion) return;

  const count = window.innerWidth < 600 ? 2 : Math.floor(randomBetween(3, 5));
  const sprites = shuffledLeafSprites().slice(0, count);
  const route = chooseSideRoute();
  sprites.forEach((sprite, index) => createLeafFlight({ sprite, index, kind: "side", route }));

  leafTimer = window.setTimeout(() => emitSideGust(version), randomBetween(4000, 5000));
}

function startLeafSystem() {
  stopLeafSystem();
  if (!reduceMotion.matches && interfaceState === "welcome") {
    const version = leafSystemVersion;
    window.requestAnimationFrame(() => emitMainOrbit(version));
    leafTimer = window.setTimeout(() => emitSideGust(version), randomBetween(4400, 5000));
  }
}

function openAbout() {
  if (interfaceState !== "welcome") return;

  interfaceState = "about";
  welcomeScreen.classList.add("is-about-open");
  introMenu.setAttribute("aria-hidden", "true");
  introMenu.inert = true;
  aboutCard.setAttribute("aria-hidden", "false");
  aboutCard.inert = false;
  stopLeafSystem();
  closeAboutButton.focus({ preventScroll: true });
}

function closeAbout() {
  if (interfaceState !== "about") return;

  interfaceState = "welcome";
  welcomeScreen.classList.remove("is-about-open");
  introMenu.setAttribute("aria-hidden", "false");
  introMenu.inert = false;
  aboutCard.setAttribute("aria-hidden", "true");
  aboutCard.inert = true;
  aboutButton.focus({ preventScroll: true });
  startLeafSystem();
}

function startDesktop() {
  if (interfaceState !== "welcome") return;

  interfaceState = "transitioning";
  stopLeafSystem();
  setMenuState(false);
  desktop.classList.add("is-desktop-ready");
  welcomeScreen.classList.add("is-leaving");
  desktopWorkspace.setAttribute("aria-hidden", "false");
  desktopWorkspace.inert = false;
  menuButton.focus({ preventScroll: true });
  welcomeScreen.setAttribute("aria-hidden", "true");
  welcomeScreen.inert = true;

  window.setTimeout(() => {
    welcomeScreen.hidden = true;
    interfaceState = "desktop";
  }, reduceMotion.matches ? 20 : 760);
}

function keepFocusInAbout(event) {
  if (event.key !== "Tab" || interfaceState !== "about") return;

  const focusable = [closeAboutButton, returnAboutButton];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

menuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  setMenuState(!isOpen);
});

systemMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => {
  if (interfaceState === "desktop") setMenuState(false);
});

startButton.addEventListener("click", startDesktop);
aboutButton.addEventListener("click", (event) => {
  event.stopPropagation();
  openAbout();
});
closeAboutButton.addEventListener("click", closeAbout);
returnAboutButton.addEventListener("click", closeAbout);
aboutCard.addEventListener("keydown", keepFocusInAbout);

welcomeScreen.addEventListener("click", (event) => {
  if (interfaceState === "about" && !event.target.closest(".about-card")) {
    closeAbout();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (interfaceState === "about") {
      closeAbout();
    } else if (interfaceState === "desktop") {
      setMenuState(false);
      menuButton.focus();
    }
  }

  if (
    event.key === "Enter" &&
    interfaceState === "welcome" &&
    !event.target.closest("button")
  ) {
    startDesktop();
  }
});

desktop.addEventListener("pointermove", (event) => {
  if (reduceMotion.matches || event.pointerType === "touch") return;

  const horizontal = (event.clientX / window.innerWidth - 0.5) * -8;
  const vertical = (event.clientY / window.innerHeight - 0.5) * -6;

  desktop.style.setProperty("--wallpaper-x", `${horizontal.toFixed(2)}px`);
  desktop.style.setProperty("--wallpaper-y", `${vertical.toFixed(2)}px`);
});

reduceMotion.addEventListener("change", () => {
  if (reduceMotion.matches) {
    stopLeafSystem();
  } else if (interfaceState === "welcome") {
    startLeafSystem();
  }
});

welcomeLandscape.addEventListener("error", () => {
  welcomeStage.classList.add("is-image-missing");
});

desktopWorkspace.inert = true;
aboutCard.inert = true;
updateClock();
window.setInterval(updateClock, 30_000);
window.requestAnimationFrame(() => startButton.focus({ preventScroll: true }));
startLeafSystem();
