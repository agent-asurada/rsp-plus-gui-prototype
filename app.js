/* Remote SSH Plus — interactive prototype */
(function () {
  "use strict";

  // ---------- Sample data ----------
  const HOSTS = [
    { alias: "dev-box", hostName: "10.0.0.42", user: "dev", port: null },
    { alias: "pixel-lab", hostName: "pixel-lab.lan", user: "android", port: "22" },
    { alias: "ci-remote", hostName: "ci.example.com", user: "builder", port: "2222" },
  ];

  const REMOTE_TREE = {
    "/home/android": [
      { name: "..", isDir: true },
      { name: "android-demo", isDir: true },
      { name: "sdk", isDir: true },
      { name: ".ssh", isDir: true },
      { name: ".bashrc", isDir: false },
    ],
    "/home/android/android-demo": [
      { name: "..", isDir: true },
      { name: "app", isDir: true },
      { name: "gradle", isDir: true },
      { name: ".git", isDir: true },
      { name: "build.gradle.kts", isDir: false },
      { name: "settings.gradle.kts", isDir: false },
      { name: "gradlew", isDir: false },
      { name: "local.properties", isDir: false },
    ],
    "/home/android/android-demo/app": [
      { name: "..", isDir: true },
      { name: "src", isDir: true },
      { name: "build.gradle.kts", isDir: false },
      { name: "proguard-rules.pro", isDir: false },
    ],
    "/home/android/sdk": [
      { name: "..", isDir: true },
      { name: "platform-tools", isDir: true },
      { name: "platforms", isDir: true },
    ],
    "/home/dev": [
      { name: "..", isDir: true },
      { name: "projects", isDir: true },
      { name: "notes.txt", isDir: false },
    ],
    "/home/dev/projects": [
      { name: "..", isDir: true },
      { name: "remote-app", isDir: true },
      { name: "scratch", isDir: true },
    ],
    "/home/builder": [
      { name: "..", isDir: true },
      { name: "ci-workspace", isDir: true },
    ],
  };

  const HOME_BY_HOST = {
    "dev-box": "/home/dev",
    "pixel-lab": "/home/android",
    "ci-remote": "/home/builder",
  };

  let sessions = [
    {
      name: "pixel-lab_android-demo_a1b2",
      status: "Watching",
      paused: false,
      conflicts: 0,
      alpha: "/home/shuang/rsp-mirrors/pixel-lab_android-demo",
      beta: "pixel-lab:/home/android/android-demo",
      lastError: "",
      mapping: {
        localPath: "/home/shuang/rsp-mirrors/pixel-lab_android-demo",
        host: "pixel-lab",
        remotePath: "/home/android/android-demo",
        sessionName: "pixel-lab_android-demo_a1b2",
        gitSessionName: "pixel-lab_android-demo_a1b2_git",
      },
    },
    {
      name: "dev-box_projects_c3d4",
      status: "Scanning",
      paused: true,
      conflicts: 0,
      alpha: "/home/shuang/rsp-mirrors/dev-box_projects",
      beta: "dev-box:/home/dev/projects",
      lastError: "",
      mapping: {
        localPath: "/home/shuang/rsp-mirrors/dev-box_projects",
        host: "dev-box",
        remotePath: "/home/dev/projects",
        sessionName: "dev-box_projects_c3d4",
        gitSessionName: "",
      },
    },
    {
      name: "ci-remote_ci-workspace_e5f6",
      status: "missing",
      paused: false,
      conflicts: 0,
      alpha: "/home/shuang/rsp-mirrors/ci-remote_ci-workspace",
      beta: "ci-remote:/home/builder/ci-workspace",
      lastError: "session not found — recreate?",
      mapping: {
        localPath: "/home/shuang/rsp-mirrors/ci-remote_ci-workspace",
        host: "ci-remote",
        remotePath: "/home/builder/ci-workspace",
        sessionName: "ci-remote_ci-workspace_e5f6",
        gitSessionName: "",
      },
    },
  ];

  // ---------- State ----------
  let wizStep = 0;
  let wizBusy = false;
  let selectedHost = HOSTS[1]; // pixel-lab
  let cwd = "";
  let selectedSession = 0;
  let adbRunning = false;
  let modalResolver = null;

  // ---------- Helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function toast(msg, isErr) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function showModal({ title, body, warn, buttons, input }) {
    return new Promise((resolve) => {
      modalResolver = resolve;
      const overlay = $("#overlay");
      const modal = $("#modal");
      modal.classList.toggle("warn-icon", !!warn);
      $("#modalTitle").textContent = title;
      const bodyEl = $("#modalBody");
      bodyEl.textContent = body || "";
      let inputEl = null;
      if (input) {
        inputEl = document.createElement("input");
        inputEl.className = "input";
        inputEl.style.marginTop = "10px";
        inputEl.value = input.value || "";
        inputEl.spellcheck = false;
        bodyEl.appendChild(document.createElement("br"));
        bodyEl.appendChild(inputEl);
      }
      const foot = $("#modalFoot");
      foot.innerHTML = "";
      const finish = (id) => {
        overlay.classList.remove("show");
        modalResolver = null;
        resolve(inputEl ? { id: id, value: inputEl.value } : id);
      };
      (buttons || [{ id: "ok", label: "OK", primary: true }]).forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "") + (b.warn ? " warn" : "");
        btn.textContent = b.label;
        btn.addEventListener("click", () => finish(b.id));
        foot.appendChild(btn);
      });
      overlay.classList.add("show");
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") finish("ok");
        });
      } else {
        const focusBtn = foot.querySelector(".primary") || foot.querySelector("button");
        if (focusBtn) focusBtn.focus();
      }
    });
  }

  $("#overlay").addEventListener("click", (e) => {
    if (e.target === $("#overlay") && modalResolver) {
      $("#overlay").classList.remove("show");
      const r = modalResolver;
      modalResolver = null;
      r("cancel");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalResolver) {
      $("#overlay").classList.remove("show");
      const r = modalResolver;
      modalResolver = null;
      r("cancel");
    }
  });

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function parentPath(p) {
    const t = p.replace(/\/+$/, "");
    const i = t.lastIndexOf("/");
    return i <= 0 ? "/" : t.slice(0, i);
  }

  function hostLabel(h) {
    let s = h.alias;
    if (h.hostName) {
      s += "  (" + (h.user ? h.user + "@" : "") + h.hostName + (h.port ? ":" + h.port : "") + ")";
    }
    return s;
  }

  function statusPill(status, paused) {
    let cls = "watching";
    let text = status;
    if (paused) { cls = "paused"; text = "Paused"; }
    else if (/missing|error/i.test(status)) cls = "missing";
    else if (/Scan|Connecting|Staging|Working/i.test(status)) cls = "syncing";
    else if (/Watch/i.test(status)) cls = "watching";
    return `<span class="pill ${cls}">${text}</span>`;
  }

  // ---------- Nav ----------
  function showPanel(name) {
    const allowed = ["wizard", "sync", "tools", "status"];
    if (!allowed.includes(name)) name = "wizard";
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    if (location.hash.replace(/^#/, "") !== name) {
      history.replaceState(null, "", "#" + name);
    }
  }
  $$("#nav button").forEach((btn) => {
    btn.addEventListener("click", () => showPanel(btn.dataset.panel));
  });
  window.addEventListener("hashchange", () => showPanel(location.hash.replace(/^#/, "") || "wizard"));

  // ---------- Wizard ----------
  function setWizStatus(msg, kind) {
    const el = $("#wizStatus");
    el.textContent = msg || " ";
    el.className = "status-line" + (kind ? " " + kind : "");
  }

  function renderHosts() {
    const box = $("#hostList");
    box.innerHTML = "";
    if (!HOSTS.length) {
      setWizStatus("No Host entries found in ~/.ssh/config", "err");
      return;
    }
    HOSTS.forEach((h, i) => {
      const div = document.createElement("div");
      div.className = "item" + (h === selectedHost ? " selected" : "");
      div.innerHTML = hostLabel(h);
      div.addEventListener("click", () => {
        selectedHost = h;
        renderHosts();
      });
      div.addEventListener("dblclick", () => wizNext());
      box.appendChild(div);
      if (h === selectedHost) div.scrollIntoView({ block: "nearest" });
    });
  }

  function entriesFor(path) {
    if (REMOTE_TREE[path]) return REMOTE_TREE[path];
    // synthesize parent listing
    if (path === "/") return [{ name: "home", isDir: true }, { name: "tmp", isDir: true }];
    return [{ name: "..", isDir: true }];
  }

  function renderDirs() {
    const box = $("#dirList");
    box.innerHTML = "";
    $("#remotePath").value = cwd;
    entriesFor(cwd).forEach((e) => {
      const div = document.createElement("div");
      div.className = "item " + (e.isDir ? "dir" : "file");
      div.textContent = e.isDir ? e.name + "/" : e.name;
      div.addEventListener("click", () => {
        $$(".item", box).forEach((x) => x.classList.remove("selected"));
        div.classList.add("selected");
      });
      div.addEventListener("dblclick", () => {
        if (!e.isDir || wizBusy) return;
        const next = e.name === ".." ? parentPath(cwd) : cwd.replace(/\/$/, "") + "/" + e.name;
        browse(next);
      });
      box.appendChild(div);
    });
  }

  async function browse(dir) {
    wizBusy = true;
    setWizStatus("Listing " + dir + "…", "busy");
    $("#wizNext").disabled = true;
    await sleep(350);
    cwd = dir === "/" ? "/" : dir.replace(/\/+$/, "") || "/";
    // if unknown path under a known home, still show something
    if (!REMOTE_TREE[cwd] && !cwd.endsWith("..")) {
      // keep listing if we have a parent with that child as dir — else empty with ..
      if (!REMOTE_TREE[cwd]) {
        REMOTE_TREE[cwd] = [{ name: "..", isDir: true }];
      }
    }
    renderDirs();
    wizBusy = false;
    setWizStatus(" ");
    $("#wizNext").disabled = false;
  }

  function showWizStep(i) {
    wizStep = i;
    $$("#stepList .step").forEach((s, idx) => {
      s.classList.toggle("current", idx === i);
      s.classList.toggle("done", idx < i);
    });
    $$(".card").forEach((c) => c.classList.toggle("active", Number(c.dataset.card) === i));
    $("#wizPrev").disabled = i === 0 || wizBusy;
    $("#wizNext").textContent = i === 2 ? "OK" : "Next";
  }

  async function wizNext() {
    if (wizBusy) return;
    if (wizStep === 0) {
      if (!selectedHost) {
        setWizStatus("Select a host", "err");
        return;
      }
      wizBusy = true;
      setWizStatus("Connecting to " + selectedHost.alias + "…", "busy");
      $("#wizNext").disabled = true;
      await sleep(500);
      wizBusy = false;
      $("#wizNext").disabled = false;
      const home = HOME_BY_HOST[selectedHost.alias] || "/home";
      const preferred =
        selectedHost.alias === "pixel-lab" ? "/home/android/android-demo" : home;
      showWizStep(1);
      await browse(preferred);
      return;
    }
    if (wizStep === 1) {
      if (!cwd) {
        setWizStatus("Pick a remote directory", "err");
        return;
      }
      const base = selectedHost.alias + "_" + cwd.split("/").filter(Boolean).pop();
      $("#localPath").value = "/home/shuang/rsp-mirrors/" + base;
      showWizStep(2);
      setWizStatus(" ");
      return;
    }
    // OK
    if (!$("#localPath").value.trim()) {
      setWizStatus("Local directory is required", "err");
      return;
    }
    wizBusy = true;
    setWizStatus("Creating Mutagen session & opening project…", "busy");
    await sleep(700);
    wizBusy = false;
    const mode = $("#syncMode").selectedOptions[0].text;
    setWizStatus("Opened " + $("#localPath").value + " · " + mode, " ");
    toast("映射已创建 · Mutagen session started");
    showPanel("sync");
  }

  $("#wizPrev").addEventListener("click", () => {
    if (wizStep > 0 && !wizBusy) {
      showWizStep(wizStep - 1);
      setWizStatus(" ");
    }
  });
  $("#wizNext").addEventListener("click", wizNext);
  $("#wizCancel").addEventListener("click", () => {
    showWizStep(0);
    setWizStatus("Cancelled");
  });
  $("#remotePath").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !wizBusy) browse($("#remotePath").value.trim() || "/");
  });
  $("#browseLocal").addEventListener("click", () => {
    toast("FileChooser stub — 本地目录已预填");
  });

  // ---------- Sync table ----------
  function renderSessions() {
    const tb = $("#sessionTable tbody");
    tb.innerHTML = "";
    sessions.forEach((s, i) => {
      const tr = document.createElement("tr");
      if (i === selectedSession) tr.classList.add("selected");
      const pillStatus = s.paused && !/missing/i.test(s.status) ? "Paused" : s.status;
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${statusPill(pillStatus, s.paused && !/missing/i.test(s.status))}</td>
        <td>${s.paused}</td>
        <td>${s.conflicts}</td>
        <td title="${s.alpha}">${shorten(s.alpha)}</td>
        <td title="${s.beta}">${shorten(s.beta)}</td>
        <td style="color:var(--err)">${s.lastError || ""}</td>`;
      tr.addEventListener("click", () => {
        selectedSession = i;
        renderSessions();
        updateToolbar();
      });
      tb.appendChild(tr);
    });
    updateToolbar();
  }

  function shorten(p) {
    if (!p) return "";
    if (p.length <= 42) return p;
    return "…" + p.slice(-40);
  }

  function updateToolbar() {
    const s = sessions[selectedSession];
    const has = !!s;
    $$("#syncToolbar [data-act]").forEach((btn) => {
      const act = btn.dataset.act;
      if (act === "refresh") {
        btn.disabled = false;
        return;
      }
      btn.disabled = !has;
      if (has && act === "pause") btn.disabled = s.paused || /missing/i.test(s.status);
      if (has && act === "resume") btn.disabled = !s.paused || /missing/i.test(s.status);
    });
  }

  $("#syncToolbar").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const s = sessions[selectedSession];
    if (act === "refresh") {
      toast("Refreshed sessions");
      // flip watching label slightly
      sessions.forEach((x) => {
        if (!x.paused && /Watch|Scan/i.test(x.status) && !/missing/i.test(x.status)) {
          x.status = x.status === "Watching" ? "Watching" : "Watching";
        }
      });
      renderSessions();
      return;
    }
    if (!s) return;
    if (act === "flush") {
      toast("Flush: " + s.name);
      s.status = "Watching";
      renderSessions();
      return;
    }
    if (act === "pause") {
      s.paused = true;
      toast("Paused " + s.name);
      renderSessions();
      return;
    }
    if (act === "resume") {
      s.paused = false;
      s.status = "Watching";
      toast("Resumed " + s.name);
      renderSessions();
      return;
    }
    if (act === "terminate") {
      const m = s.mapping;
      let msg;
      if (!m) {
        msg = "Terminate " + s.name + "? Local files are kept.";
      } else {
        msg =
          "Stop syncing " +
          m.localPath +
          " ↔ " +
          m.host +
          ":" +
          m.remotePath +
          "?\n\nThis terminates " +
          m.sessionName +
          (m.gitSessionName ? " and " + m.gitSessionName : "") +
          " and forgets the mapping. Local files are kept.";
      }
      const ans = await showModal({
        title: "Terminate Session",
        body: msg,
        buttons: [
          { id: "no", label: "No" },
          { id: "yes", label: "Yes", primary: true, danger: true },
        ],
      });
      if (ans === "yes") {
        sessions.splice(selectedSession, 1);
        selectedSession = Math.max(0, selectedSession - 1);
        toast("Terminated — local files kept");
        renderSessions();
      }
    }
  });

  // ---------- Tools menu demos ----------
  const toolsMenu = $("#toolsMenu");
  toolsMenu.addEventListener("mouseenter", () => toolsMenu.classList.add("open"));
  toolsMenu.addEventListener("mouseleave", () => toolsMenu.classList.remove("open"));

  function updateAdbMenu() {
    const el = $("#adbMenuItem");
    el.textContent = adbRunning
      ? "Stop ADB Reverse Forward (pixel-lab)"
      : "Start ADB Reverse Forward (5037 → pixel-lab)";
  }

  $$("#toolsMenu .mi[data-tool]").forEach((mi) => {
    mi.addEventListener("click", (e) => {
      e.stopPropagation();
      toolsMenu.classList.remove("open");
      runTool(mi.dataset.tool);
    });
  });

  async function runTool(id) {
    const area = $("#toolDemo");
    if (id === "gradle") return demoGradle(area);
    if (id === "adb") return demoAdb(area);
    if (id === "install") return demoInstall(area);
    if (id === "git") {
      area.innerHTML = `
        <h3 style="margin:0 0 8px;color:var(--text-bright)">Use Remote Git for This Project</h3>
        <p>Stub panel — 真实插件会为映射生成 git wrapper（<code>~/.remote-ssh-plus/git/&lt;session&gt;/git</code>），
          并设置项目级 Git 可执行文件；另建只读 <code>.git</code> mirror 会话。</p>
        <button type="button" class="btn primary" id="gitStubOk">Enable Remote Git</button>
        <p class="hint">Windows 不支持（cmd.exe 无法安全转发参数）。</p>`;
      $("#gitStubOk").onclick = () => toast("Remote Git enabled for this project (stub)");
      return;
    }
    if (id === "term") {
      area.innerHTML = `
        <h3 style="margin:0 0 8px;color:var(--text-bright)">Open Remote Terminal</h3>
        <div class="console" id="termStub"><span class="info">$ ssh -t pixel-lab 'cd /home/android/android-demo &amp;&amp; exec $SHELL -l'</span>
android@pixel-lab:~/android-demo$ ▌</div>
        <p class="hint">Stub — 需 Terminal 插件；在 IDE 终端里开本地 shell 并 exec ssh。</p>`;
      return;
    }
  }

  async function demoGradle(area) {
    const ans = await showModal({
      title: "Remote Gradle",
      body: "Gradle tasks/arguments to run on pixel-lab:",
      input: { value: ":app:assembleDebug" },
      buttons: [
        { id: "cancel", label: "Cancel" },
        { id: "ok", label: "OK", primary: true },
      ],
    });
    if (!ans || ans === "cancel" || ans.id === "cancel") return;
    const taskName = ((ans && ans.value) || ":app:assembleDebug").trim() || ":app:assembleDebug";

    area.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin:0 0 8px">
        <strong style="color:var(--text-bright)">Remote: <span id="runTitle"></span></strong>
        <button type="button" class="btn" id="stopGradle">Stop</button>
        <button type="button" class="btn" id="runGradle">Rerun</button>
      </div>
      <div class="console" id="gradleConsole"></div>
      <div id="apkProgress" style="display:none;margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span>Pulling APK… <span id="apkName">app-debug.apk</span></span>
          <button type="button" class="btn" id="cancelPull">Cancel</button>
        </div>
        <div class="progress"><i id="apkBar"></i></div>
      </div>
      <div class="notif" id="apkNotif">
        <h4>Remote SSH Plus</h4>
        <div id="apkNotifBody"></div>
        <div class="actions" id="apkActions"></div>
      </div>`;

    const consoleEl = $("#gradleConsole");
    let cancelled = false;
    let running = false;

    async function streamLines(lines, delay) {
      for (const line of lines) {
        if (cancelled) break;
        const span = document.createElement("div");
        if (/BUILD SUCCESSFUL/.test(line)) span.className = "ok";
        else if (/WARNING|warn/i.test(line)) span.className = "warn";
        else if (/error|FAILED/i.test(line)) span.className = "err";
        else if (/^>|> Task|Starting/.test(line)) span.className = "info";
        span.textContent = line;
        consoleEl.appendChild(span);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        await sleep(delay);
      }
    }

    $("#runTitle").textContent = taskName;
    $("#runGradle").onclick = async () => {
      if (running) return;
      running = true;
      cancelled = false;
      const tasks = taskName;
      $("#runTitle").textContent = tasks;
      $("#stopGradle").disabled = false;
      $("#apkNotif").classList.remove("show");
      $("#apkProgress").style.display = "none";
      consoleEl.innerHTML = "";
      await streamLines(
        [
          "$ ssh -tt pixel-lab \"sh -lc 'cd /home/android/android-demo && ./gradlew " + tasks + "'\"",
          "Starting a Gradle Daemon…",
          "> Task :app:preBuild UP-TO-DATE",
          "> Task :app:mergeDebugResources",
          "> Task :app:compileDebugKotlin",
          "> Task :app:compileDebugJavaWithJavac",
          "> Task :app:packageDebug",
          "> Task :app:assembleDebug",
          "",
          "BUILD SUCCESSFUL in 12s",
          "4 actionable tasks: 3 executed, 1 up-to-date",
        ],
        280
      );
      if (cancelled) {
        running = false;
        $("#stopGradle").disabled = true;
        return;
      }
      // APK pull
      $("#apkProgress").style.display = "block";
      $("#apkName").textContent = "app/build/outputs/apk/debug/app-debug.apk";
      const bar = $("#apkBar");
      let pullCancel = false;
      $("#cancelPull").onclick = () => {
        pullCancel = true;
        toast("APK pull cancelled", true);
        $("#apkProgress").style.display = "none";
      };
      for (let p = 0; p <= 100; p += 8) {
        if (pullCancel || cancelled) break;
        bar.style.width = p + "%";
        await sleep(80);
      }
      $("#stopGradle").disabled = true;
      running = false;
      if (pullCancel || cancelled) return;
      $("#apkProgress").style.display = "none";
      const local =
        "/home/shuang/rsp-mirrors/pixel-lab_android-demo/app/build/outputs/apk/debug/app-debug.apk";
      $("#apkNotifBody").innerHTML =
        "Pulled 1 APK(s):<br><code>" + local + "</code>";
      $("#apkActions").innerHTML = `
        <button type="button" class="btn primary" id="installFast">adb install app-debug.apk</button>
        <button type="button" class="btn" id="copyPath">Copy path</button>`;
      $("#apkNotif").classList.add("show");
      $("#installFast").onclick = () =>
        toast("Installed app-debug.apk (fastdeploy) — fallback: full -r if needed");
      $("#copyPath").onclick = () => toast("Copied: " + local);
    };

    $("#stopGradle").onclick = () => {
      cancelled = true;
      consoleEl.innerHTML += '\n<span class="err">Process terminated (Stop)</span>';
      $("#stopGradle").disabled = true;
      running = false;
    };

    // auto-run for click-through
    $("#runGradle").click();
  }

  async function demoAdb(area) {
    const host = "pixel-lab";
    if (adbRunning) {
      const ans = await showModal({
        title: "Stop ADB Reverse Forward",
        body:
          "Stop the ADB reverse forward to " +
          host +
          "? Other open projects using it lose it too.",
        buttons: [
          { id: "no", label: "No" },
          { id: "yes", label: "Yes", primary: true },
        ],
      });
      if (ans === "yes") {
        adbRunning = false;
        updateAdbMenu();
        area.innerHTML = `<p>ADB reverse forward to <code>${host}</code> stopped.</p>`;
        toast("ADB reverse forward stopped");
      }
      return;
    }

    const body =
      "While the forward is active, EVERY user and process on " +
      host +
      " can connect to 127.0.0.1:5037 there and fully control the Android devices/emulators attached to this computer (install apps, run shell, read data).\n\n" +
      "Starting it also runs `adb kill-server` on " +
      host +
      ", stopping the remote adb server.\n\n" +
      "Only continue if you trust every account on " +
      host +
      ".";

    const ans = await showModal({
      title: "Start ADB Reverse Forward",
      body,
      warn: true,
      buttons: [
        { id: "cancel", label: "Cancel" },
        { id: "start", label: "Start", primary: true, warn: true },
      ],
    });
    if (ans !== "start") {
      area.innerHTML = `<p class="hint">Cancelled — forward not started.</p>`;
      return;
    }
    area.innerHTML = `
      <p><span class="pill syncing">Starting…</span> local <code>adb start-server</code> · remote <code>adb kill-server</code> ·
        <code>ssh -N -R 127.0.0.1:5037:127.0.0.1:5037 ${host}</code></p>
      <div class="console" id="adbLog"></div>`;
    const log = $("#adbLog");
    const lines = [
      "local adb start-server: OK",
      "remote: adb kill-server",
      "debug1: Remote connections from LOCALHOST:5037 forwarded to local address 127.0.0.1:5037",
      "debug1: remote forward success for: listen 127.0.0.1:5037, connect 127.0.0.1:5037",
    ];
    for (const l of lines) {
      log.innerHTML += ( /success/.test(l) ? '<span class="ok">' : '<span class="info">' ) + l + "</span>\n";
      await sleep(220);
    }
    adbRunning = true;
    updateAdbMenu();
    area.innerHTML += `
      <div class="notif show" style="border-left-color:var(--ok)">
        <h4>Remote SSH Plus</h4>
        <div>Remote adb on ${host} now reaches local devices via 127.0.0.1:5037.
          Note: a remote adb whose version differs from the local one may restart (kill) the local adb server.</div>
        <div class="actions">
          <button type="button" class="btn danger" id="stopAdbNow">Stop ADB Reverse Forward</button>
        </div>
      </div>`;
    $("#stopAdbNow").onclick = () => runTool("adb");
  }

  async function demoInstall(area) {
    area.innerHTML = `
      <h3 style="margin:0 0 8px;color:var(--text-bright)">Install Pulled APK via Local adb…</h3>
      <p class="hint">FileChooser stub — 选择本地镜像中的 APK。</p>
      <div class="listbox" id="apkPicker" style="min-height:140px;max-width:560px"></div>
      <div style="margin-top:10px" class="inline-row">
        <button type="button" class="btn primary" id="doInstall" disabled>Install</button>
        <span class="hint" id="installMode"></span>
      </div>
      <div class="console" id="installLog" style="height:140px;margin-top:10px;display:none"></div>`;

    const apks = [
      "app/build/outputs/apk/debug/app-debug.apk",
      "app/build/outputs/apk/release/app-release.apk",
    ];
    let chosen = null;
    const box = $("#apkPicker");
    apks.forEach((p) => {
      const div = document.createElement("div");
      div.className = "item file";
      div.textContent = p;
      div.onclick = () => {
        $$(".item", box).forEach((x) => x.classList.remove("selected"));
        div.classList.add("selected");
        chosen = p;
        $("#doInstall").disabled = false;
      };
      box.appendChild(div);
    });
    // preselect first
    box.firstChild.click();

    $("#doInstall").onclick = async () => {
      const log = $("#installLog");
      log.style.display = "block";
      log.innerHTML = "";
      $("#installMode").textContent = "trying --fastdeploy…";
      log.innerHTML += '<span class="info">$ adb install -r --fastdeploy ' + chosen + "</span>\n";
      await sleep(500);
      // simulate fastdeploy success most of the time
      const useFast = !chosen.includes("release");
      if (useFast) {
        log.innerHTML += '<span class="ok">Performing Incremental Install\nSuccess</span>\n';
        $("#installMode").textContent = "mode: fastdeploy";
        toast("Installed " + chosen.split("/").pop() + " (fastdeploy)");
      } else {
        log.innerHTML += '<span class="warn">Failure [INSTALL_FAILED_FASTDEPLOY_…]\nfallback → adb install -r</span>\n';
        await sleep(400);
        log.innerHTML += '<span class="info">$ adb install -r ' + chosen + "</span>\n";
        await sleep(400);
        log.innerHTML += '<span class="ok">Success</span>\n';
        $("#installMode").textContent = "mode: full (-r) — fastdeploy unavailable";
        toast("Installed " + chosen.split("/").pop() + " (full)");
      }
    };
  }

  // ---------- Init ----------
  renderHosts();
  showWizStep(0);
  renderSessions();
  updateAdbMenu();
  showPanel(location.hash.replace(/^#/, "") || "wizard");
})();
