import {
  createEmptyProgress,
  loadProgress,
  missions,
  resetProgress as resetServerProgress,
} from "./missions.js";
import {
  currentUser,
  loginAccount,
  registerAccount,
  signOut,
} from "./api.js";
import { spriteIcon } from "./icons.js";

const dom = {
  bootScreen: document.querySelector("#boot-screen"),
  mainMenu: document.querySelector("#main-menu"),
  authScreen: document.querySelector("#auth-screen"),
  loginTab: document.querySelector("#login-tab"),
  registerTab: document.querySelector("#register-tab"),
  loginForm: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  registerPassword: document.querySelector("#register-password"),
  registerConfirmPassword: document.querySelector("#register-confirm-password"),
  passwordStrength: document.querySelector("#password-strength"),
  passwordStrengthFill: document.querySelector("#password-strength-fill"),
  passwordStrengthLabel: document.querySelector("#password-strength-label"),
  passwordLengthCheck: document.querySelector("#password-length-check"),
  passwordMatchCheck: document.querySelector("#password-match-check"),
  authTitle: document.querySelector("#auth-title"),
  authDescription: document.querySelector("#auth-description"),
  authError: document.querySelector("#auth-error"),
  missionCards: document.querySelector("#mission-cards"),
  progressLabel: document.querySelector("#progress-label"),
  progressPercent: document.querySelector("#progress-percent"),
  progressRing: document.querySelector("#progress-ring"),
  totalStars: document.querySelector("#total-stars"),
  resetProgressButton: document.querySelector("#reset-progress-button"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  cancelResetButton: document.querySelector("#cancel-reset-button"),
  confirmResetButton: document.querySelector("#confirm-reset-button"),
  accountMenu: document.querySelector("#account-menu"),
  accountButton: document.querySelector("#account-button"),
  accountPopover: document.querySelector("#account-popover"),
  accountUsername: document.querySelector("#account-username"),
  accountEmail: document.querySelector("#account-email"),
  logoutButton: document.querySelector("#logout-button"),
};

const PASSWORD_MIN_LENGTH = 12;

let progress = createEmptyProgress();
let user = null;

setupEvents();
initialize();

async function initialize() {
  user = await currentUser();
  if (!user) {
    showAuth();
    return;
  }
  if (user.role === "admin") {
    window.location.replace("/admin");
    return;
  }
  await enterGameMenu();
}

function setupEvents() {
  dom.loginTab.addEventListener("click", () => setAuthMode("login"));
  dom.registerTab.addEventListener("click", () => setAuthMode("register"));
  dom.loginForm.addEventListener("submit", handleLogin);
  dom.registerForm.addEventListener("submit", handleRegister);
  dom.registerPassword.addEventListener("input", updatePasswordFeedback);
  dom.registerConfirmPassword.addEventListener("input", updatePasswordFeedback);
  dom.resetProgressButton.addEventListener("click", () => {
    dom.confirmDialog.hidden = false;
  });
  dom.cancelResetButton.addEventListener("click", () => {
    dom.confirmDialog.hidden = true;
  });
  dom.confirmResetButton.addEventListener("click", resetProgress);
  dom.confirmDialog.addEventListener("click", (event) => {
    if (event.target === dom.confirmDialog) dom.confirmDialog.hidden = true;
  });
  dom.accountButton.addEventListener("click", () => {
    const nextOpen = dom.accountPopover.hidden;
    dom.accountPopover.hidden = !nextOpen;
    dom.accountButton.setAttribute("aria-expanded", String(nextOpen));
  });
  dom.logoutButton.addEventListener("click", handleLogout);
  document.addEventListener("pointerdown", (event) => {
    if (!dom.accountMenu.contains(event.target)) {
      dom.accountPopover.hidden = true;
      dom.accountButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.confirmDialog.hidden) {
      dom.confirmDialog.hidden = true;
    }
  });
  window.addEventListener("pageshow", async () => {
    if (!user) return;
    progress = await loadProgress();
    renderMissionMenu();
  });
}

function showAuth() {
  dom.bootScreen.hidden = true;
  dom.mainMenu.hidden = true;
  dom.authScreen.hidden = false;
}

async function enterGameMenu() {
  progress = await loadProgress();
  dom.accountUsername.textContent = user.username;
  dom.accountEmail.textContent = user.email;
  renderMissionMenu();
  dom.bootScreen.hidden = true;
  dom.authScreen.hidden = true;
  dom.mainMenu.hidden = false;
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  dom.loginTab.classList.toggle("active", isLogin);
  dom.registerTab.classList.toggle("active", !isLogin);
  dom.loginTab.setAttribute("aria-selected", String(isLogin));
  dom.registerTab.setAttribute("aria-selected", String(!isLogin));
  dom.loginForm.hidden = !isLogin;
  dom.registerForm.hidden = isLogin;
  dom.authTitle.textContent = isLogin ? "Return to the training grounds" : "Create your player profile";
  dom.authDescription.textContent = isLogin
    ? "Sign in to sync progress and submit scores."
    : "Use one account to keep stars, routes, and times from every mission.";
  dom.authError.hidden = true;
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(dom.loginForm);
  await submitAuth(dom.loginForm, () =>
    loginAccount({
      login: form.get("login"),
      password: form.get("password"),
    }),
  );
}

async function handleRegister(event) {
  event.preventDefault();
  updatePasswordFeedback();
  if (!dom.registerForm.checkValidity()) {
    dom.registerForm.reportValidity();
    return;
  }
  const form = new FormData(dom.registerForm);
  await submitAuth(dom.registerForm, () =>
    registerAccount({
      username: form.get("username"),
      email: form.get("email"),
      password: form.get("password"),
    }),
  );
}

function updatePasswordFeedback() {
  const password = dom.registerPassword.value;
  const confirmPassword = dom.registerConfirmPassword.value;
  const passwordLength = Array.from(password).length;
  const hasPassword = password.length > 0;
  const hasConfirmation = confirmPassword.length > 0;
  const hasMinimumLength = passwordLength >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = hasConfirmation && password === confirmPassword;
  const progress = Math.min(
    100,
    Math.round((passwordLength / PASSWORD_MIN_LENGTH) * 100),
  );

  dom.passwordStrengthFill.style.width = `${progress}%`;
  dom.passwordStrength.dataset.state = hasMinimumLength
    ? "ready"
    : hasPassword
      ? "typing"
      : "empty";
  dom.passwordStrengthLabel.textContent = hasMinimumLength
    ? "Meets the 12-character minimum"
    : hasPassword
      ? `Add ${PASSWORD_MIN_LENGTH - passwordLength} more characters`
      : "Use at least 12 characters";

  updatePasswordCheck(dom.passwordLengthCheck, hasMinimumLength, hasPassword);
  updatePasswordCheck(dom.passwordMatchCheck, passwordsMatch, hasConfirmation);

  dom.registerPassword.classList.toggle("is-valid", hasMinimumLength);
  dom.registerPassword.classList.toggle(
    "is-invalid",
    hasPassword && !hasMinimumLength,
  );
  dom.registerConfirmPassword.classList.toggle("is-valid", passwordsMatch);
  dom.registerConfirmPassword.classList.toggle(
    "is-invalid",
    hasConfirmation && !passwordsMatch,
  );

  dom.registerPassword.setCustomValidity(
    hasPassword && !hasMinimumLength
      ? "Password must be at least 12 characters"
      : "",
  );
  dom.registerConfirmPassword.setCustomValidity(
    hasConfirmation && !passwordsMatch
      ? "Passwords do not match"
      : "",
  );
}

function updatePasswordCheck(element, isValid, hasValue) {
  element.classList.toggle("is-valid", isValid);
  element.classList.toggle("is-invalid", hasValue && !isValid);
}

async function submitAuth(form, action) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  dom.authError.hidden = true;
  try {
    user = await action();
    if (user.role === "admin") {
      window.location.replace("/admin");
      return;
    }
    await enterGameMenu();
  } catch (error) {
    dom.authError.textContent = error.message;
    dom.authError.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function handleLogout() {
  dom.logoutButton.disabled = true;
  await signOut();
  user = null;
  progress = createEmptyProgress();
  dom.accountPopover.hidden = true;
  dom.loginForm.reset();
  dom.registerForm.reset();
  setAuthMode("login");
  showAuth();
  dom.logoutButton.disabled = false;
}

function renderMissionMenu() {
  dom.missionCards.innerHTML = "";

  missions.forEach((mission, index) => {
    const unlocked = index < progress.unlocked;
    const earned = progress.stars[mission.id] ?? 0;
    const card = document.createElement("article");
    card.className = `mission-card${unlocked ? "" : " locked"}`;
    card.innerHTML = `
      <div class="mission-top">
        <span class="mission-index">${mission.number}</span>
        <span class="difficulty" aria-label="Difficulty ${mission.difficulty} stars">
          ${renderStars(mission.difficulty)}
        </span>
      </div>
      <div class="mission-preview" aria-hidden="true">
        ${renderMissionPreview(mission)}
      </div>
      <div class="mission-copy">
        <span>${unlocked ? `GRID ${mission.size} × ${mission.size} • PAR ${mission.par}` : "LOCKED MISSION"}</span>
        <h3>${mission.name}<br />${mission.subtitle}</h3>
        <p>${unlocked ? mission.description : "Clear the previous mission to unlock this one."}</p>
      </div>
      <div class="mission-bottom">
        <div class="earned-stars" aria-label="Earned ${earned} stars">
          ${renderStars(earned)}
        </div>
        ${unlocked
        ? `<a class="mission-action" href="./playgame?mission=${encodeURIComponent(mission.id)}">
                <span class="mission-action-icon">${spriteIcon("play")}</span>${earned ? "Replay" : "Start mission"}
              </a>`
        : `<button class="mission-action" type="button" disabled>
                <span class="mission-action-icon">${spriteIcon("lock")}</span>Locked
              </button>`
      }
      </div>
    `;
    dom.missionCards.append(card);
  });

  const unlockedPercent = Math.round((progress.unlocked / missions.length) * 100);
  const totalStars = Object.values(progress.stars).reduce(
    (sum, value) => sum + value,
    0,
  );
  dom.progressLabel.textContent = `${progress.unlocked} / ${missions.length} unlocked`;
  dom.progressPercent.textContent = `${unlockedPercent}%`;
  dom.progressRing.style.setProperty("--progress", `${unlockedPercent}%`);
  dom.totalStars.textContent = String(totalStars);
}

function renderMissionPreview(mission) {
  const obstacles = new Set(mission.obstacles.map(cellKey));
  const cells = [];

  for (let row = 0; row < mission.size; row += 1) {
    for (let column = 0; column < mission.size; column += 1) {
      const cell = [column, row];
      let className = "preview-cell";
      if (obstacles.has(cellKey(cell))) className += " wall";
      if (sameCell(cell, mission.start)) className += " start";
      if (sameCell(cell, mission.goal)) className += " goal";
      cells.push(`<i class="${className}"></i>`);
    }
  }

  return `<div class="preview-grid" style="grid-template-columns: repeat(${mission.size}, 1fr)">${cells.join("")}</div>`;
}

function renderStars(amount) {
  return [1, 2, 3]
    .map((star) => `<span class="${star <= amount ? "" : "empty"}">${spriteIcon("star", { className: star <= amount ? "icon-fill" : "" })}</span>`)
    .join("");
}

async function resetProgress() {
  dom.confirmResetButton.disabled = true;
  try {
    progress = await resetServerProgress();
    renderMissionMenu();
    dom.confirmDialog.hidden = true;
  } catch (error) {
    dom.confirmDialog.querySelector("p").textContent = error.message;
  } finally {
    dom.confirmResetButton.disabled = false;
  }
}

function cellKey([column, row]) {
  return `${column},${row}`;
}

function sameCell(first, second) {
  return first[0] === second[0] && first[1] === second[1];
}
