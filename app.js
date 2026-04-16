
    const STORAGE_KEY = "invoice_tool_full_v1";
    const THEME_KEY = "invoice_tool_theme_v1";
    const ENCRYPTED_PREFIX = "ENC:";

    let deferredPrompt = null;
    let saveTimeout = null;
    let lastSaveTime = null;

    async function deriveKey(password, salt) {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    }

    function uint8ToBase64(uint8Array) {
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    }

    function base64ToUint8(base64String) {
      const binary = atob(base64String);
      const uint8 = new Uint8Array(binary.length);
      const chunkSize = 8192;
      for (let i = 0; i < binary.length; i += chunkSize) {
        const chunk = binary.slice(i, i + chunkSize);
        for (let j = 0; j < chunk.length; j++) {
          uint8[i + j] = chunk.charCodeAt(j);
        }
      }
      return uint8;
    }

    async function encryptData(data, password) {
      const encoder = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(password, salt);
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(data)
      );
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);
      return ENCRYPTED_PREFIX + uint8ToBase64(combined);
    }

    async function decryptData(encryptedBase64, password) {
      const combined = base64ToUint8(encryptedBase64.slice(ENCRYPTED_PREFIX.length));
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const ciphertext = combined.slice(28);
      const key = await deriveKey(password, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    }

    function isEncrypted(content) {
      return typeof content === "string" && content.startsWith(ENCRYPTED_PREFIX);
    }

    const DEFAULT_SETTINGS = {
      standardRate: 16,
      halfRate: 24,
      doubleRate: 32,
      officeRate: 12.5,
      standardThreshold: 8,
      halfThreshold: 16,
      calcMode: "start_to_return",
      sundayDouble: true,
      vatRate: 0
    };

    function uid() {
      return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id_" + Math.random().toString(36).slice(2, 10);
    }

    function todayISO() {
      return new Date().toISOString().slice(0, 10);
    }

    function clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    function blankDay(type = "production") {
      const base = {
        id: uid(),
        type,
        date: todayISO(),
        startTime: "",
        arriveTime: "",
        arrivePostcode: "",
        callTime: "",
        wrapTime: "",
        wrapPostcode: "",
        leaveTime: "",
        returnTime: "",
        finishTime: "",
        officeHours: "",
        minCharge4h: false,
        minCharge8h: false,
        nightShoot: false,
        restDayCharge: false,
        cCharge: false,
        ulez: false,
        expenseAmount: "",
        expenseNotes: "",
        notes: "",
        tasksDone: ""
      };

      if (type === "production") {
        base.startTime = "06:00";
        base.arriveTime = "07:00";
        base.callTime = "08:00";
        base.wrapTime = "17:00";
        base.leaveTime = "18:00";
        base.returnTime = "20:00";
      } else if (type === "collection" || type === "return") {
        base.startTime = "06:00";
        base.returnTime = "20:00";
      } else if (type === "office") {
        base.startTime = "09:00";
        base.finishTime = "17:00";
        base.officeHours = "8";
      }

      return base;
    }

    function defaultJob() {
      return {
        id: uid(),
        title: "Untitled Job",
        invoiceDate: todayISO(),
        invoiceNumber: "",
        productionCompany: "",
        vehicleName: "",
        jobMileageStart: "",
        jobMileageEnd: "",
        toName: "Client Name",
        toAddress: "Client Address",
        yourName: "Your Name",
        yourAddress: "Your Address",
        yourSortCode: "Your Sort Code",
        yourBankAccount: "Your Bank Account",
        clientRef: "",
        generalNotes: "",
        settings: clone(DEFAULT_SETTINGS),
        days: []
      };
    }

    const state = {
      jobs: [],
      activeJobId: null,
      tab: "timings"
    };

    const refs = {
      jobsList: document.getElementById("jobsList"),
      jobsCount: document.getElementById("jobsCount"),
      currentJobTitle: document.getElementById("currentJobTitle"),
      currentJobMeta: document.getElementById("currentJobMeta"),
      year: document.getElementById("year"),
      daysList: document.getElementById("daysList"),
      summaryBody: document.getElementById("summaryBody"),
      printRoot: document.getElementById("printRoot"),

      tabTimings: document.getElementById("tab-timings"),
      tabSummary: document.getElementById("tab-summary"),
      tabSettings: document.getElementById("tab-settings"),

      jobTitle: document.getElementById("jobTitle"),
      invoiceDate: document.getElementById("invoiceDate"),
      invoiceNumber: document.getElementById("invoiceNumber"),
      productionCompany: document.getElementById("productionCompany"),
      vehicleName: document.getElementById("vehicleName"),
      jobMileageStart: document.getElementById("jobMileageStart"),
      jobMileageEnd: document.getElementById("jobMileageEnd"),
      jobMileageTotal: document.getElementById("jobMileageTotal"),
      toName: document.getElementById("toName"),
      toAddress: document.getElementById("toAddress"),
      yourName: document.getElementById("yourName"),
      yourAddress: document.getElementById("yourAddress"),
      yourSortCode: document.getElementById("yourSortCode"),
      yourBankAccount: document.getElementById("yourBankAccount"),
      clientRef: document.getElementById("clientRef"),
      generalNotes: document.getElementById("generalNotes"),

      rateStandard: document.getElementById("rateStandard"),
      rateHalf: document.getElementById("rateHalf"),
      rateDouble: document.getElementById("rateDouble"),
      rateOffice: document.getElementById("rateOffice"),
      thresholdStandard: document.getElementById("thresholdStandard"),
      thresholdHalf: document.getElementById("thresholdHalf"),
      calcMode: document.getElementById("calcMode"),
      sundayDouble: document.getElementById("sundayDouble"),
      vatRate: document.getElementById("vatRate"),

      sumDays: document.getElementById("sumDays"),
      sumHours: document.getElementById("sumHours"),
      sumMileage: document.getElementById("sumMileage"),
      sumStd: document.getElementById("sumStd"),
      sumHalf: document.getElementById("sumHalf"),
      sumDouble: document.getElementById("sumDouble"),
      sumOffice: document.getElementById("sumOffice"),
      sumExpenses: document.getElementById("sumExpenses"),
      sumValue: document.getElementById("sumValue"),
      sumSubtotal: document.getElementById("sumSubtotal"),
      sumVat: document.getElementById("sumVat"),
      vatPercent: document.getElementById("vatPercent"),

      mobileJobTitle: document.getElementById("mobileJobTitle"),
      saveIndicator: document.getElementById("saveIndicator"),
      saveText: document.getElementById("saveText"),
      installBanner: document.getElementById("installBanner"),
      quickAddPanel: document.getElementById("quickAddPanel"),
      fab: document.getElementById("fab"),
      toast: document.getElementById("toast"),
      modalOverlay: document.getElementById("modalOverlay"),
      modalTitle: document.getElementById("modalTitle"),
      modalMessage: document.getElementById("modalMessage"),
      modalCancel: document.getElementById("modalCancel"),
      modalConfirm: document.getElementById("modalConfirm"),
      modalClose: document.getElementById("modalClose")
    };

    let modalResolve = null;

    function showModal(title, message, isHtml = false) {
      return new Promise((resolve) => {
        refs.modalTitle.textContent = title;
        if (isHtml) {
          refs.modalMessage.innerHTML = message;
        } else {
          refs.modalMessage.textContent = message;
        }
        refs.modalOverlay.classList.add("visible");
        modalResolve = resolve;
      });
    }

    function closeModal(result) {
      refs.modalOverlay.classList.remove("visible");
      if (modalResolve) modalResolve(result);
      modalResolve = null;
    }

    refs.modalCancel.addEventListener("click", () => closeModal(false));
    refs.modalConfirm.addEventListener("click", () => closeModal(true));
    refs.modalClose.addEventListener("click", () => closeModal(false));
    refs.modalOverlay.addEventListener("click", (e) => {
      if (e.target === refs.modalOverlay) closeModal(false);
    });

    function showToast(message, duration = 2500) {
      refs.toast.textContent = message;
      refs.toast.classList.add("visible");
      setTimeout(() => refs.toast.classList.remove("visible"), duration);
    }

    function showSaveIndicator(saving = false) {
      refs.saveIndicator.classList.add("visible");
      refs.saveIndicator.classList.toggle("saving", saving);
      refs.saveText.textContent = saving ? "Saving..." : "Saved";
      
      if (!saving) {
        lastSaveTime = Date.now();
        setTimeout(() => {
          if (!saveTimeout) refs.saveIndicator.classList.remove("visible");
        }, 2000);
      }
    }

    function debouncedSave() {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveState();
        showSaveIndicator(false);
        saveTimeout = null;
      }, 800);
      showSaveIndicator(true);
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(THEME_KEY, theme);
    }

    function initTheme() {
      const saved = localStorage.getItem(THEME_KEY) || "dark";
      applyTheme(saved);
    }

    function toggleTheme() {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    }

    function saveState(immediate = false) {
      if (immediate) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        showSaveIndicator(false);
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = null;
        }
      } else {
        debouncedSave();
      }
    }

    function loadState() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const job = defaultJob();
        state.jobs = [job];
        state.activeJobId = job.id;
        saveState();
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        state.jobs = Array.isArray(parsed.jobs) ? parsed.jobs.map(normalizeJob) : [];
        state.activeJobId = parsed.activeJobId || null;
        state.tab = parsed.tab || "timings";

        if (!state.jobs.length) {
          const job = defaultJob();
          state.jobs = [job];
          state.activeJobId = job.id;
        }

        if (!state.jobs.some(j => j.id === state.activeJobId)) {
          state.activeJobId = state.jobs[0].id;
        }
      } catch {
        const job = defaultJob();
        state.jobs = [job];
        state.activeJobId = job.id;
      }
    }

    function normalizeJob(job) {
      const fresh = defaultJob();
      return {
        ...fresh,
        ...job,
        settings: { ...DEFAULT_SETTINGS, ...(job.settings || {}) },
        days: Array.isArray(job.days) ? job.days.map(d => ({ ...blankDay(d.type || "production"), ...d })) : []
      };
    }

    function activeJob() {
      return state.jobs.find(j => j.id === state.activeJobId) || null;
    }

    function ensureAtLeastOneJob() {
      if (!state.jobs.length) {
        const job = defaultJob();
        state.jobs = [job];
        state.activeJobId = job.id;
      }
    }

    function createJob() {
      const job = defaultJob();
      job.title = `New Job ${state.jobs.length + 1}`;
      state.jobs.unshift(job);
      state.activeJobId = job.id;
      saveState();
      renderAll();
    }

    function duplicateJob() {
      const job = activeJob();
      if (!job) return;
      const copy = clone(job);
      copy.id = uid();
      copy.title = `${job.title || "Untitled Job"} Copy`;
      copy.days = copy.days.map(day => ({ ...day, id: uid() }));
      state.jobs.unshift(copy);
      state.activeJobId = copy.id;
      saveState();
      renderAll();
    }

    async function removeJob(jobId) {
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      const confirmed = await showModal("Delete Job", `Delete "${job.title}"?`);
      if (!confirmed) return;
      state.jobs = state.jobs.filter(j => j.id !== jobId);
      ensureAtLeastOneJob();
      if (!state.jobs.some(j => j.id === state.activeJobId)) {
        state.activeJobId = state.jobs[0].id;
      }
      saveState();
      renderAll();
    }

    async function resetCurrentJob() {
      const job = activeJob();
      if (!job) return;
      const confirmed = await showModal("Reset Job", "Reset the current job?");
      if (!confirmed) return;
      const replacement = defaultJob();
      replacement.id = job.id;
      const idx = state.jobs.findIndex(j => j.id === job.id);
      state.jobs[idx] = replacement;
      saveState();
      renderAll();
    }

    async function resetAllJobs() {
      const confirmed = await showModal("Reset All", "Reset all jobs? This will clear ALL data including all jobs and reset the app to its initial state. This action cannot be undone.");
      if (!confirmed) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(THEME_KEY);
      localStorage.removeItem("install_dismissed");
      state.jobs = [defaultJob()];
      state.activeJobId = state.jobs[0].id;
      state.tab = "timings";
      location.reload();
    }

    async function exportCurrentJSON() {
      const job = activeJob();
      if (!job) return;
      await exportSingleJob(job);
    }

    async function exportSingleJob(job) {
      if (!job) return;
      const title = safeFileName(job.title);
      const prodCo = safeFileName(job.productionCompany);
      const filename = prodCo ? `${title} - ${prodCo}.json` : `${title}.json`;
      const jsonData = JSON.stringify(job, null, 2);
      const password = prompt("Enter a password to protect this file (leave empty for no protection):");
      if (password === null) return;
      let content = jsonData;
      if (password && password.trim()) {
        content = await encryptData(jsonData, password.trim());
      }
      await downloadBlob(new Blob([content], { type: "application/json" }), filename);
    }

    async function backupAllJobs() {
      const payload = {
        exportedAt: new Date().toISOString(),
        jobs: state.jobs
      };
      const jsonData = JSON.stringify(payload, null, 2);
      const password = prompt("Enter a password to protect this backup (leave empty for no protection):");
      if (password === null) return;
      let content = jsonData;
      if (password && password.trim()) {
        content = await encryptData(jsonData, password.trim());
      }
      await downloadBlob(new Blob([content], { type: "application/json" }), `invoice-backup-${todayISO()}.json`);
    }

    async function importJob(file) {
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      try {
        let jsonContent = content;
        if (isEncrypted(content)) {
          const password = prompt("This file is password protected. Enter the password:");
          if (!password) throw new Error("No password provided");
          try {
            jsonContent = await decryptData(content, password);
          } catch {
            throw new Error("Wrong password or corrupted file");
          }
        }
        const parsed = JSON.parse(jsonContent);
        const importedJobs = extractJobsFromImport(parsed).map(job => {
          const normalized = normalizeJob(job);
          normalized.id = uid();
          normalized.days = normalized.days.map(d => ({ ...d, id: uid() }));
          return normalized;
        });

        if (!importedJobs.length) throw new Error("No jobs found");

        state.jobs = [...importedJobs.reverse(), ...state.jobs];
        state.activeJobId = importedJobs[0].id;
        saveState();
        renderAll();

        alert(importedJobs.length === 1 ? "1 job imported." : `${importedJobs.length} jobs imported.`);
      } catch (e) {
        alert("Could not import that JSON file." + (e.message === "Wrong password or corrupted file" ? " Wrong password?" : ""));
      }
    }

    function extractJobsFromImport(parsed) {
      const results = [];
      const seen = new WeakSet();

      function visit(node) {
        if (!node || typeof node !== "object") return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }

        if (Array.isArray(node.days)) {
          results.push(node);
          return;
        }

        if (Array.isArray(node.jobs)) {
          node.jobs.forEach(visit);
        }
      }

      visit(parsed);

      return results.filter((job, index) => {
        if (!job || !Array.isArray(job.days)) return false;
        return results.indexOf(job) === index;
      });
    }

    function safeFileName(name) {
      return (name || "job").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "job";
    }

    async function downloadBlob(blob, filename) {
      if (navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "Export file",
              text: "Save your backup file"
            });
            return;
          }
        } catch (error) {
          if (error && error.name === "AbortError") return;
          console.warn("Share export failed, falling back to download", error);
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function switchTab(tab) {
      state.tab = tab;
      saveState();
      renderTabs();
    }

    function setActiveJob(jobId) {
      state.activeJobId = jobId;
      saveState();
      renderAll();
    }

    function addDay(type) {
      const job = activeJob();
      if (!job) return;
      const day = blankDay(type);
      if (job.days.length) {
        day.date = nextDate(job.days[job.days.length - 1].date || todayISO());
      }
      job.days.push(day);
      saveState();
      renderAll();
    }

    function nextDate(iso) {
      const d = new Date(iso + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    function updateJobField(key, value) {
      const job = activeJob();
      if (!job) return;
      job[key] = value;
      saveState();
      renderHeader();
      renderJobs();
      renderSummary();
      renderPrint();
    }

    function updateSetting(key, value) {
      const job = activeJob();
      if (!job) return;
      job.settings[key] = value;
      saveState();
      renderDays();
      renderSummary();
      renderPrint();
    }

    function updateDay(dayId, key, value, options = {}) {
      const job = activeJob();
      if (!job) return;
      const day = job.days.find(d => d.id === dayId);
      if (!day) return;
      day[key] = value;
      saveState();
      if (options.rerenderDays) renderDays();
      else updateDayMetrics(dayId);
      renderSummary();
      renderPrint();
    }

    function updateDayMetrics(dayId) {
      const job = activeJob();
      if (!job) return;
      const day = job.days.find(d => d.id === dayId);
      if (!day) return;
      const card = document.querySelector(`.day-card [data-day-id="${dayId}"]`)?.closest('.day-card');
      if (!card) return;
      const calc = calculateDay(job, day);
      const totalNode = card.querySelector('[data-metric="total"]');
      const stdNode = card.querySelector('[data-metric="standard"]');
      const halfNode = card.querySelector('[data-metric="half"]');
      const otherNode = card.querySelector('[data-metric="other"]');
      const expenseNode = card.querySelector('[data-metric="expenses"]');
      if (totalNode) totalNode.textContent = hrs(calc.totalHours);
      if (stdNode) stdNode.textContent = hrs(calc.standardHours);
      if (halfNode) halfNode.textContent = hrs(calc.halfHours);
      if (otherNode) otherNode.textContent = hrs(calc.doubleHours + calc.officeHours);
      if (expenseNode) expenseNode.textContent = money(calc.expenseValue);
    }

    function switchDayType(dayId, type) {
      const job = activeJob();
      if (!job) return;
      const idx = job.days.findIndex(d => d.id === dayId);
      if (idx < 0) return;
      const old = job.days[idx];
      const replacement = blankDay(type);
      replacement.id = old.id;
      replacement.date = old.date;
      replacement.cCharge = old.cCharge;
      replacement.ulez = type === "office" ? false : old.ulez;
      replacement.nightShoot = type === "production" ? !!old.nightShoot : false;
      replacement.restDayCharge = type === "production" ? !!old.restDayCharge : false;
      replacement.notes = old.notes;
      replacement.tasksDone = old.tasksDone || "";
      replacement.expenseAmount = old.expenseAmount || "";
      replacement.expenseNotes = old.expenseNotes || "";
      job.days[idx] = replacement;
      saveState();
      renderDays();
      renderSummary();
      renderPrint();
    }

    function moveDay(dayId, dir) {
      const job = activeJob();
      if (!job) return;
      const idx = job.days.findIndex(d => d.id === dayId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= job.days.length) return;
      [job.days[idx], job.days[target]] = [job.days[target], job.days[idx]];
      saveState();
      renderDays();
      renderSummary();
      renderPrint();
    }

    async function deleteDay(dayId) {
      const job = activeJob();
      if (!job) return;
      const day = job.days.find(d => d.id === dayId);
      if (!day) return;
      const confirmed = await showModal("Delete Day Entry", `Delete "${day.title}"?`);
      if (!confirmed) return;
      job.days = job.days.filter(d => d.id !== dayId);
      saveState();
      renderAll();
    }

    function duplicateDay(dayId) {
      const job = activeJob();
      if (!job) return;
      const dayIndex = job.days.findIndex(d => d.id === dayId);
      if (dayIndex < 0) return;
      const original = job.days[dayIndex];
      const copy = { ...clone(original), id: uid() };
      if (copy.date) {
        copy.date = nextDate(copy.date);
      }
      job.days.splice(dayIndex + 1, 0, copy);
      saveState();
      renderAll();
      showToast("Day duplicated");
    }

    function dayTypeLabel(type) {
      return {
        production: "Production Day",
        collection: "Collection Day",
        return: "Return Day",
        office: "Office Day"
      }[type] || "Day";
    }

    function formatDatePretty(iso) {
      if (!iso) return "";
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short"
      });
    }

    function formatDateLong(iso) {
      if (!iso) return "";
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "2-digit"
      });
    }

    function formatDay(iso) {
      if (!iso) return "";
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("en-GB", { weekday: "long" });
    }

    function isSunday(iso) {
      return new Date(iso + "T00:00:00").getDay() === 0;
    }

    function timeDiffHours(start, end) {
      if (!start || !end) return 0;
      const [sh, sm] = String(start).split(":").map(Number);
      const [eh, em] = String(end).split(":").map(Number);
      if ([sh, sm, eh, em].some(v => Number.isNaN(v))) return 0;
      let s = sh * 60 + sm;
      let e = eh * 60 + em;
      if (e < s) e += 24 * 60;
      return Math.max(0, (e - s) / 60);
    }

    function getDayChargeWindow(job, day) {
      if (day.type === "office") {
        return {
          start: day.startTime,
          end: day.finishTime || day.returnTime || ""
        };
      }

      if (day.type === "production" && day.nightShoot) {
        return {
          start: day.startTime,
          end: day.returnTime
        };
      }

      if (job.settings.calcMode === "call_to_wrap") {
        return {
          start: day.callTime,
          end: day.wrapTime
        };
      }

      return {
        start: day.startTime,
        end: day.returnTime
      };
    }

    function afterEightPmHours(start, end) {
      if (!start || !end) return 0;
      const [sh, sm] = String(start).split(":").map(Number);
      const [eh, em] = String(end).split(":").map(Number);
      if ([sh, sm, eh, em].some(v => Number.isNaN(v))) return 0;

      let s = sh * 60 + sm;
      let e = eh * 60 + em;
      if (e < s) e += 24 * 60;

      const eightPm = 20 * 60;
      const overlap = Math.max(0, e - Math.max(s, eightPm));
      return overlap / 60;
    }

    function calculateDay(job, day) {
      const chargeWindow = getDayChargeWindow(job, day);
      const expenseValue = Number(day.expenseAmount || 0);
      const restDayChargeHours = (day.type === "production" && day.restDayCharge) ? 8 : 0;
      let actualHours = 0;

      if (day.type === "office") {
        if ((chargeWindow.start || "") && (chargeWindow.end || "")) {
          actualHours = timeDiffHours(chargeWindow.start, chargeWindow.end);
        } else {
          actualHours = Number(day.officeHours || 0);
        }
      } else {
        actualHours = timeDiffHours(chargeWindow.start, chargeWindow.end);
      }

      let baseHours = actualHours;

      if (day.type === "collection" && day.minCharge4h) {
        baseHours = Math.max(baseHours, 4);
      }
      if (day.type === "production" && day.minCharge8h) {
        baseHours = Math.max(baseHours, 8);
      }

      let standardHours = 0;
      let halfHours = 0;
      let doubleHours = 0;
      let officeHours = 0;
      let labourValue = 0;

      if (day.type === "office") {
        officeHours = baseHours;
      } else if (day.type === "production" && day.nightShoot) {
        doubleHours = baseHours;
      } else if (job.settings.sundayDouble && isSunday(day.date)) {
        doubleHours = baseHours;
      } else if (day.type === "production" && day.minCharge8h && actualHours < 8) {
        standardHours = 8;
      } else {
        const s = Number(job.settings.standardThreshold || 8);
        const h = Number(job.settings.halfThreshold || 16);
        const halfBlockCap = Math.max(h - s, 0);

        let standardCap = s;

        if (chargeWindow.start && chargeWindow.end) {
          const [sh, sm] = String(chargeWindow.start).split(":").map(Number);
          const [eh, em] = String(chargeWindow.end).split(":").map(Number);

          if (![sh, sm, eh, em].some(v => Number.isNaN(v))) {
            let startMinutes = sh * 60 + sm;
            let endMinutes = eh * 60 + em;

            if (endMinutes < startMinutes) {
              endMinutes += 24 * 60;
            }

            const eightPm = 20 * 60;
            const preEightPmHours = Math.max(0, Math.min(endMinutes, eightPm) - startMinutes) / 60;
            standardCap = Math.min(s, preEightPmHours);
          }
        }

        standardHours = Math.min(baseHours, standardCap);
        const remainingAfterStandard = Math.max(baseHours - standardHours, 0);
        halfHours = Math.min(remainingAfterStandard, halfBlockCap);
        doubleHours = Math.max(remainingAfterStandard - halfBlockCap, 0);
      }

      if (restDayChargeHours) {
        standardHours += restDayChargeHours;
      }

      labourValue =
        standardHours * Number(job.settings.standardRate || 0) +
        halfHours * Number(job.settings.halfRate || 0) +
        doubleHours * Number(job.settings.doubleRate || 0) +
        officeHours * Number(job.settings.officeRate || 0);

      return {
        actualHours,
        baseHours,
        restDayChargeHours,
        totalHours: baseHours + restDayChargeHours,
        standardHours,
        halfHours,
        doubleHours,
        officeHours,
        labourValue,
        expenseValue,
        value: labourValue + expenseValue
      };
    }

    function jobMileage(job) {
      const start = Number(job.jobMileageStart || 0);
      const end = Number(job.jobMileageEnd || 0);
      return Math.max(0, (Number.isFinite(end - start) ? end - start : 0));
    }

    function money(n) {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP"
      }).format(Number(n || 0));
    }

    function hrs(n) {
      const totalMinutes = Math.round(Number(n || 0) * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.abs(totalMinutes % 60);
      return `${hours}.${String(minutes).padStart(2, "0")}`;
    }

    function esc(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function toggleCard(el) {
      console.log("toggleCard clicked", event.target, event.target.className);
      if (event.target.closest(".toolbar")) return;
      el.classList.toggle("collapsed");
      console.log("toggled", el.classList.contains("collapsed"));
    }

    function bindDayCardClick(e) {
      const card = e.target.closest(".day-card");
      if (!card) return;
      if (e.target.closest(".toolbar")) return;
      e.preventDefault();
      card.classList.toggle("collapsed");
    }

    function renderJobs() {
      refs.jobsCount.textContent = `${state.jobs.length} job${state.jobs.length === 1 ? "" : "s"}`;
      refs.jobsList.innerHTML = state.jobs.map(job => {
        const active = job.id === state.activeJobId ? " active" : "";
        return `
          <div class="job${active}">
            <div class="job-head">
              <div>
                <div class="job-title">${esc(job.title || "Untitled Job")}</div>
                <div class="job-meta">
                  ${esc(job.productionCompany || "No production company")}<br>
                  ${job.days.length} day${job.days.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div class="job-actions">
              <button class="small" data-action="select-job" data-id="${job.id}">Open</button>
              <button class="small" data-action="export-job-json" data-id="${job.id}">Export Job</button>
              <button class="small danger" data-action="remove-job" data-id="${job.id}">Remove</button>
            </div>
          </div>
        `;
      }).join("");
    }

    function renderHeader() {
      const job = activeJob();
      if (!job) return;
      refs.currentJobTitle.textContent = job.title || "Untitled Job";
      refs.currentJobMeta.textContent = `${job.productionCompany || "No production company"} • ${job.days.length} day${job.days.length === 1 ? "" : "s"} • Invoice ${job.invoiceNumber || "not set"}`;

      refs.jobTitle.value = job.title || "";
      refs.invoiceDate.value = job.invoiceDate || "";
      refs.invoiceNumber.value = job.invoiceNumber || "";
      refs.productionCompany.value = job.productionCompany || "";
      refs.vehicleName.value = job.vehicleName || "";
      refs.jobMileageStart.value = job.jobMileageStart || "";
      refs.jobMileageEnd.value = job.jobMileageEnd || "";
      refs.jobMileageTotal.value = jobMileage(job).toFixed(1);
      refs.toName.value = job.toName || "";
      refs.toAddress.value = job.toAddress || "";
      refs.yourName.value = job.yourName || "";
      refs.yourAddress.value = job.yourAddress || "";
      refs.yourSortCode.value = job.yourSortCode || "";
      refs.yourBankAccount.value = job.yourBankAccount || "";
      refs.clientRef.value = job.clientRef || "";
      refs.generalNotes.value = job.generalNotes || "";

      refs.rateStandard.value = job.settings.standardRate;
      refs.rateHalf.value = job.settings.halfRate;
      refs.rateDouble.value = job.settings.doubleRate;
      refs.rateOffice.value = job.settings.officeRate;
      refs.thresholdStandard.value = job.settings.standardThreshold;
      refs.thresholdHalf.value = job.settings.halfThreshold;
      refs.calcMode.value = job.settings.calcMode;
      refs.sundayDouble.value = String(job.settings.sundayDouble);
      if (refs.vatRate) refs.vatRate.value = job.settings.vatRate || "";
    }

    function dayField(label, html, span = "span-3") {
      return `<div class="field ${span}"><label>${label}</label>${html}</div>`;
    }

    function checkField(label, dayId, key, checked, span = "span-3") {
      return `<div class="field ${span}"><label class="check-inline"><input type="checkbox" data-day-field="${dayId}" data-key="${key}" ${checked ? "checked" : ""} /> <span>${label}</span></label></div>`;
    }

    function expenseFieldBlock(day) {
      return `
        ${dayField("Expenses (£)", `<input type="number" min="0" step="0.01" data-day-field="${day.id}" data-key="expenseAmount" value="${esc(day.expenseAmount || "")}" placeholder="0.00" />`)}
        ${dayField("Expense Details", `<input type="text" data-day-field="${day.id}" data-key="expenseNotes" value="${esc(day.expenseNotes || "")}" placeholder="Parking, fuel, congestion charge..." />`, "span-6")}
      `;
    }

    function renderDays() {
      const job = activeJob();
      if (!job) return;

      if (!job.days.length) {
        refs.daysList.innerHTML = `<div class="empty">No day entries yet. Add a day to begin.</div>`;
        return;
      }

      refs.daysList.innerHTML = job.days.map(day => {
        const calc = calculateDay(job, day);
        const typeOptions = [
          ["production", "Production Day"],
          ["collection", "Collection Day"],
          ["return", "Return Day"],
          ["office", "Office Day"]
        ].map(([v, t]) => `<option value="${v}" ${day.type === v ? "selected" : ""}>${t}</option>`).join("");

        let fields = `
          ${dayField("Date", `<input type="date" data-day-field="${day.id}" data-key="date" value="${esc(day.date)}" />`)}
          ${dayField("Day Type", `<select data-action="switch-day-type" data-id="${day.id}">${typeOptions}</select>`)}
        `;

        if (day.type === "office") {
          fields += `
            ${dayField("Start Time", `<input type="time" data-day-field="${day.id}" data-key="startTime" value="${esc(day.startTime)}" />`)}
            ${dayField("Finish Time", `<input type="time" data-day-field="${day.id}" data-key="finishTime" value="${esc(day.finishTime || day.returnTime || "")}" />`)}
            ${dayField("C/C", `
              <select data-day-field="${day.id}" data-key="cCharge">
                <option value="false" ${!day.cCharge ? "selected" : ""}>No</option>
                <option value="true" ${day.cCharge ? "selected" : ""}>Yes</option>
              </select>
            `)}
            
            ${dayField("Tasks Done", `<input type="text" data-day-field="${day.id}" data-key="tasksDone" value="${esc(day.tasksDone || day.notes || "")}" placeholder="Optional" />`, "span-6")}
            ${expenseFieldBlock(day)}
          `;
        } else if (day.type === "production") {
          fields += `
            ${dayField("Start", `<input type="time" data-day-field="${day.id}" data-key="startTime" value="${esc(day.startTime)}" />`)}
            ${dayField("Arrive", `<input type="time" data-day-field="${day.id}" data-key="arriveTime" value="${esc(day.arriveTime)}" />`)}
            ${dayField("Arrive Postcode", `<input type="text" data-day-field="${day.id}" data-key="arrivePostcode" value="${esc(day.arrivePostcode || "")}" placeholder="SW1A 1AA" />`)}
            ${dayField("Call", `<input type="time" data-day-field="${day.id}" data-key="callTime" value="${esc(day.callTime)}" />`)}
            ${dayField("Wrap", `<input type="time" data-day-field="${day.id}" data-key="wrapTime" value="${esc(day.wrapTime)}" />`)}
            ${dayField("Wrap Postcode", `<input type="text" data-day-field="${day.id}" data-key="wrapPostcode" value="${esc(day.wrapPostcode || "")}" placeholder="N1 9GU" />`)}
            ${dayField("Leave", `<input type="time" data-day-field="${day.id}" data-key="leaveTime" value="${esc(day.leaveTime)}" />`)}
            ${dayField("RTB", `<input type="time" data-day-field="${day.id}" data-key="returnTime" value="${esc(day.returnTime)}" />`)}
            ${checkField("Minimum 8 hour charge", day.id, "minCharge8h", day.minCharge8h)}
            ${checkField("Night Shoot (all double time)", day.id, "nightShoot", day.nightShoot)}
            ${checkField("Rest day charge (+8h standard)", day.id, "restDayCharge", day.restDayCharge)}
            
            ${dayField("ULEZ", `
              <select data-day-field="${day.id}" data-key="ulez">
                <option value="false" ${!day.ulez ? "selected" : ""}>No</option>
                <option value="true" ${day.ulez ? "selected" : ""}>Yes</option>
              </select>
            `)}
            ${dayField("C/C", `
              <select data-day-field="${day.id}" data-key="cCharge">
                <option value="false" ${!day.cCharge ? "selected" : ""}>No</option>
                <option value="true" ${day.cCharge ? "selected" : ""}>Yes</option>
              </select>
            `)}
            ${dayField("Notes", `<input type="text" data-day-field="${day.id}" data-key="notes" value="${esc(day.notes)}" placeholder="Via ArriMedia Collections" />`, "span-6")}
            ${expenseFieldBlock(day)}
          `;
        } else {
          fields += `
            ${dayField("Start", `<input type="time" data-day-field="${day.id}" data-key="startTime" value="${esc(day.startTime)}" />`)}
            ${dayField("RTB", `<input type="time" data-day-field="${day.id}" data-key="returnTime" value="${esc(day.returnTime)}" />`)}
            ${day.type === "collection" ? dayField("Minimum 4 hour charge", `
              <select data-day-field="${day.id}" data-key="minCharge4h">
                <option value="false" ${!day.minCharge4h ? "selected" : ""}>Off</option>
                <option value="true" ${day.minCharge4h ? "selected" : ""}>On</option>
              </select>
            `) : ""}
            
            ${dayField("ULEZ", `
              <select data-day-field="${day.id}" data-key="ulez">
                <option value="false" ${!day.ulez ? "selected" : ""}>No</option>
                <option value="true" ${day.ulez ? "selected" : ""}>Yes</option>
              </select>
            `)}
            ${dayField("C/C", `
              <select data-day-field="${day.id}" data-key="cCharge">
                <option value="false" ${!day.cCharge ? "selected" : ""}>No</option>
                <option value="true" ${day.cCharge ? "selected" : ""}>Yes</option>
              </select>
            `)}
            ${dayField("Notes", `<input type="text" data-day-field="${day.id}" data-key="notes" value="${esc(day.notes)}" placeholder="Optional" />`, "span-6")}
            ${expenseFieldBlock(day)}
          `;
        }

        return `
          <div class="day-card" data-id="${day.id}">
            <div class="day-head">
              <div class="day-head-left">
                <strong>${esc(formatDateLong(day.date) || "Day")}</strong>
                <span class="day-badge">${esc(dayTypeLabel(day.type))}</span>
                <span class="muted">${esc(formatDay(day.date))}</span>
                <span class="collapse-icon">▼</span>
              </div>
              <div class="toolbar">
                <button class="small" data-action="toggle-day-collapse" data-id="${day.id}">▼</button>
                <button class="small" data-action="duplicate-day" data-id="${day.id}">Copy</button>
                <button class="small" data-action="move-day-up" data-id="${day.id}">↑</button>
                <button class="small" data-action="move-day-down" data-id="${day.id}">↓</button>
                <button class="small danger" data-action="delete-day" data-id="${day.id}">Delete</button>
              </div>
            </div>
            <div class="day-body">
              <span class="hidden" data-day-id="${day.id}"></span>
              <div class="field-grid">${fields}</div>
              <div class="summary-mini">
                <div class="metric"><div class="label">Total Hours</div><div class="value" data-metric="total">${hrs(calc.totalHours)}</div></div>
                <div class="metric"><div class="label">Standard</div><div class="value" data-metric="standard">${hrs(calc.standardHours)}</div></div>
                <div class="metric"><div class="label">Time + Half</div><div class="value" data-metric="half">${hrs(calc.halfHours)}</div></div>
                <div class="metric"><div class="label">Double / Office</div><div class="value" data-metric="other">${hrs(calc.doubleHours + calc.officeHours)}</div></div>
                <div class="metric"><div class="label">Expenses</div><div class="value" data-metric="expenses">${money(calc.expenseValue)}</div></div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    function renderSummary() {
      const job = activeJob();
      if (!job) return;

      let totalHours = 0;
      let standard = 0;
      let half = 0;
      let double = 0;
      let office = 0;
      let expenses = 0;
      let value = 0;

      const mileage = jobMileage(job);

      refs.summaryBody.innerHTML = job.days.map(day => {
        const calc = calculateDay(job, day);
        totalHours += calc.totalHours;
        standard += calc.standardHours;
        half += calc.halfHours;
        double += calc.doubleHours;
        office += calc.officeHours;
        expenses += calc.expenseValue;
        value += calc.value;

        return `
          <tr>
            <td>${esc(formatDatePretty(day.date))}</td>
            <td>${esc(dayTypeLabel(day.type))}</td>
            <td class="print-numeric">${hrs(calc.totalHours)}</td>
            <td class="print-numeric">${hrs(calc.standardHours)}</td>
            <td class="print-numeric">${hrs(calc.halfHours)}</td>
            <td class="print-numeric">${hrs(calc.doubleHours)}</td>
            <td class="print-numeric">${hrs(calc.officeHours)}</td>
            <td class="print-center">${day.cCharge ? "Yes" : "No"}</td>
            <td class="print-center">${day.type === "office" ? "" : (day.ulez ? "Yes" : "No")}</td>
            <td>${esc(day.type === "office" ? (day.tasksDone || day.notes || "") : (day.notes || ""))}${day.type === "production" && (day.arrivePostcode || day.wrapPostcode) ? ` • Arrive PC: ${esc(day.arrivePostcode || "-")} • Wrap PC: ${esc(day.wrapPostcode || "-")}` : ''}${day.type === "collection" && day.minCharge4h ? ' • Min 4h' : ''}${day.type === "production" && day.minCharge8h ? ' • Min 8h' : ''}${day.type === "production" && day.nightShoot ? ' • Night Shoot' : ''}${day.restDayCharge ? ' • Rest day charge (+8h standard)' : ''}${day.expenseNotes ? ` • Expense: ${esc(day.expenseNotes)}` : ''}</td>
            <td>${money(calc.expenseValue)}</td>
            <td>${money(calc.value)}</td>
          </tr>
        `;
      }).join("");

      const subtotal = expenses + value;
      const vatRate = job.settings.vatRate || 0;
      const vatAmount = subtotal * (vatRate / 100);
      const grandTotal = subtotal + vatAmount;

      refs.sumDays.textContent = String(job.days.length);
      refs.sumHours.textContent = hrs(totalHours);
      refs.sumMileage.textContent = mileage.toFixed(1);
      refs.sumStd.textContent = hrs(standard);
      refs.sumHalf.textContent = hrs(half);
      refs.sumDouble.textContent = hrs(double);
      refs.sumOffice.textContent = hrs(office);
      refs.sumExpenses.textContent = money(expenses);
      refs.sumSubtotal.textContent = money(subtotal);
      refs.vatPercent.textContent = vatRate;
      refs.sumVat.textContent = money(vatAmount);
      refs.sumValue.textContent = money(grandTotal);
    }

    function renderTabs() {
      refs.tabTimings.classList.toggle("hidden", state.tab !== "timings");
      refs.tabSummary.classList.toggle("hidden", state.tab !== "summary");
      refs.tabSettings.classList.toggle("hidden", state.tab !== "settings");
      document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === state.tab);
      });
    }

    async function exportPDF() {
      const job = activeJob();
      if (!job) return;
      if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
        alert("PDF export is unavailable because the PDF libraries failed to load.");
        return;
      }

      renderPrint();

      const printRoot = refs.printRoot || document.getElementById("printRoot");
      const pages = Array.from(printRoot.querySelectorAll(".print-page"));
      if (!pages.length) return;

      const previous = {
        display: printRoot.style.display,
        position: printRoot.style.position,
        left: printRoot.style.left,
        top: printRoot.style.top,
        width: printRoot.style.width,
        zIndex: printRoot.style.zIndex,
      };

      document.body.classList.add("pdf-export-mode");
      printRoot.style.display = "block";
      printRoot.style.position = "absolute";
      printRoot.style.left = "-99999px";
      printRoot.style.top = "0";
      printRoot.style.width = "277mm";
      printRoot.style.zIndex = "-1";

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();

      try {
        for (let i = 0; i < pages.length; i++) {
          const canvas = await window.html2canvas(pages[i], {
            scale: Math.max(2, window.devicePixelRatio || 1),
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
          });

          if (!canvas.width || !canvas.height) continue;

          const imgData = canvas.toDataURL("image/png");
          const imgWidth = pdfWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          if (i > 0) doc.addPage("a4", "landscape");
          doc.addImage(imgData, "PNG", 0, 0, imgWidth, Math.min(imgHeight, pdfHeight), undefined, "FAST");
        }

        const title = (job.title || "").trim() || "Job";
        const prodCo = (job.productionCompany || "").trim() || "Production";
        const filename = `${title} - ${prodCo}.pdf`.replace(/[<>:"/\|?*]/g, "_");
        doc.save(filename);
      } finally {
        document.body.classList.remove("pdf-export-mode");
        printRoot.style.display = previous.display;
        printRoot.style.position = previous.position;
        printRoot.style.left = previous.left;
        printRoot.style.top = previous.top;
        printRoot.style.width = previous.width;
        printRoot.style.zIndex = previous.zIndex;
      }
    }

    function renderPrint() {
      const job = activeJob();
      if (!job) {
        refs.printRoot.innerHTML = "";
        return;
      }

      const title = (job.title || "").trim() || "Job";
      const prodCo = (job.productionCompany || "").trim() || "Production";
      document.title = `${title} - ${prodCo}`;

      const entries = job.days.map(day => ({ day, calc: calculateDay(job, day) }));

      const escText = value => esc(value || "");
      const noteTextForDay = day => day.type === "office" ? (day.tasksDone || day.notes || "") : (day.notes || "");

      function chunkEntries(items, estimateUnits, firstMaxUnits, nextMaxUnits) {
        const chunks = [];
        let current = [];
        let limit = firstMaxUnits;
        let used = 0;

        items.forEach(item => {
          const units = Math.max(1, estimateUnits(item));
          if (current.length && used + units > limit) {
            chunks.push(current);
            current = [];
            used = 0;
            limit = nextMaxUnits;
          }
          current.push(item);
          used += units;
        });

        if (current.length || !chunks.length) chunks.push(current);
        return chunks;
      }

      function estimateTimesheetUnits(entry) {
        const { day, calc } = entry;
        let units = 1;
        const notes = noteTextForDay(day);
        if (notes.length > 90) units += 1;
        if (notes.length > 180) units += 1;
        if (day.type === "production" && (day.arrivePostcode || day.wrapPostcode)) units += 1;
        if (day.type === "collection" && day.minCharge4h) units += 1;
        if (day.type === "production" && day.minCharge8h) units += 1;
        if (day.type === "production" && day.nightShoot) units += 1;
        if (day.restDayCharge) units += 1;
        if (calc.expenseValue && day.expenseNotes) units += 1;
        return units;
      }

      function estimateMoneyUnits(entry) {
        const { day } = entry;
        let units = 1;
        const notes = noteTextForDay(day);
        if (notes.length > 110) units += 1;
        if (day.expenseNotes) units += 1;
        if (day.type === "production" && (day.arrivePostcode || day.wrapPostcode)) units += 1;
        return units;
      }

      const timesheetChunks = chunkEntries(entries, estimateTimesheetUnits, 10, 12);

      let totalHours = 0;
      let standardHours = 0;
      let halfHours = 0;
      let doubleHours = 0;
      let officeHours = 0;
      let expenseTotal = 0;
      let labourTotal = 0;
      let totalValue = 0;

      entries.forEach(({ calc }) => {
        totalHours += calc.totalHours;
        standardHours += calc.standardHours;
        halfHours += calc.halfHours;
        doubleHours += calc.doubleHours;
        officeHours += calc.officeHours;
        expenseTotal += calc.expenseValue;
        labourTotal += calc.labourValue;
        totalValue += calc.value;
      });

      function renderTimesheetRows(chunk) {
        if (!chunk.length) {
          return `
            <tr>
              <td colspan="11">No shoot days added yet.</td>
            </tr>
          `;
        }

        return chunk.map(({ day, calc }) => `
          <tr>
            <td>${esc(formatDatePretty(day.date))}</td>
            <td>${esc(day.startTime || "")}</td>
            <td>${day.type === "office" ? "" : esc(day.arriveTime || "")}${day.type === "production" && day.arrivePostcode ? `<br><small>${esc(day.arrivePostcode)}</small>` : ""}</td>
            <td>${day.type === "office" ? "" : esc(day.callTime || "")}</td>
            <td>${day.type === "office" ? "" : esc(day.wrapTime || "")}${day.type === "production" && day.wrapPostcode ? `<br><small>${esc(day.wrapPostcode)}</small>` : ""}</td>
            <td>${day.type === "office" ? "" : esc(day.leaveTime || "")}</td>
            <td>${esc(day.type === "office" ? (day.finishTime || day.returnTime || "") : (day.returnTime || ""))}</td>
            <td>${day.type === "office" ? "" : (day.ulez ? "Yes" : "No")}</td>
            <td>${day.cCharge ? "Yes" : "No"}</td>
            <td>${esc(noteTextForDay(day))}${day.type === "collection" && day.minCharge4h ? '<br><small>Min 4h applied</small>' : ''}${day.type === "production" && day.minCharge8h ? '<br><small>Min 8h applied</small>' : ''}${day.type === "production" && day.nightShoot ? '<br><small>Night Shoot, all hours at double time</small>' : ''}${day.restDayCharge ? '<br><small>+ Rest day charge (8h standard)</small>' : ''}${calc.expenseValue ? `<br><small>Expenses: ${money(calc.expenseValue)}${day.expenseNotes ? `, ${esc(day.expenseNotes)}` : ''}</small>` : ''}</td>
            <td class="print-numeric">${hrs(calc.totalHours)}</td>
          </tr>
        `).join("");
      }

      const shouldShowPage2 = entries.length > 0 || job.productionCompany || job.title || job.toName || job.yourName;
      const moneyChunks = shouldShowPage2 ? chunkEntries(entries, estimateMoneyUnits, 9, 12) : [];
      if (shouldShowPage2 && !moneyChunks.length) moneyChunks.push([]);

      function renderMoneyRows(chunk) {
        if (!chunk.length) {
          return `
            <tr>
              <td colspan="7">No billable days added yet.</td>
            </tr>
          `;
        }

        return chunk.map(({ day, calc }) => `
          <tr>
            <td>${esc(formatDatePretty(day.date))}</td>
            <td class="print-numeric">${hrs(calc.standardHours)}</td>
            <td class="print-numeric">${hrs(calc.halfHours)}</td>
            <td class="print-numeric">${hrs(calc.doubleHours)}</td>
            <td class="print-numeric">${hrs(calc.officeHours)}</td>
            <td class="expense-cell">${money(calc.expenseValue)}${day.expenseNotes ? `<br><small>${esc(day.expenseNotes)}</small>` : ''}</td>
            <td class="print-notes notes-cell">${esc(noteTextForDay(day))}${day.type === "production" && (day.arrivePostcode || day.wrapPostcode) ? ` • Arrive PC: ${esc(day.arrivePostcode || "-")} • Wrap PC: ${esc(day.wrapPostcode || "-")}` : ''}${day.type === "collection" && day.minCharge4h ? ' • Min 4h' : ''}${day.type === "production" && day.minCharge8h ? ' • Min 8h' : ''}${day.type === "production" && day.nightShoot ? ' • Night Shoot' : ''}${day.restDayCharge ? ' • + Rest day charge' : ''}</td>
          </tr>
        `).join("");
      }

      const pageSections = [];
      let pageNumber = 1;

      timesheetChunks.forEach((chunk, chunkIndex) => {
        pageSections.push(`
          <section class="print-page page-1">
            <div class="print-grid-top">
              <div class="print-block">
                <p><span class="print-label">Invoice Date:</span> <span class="print-value">${esc(formatDateLong(job.invoiceDate))}</span></p>
                <p><span class="print-label">Production Co:</span> <span class="print-value print-bold">${esc(job.productionCompany || "")}</span></p>
                <p><span class="print-label">Job Title:</span> <span class="print-value print-bold">${esc(job.title || "")}</span></p>
              </div>
              <div class="print-block">
                <p><span class="print-value">${esc(job.vehicleName || "")}</span></p>
                <p><span class="print-label">Start Mileage:</span> <span class="print-value">${esc(job.jobMileageStart || "")}</span></p>
                <p><span class="print-label">End Mileage:</span> <span class="print-value">${esc(job.jobMileageEnd || "")}</span></p>
                <p><span class="print-label">Total Mileage:</span> <span class="print-value print-bold">${jobMileage(job).toFixed(1)}</span></p>
              </div>
              <div class="print-page-num">Page ${pageNumber}</div>
            </div>

            ${chunkIndex > 0 ? `<div class="print-continued">Timesheet continued</div>` : ""}

            <table class="print-table timesheet">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>Arrive</th>
                  <th>Call</th>
                  <th>Wrap</th>
                  <th>Leave</th>
                  <th>RTB / Finish</th>
                  <th>ULEZ</th>
                  <th>C/C</th>
                  <th>Notes</th>
                  <th>Total Hours</th>
                </tr>
              </thead>
              <tbody>
                ${renderTimesheetRows(chunk)}
              </tbody>
            </table>
          </section>
        `);
        pageNumber += 1;
      });

      if (shouldShowPage2) {
        moneyChunks.forEach((chunk, chunkIndex) => {
          const isLastMoneyPage = chunkIndex === moneyChunks.length - 1;
          pageSections.push(`
            <section class="print-page page-2 compact">
              <div class="print-grid-page2-top">
                <div class="print-page2-box">
                  <div class="print-page2-title">TO:</div>
                  <p class="print-page2-name">${esc(job.toName || "")}</p>
                  ${escText(job.toAddress).replace(/\n/g, "<br>")}
                  <div class="gap"></div>
                  <p><span class="print-label">Prod. Co:</span> <span class="print-value print-bold">${esc(job.productionCompany || "")}</span></p>
                  <p><span class="print-label">Job:</span> <span class="print-value print-bold">${esc(job.title || "")}</span></p>
                  <div class="gap"></div>
                  <p><span class="print-value">Payable To ${esc(job.yourName || "Your Name")}</span></p>
                </div>

                <div class="print-page2-box">
                  <div class="print-page2-title">FROM:</div>
                  <p class="print-page2-name">${esc(job.yourName || "")}</p>
                  ${escText(job.yourAddress).replace(/\n/g, "<br>")}
                  <div class="gap"></div>
                  <div class="print-bank-row"><span class="print-label">Sort Code</span><span class="print-value">${esc(job.yourSortCode || "")}</span></div>
                  <div class="print-bank-row"><span class="print-label">Account</span><span class="print-value">${esc(job.yourBankAccount || "")}</span></div>
                </div>

                <div class="print-page-num">Page ${pageNumber}</div>
              </div>

              ${chunkIndex > 0 ? `<div class="print-continued">Breakdown continued</div>` : ""}

              <table class="print-money-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Time + Half</th>
                    <th>Double Time</th>
                    <th>Office</th>
                    <th>Expenses</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderMoneyRows(chunk)}
                </tbody>
              </table>

              ${isLastMoneyPage ? `
              <div class="print-totals">
                <div class="print-totals-left">
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Standard hours</div>
                    <div class="print-breakdown-value print-faint">${hrs(standardHours)}</div>
                    <div class="print-breakdown-value print-faint">${money(standardHours * Number(job.settings.standardRate || 0))}</div>
                  </div>
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Time + half</div>
                    <div class="print-breakdown-value print-faint">${hrs(halfHours)}</div>
                    <div class="print-breakdown-value print-faint">${money(halfHours * Number(job.settings.halfRate || 0))}</div>
                  </div>
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Double time</div>
                    <div class="print-breakdown-value print-faint">${hrs(doubleHours)}</div>
                    <div class="print-breakdown-value print-faint">${money(doubleHours * Number(job.settings.doubleRate || 0))}</div>
                  </div>
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Office</div>
                    <div class="print-breakdown-value print-faint">${hrs(officeHours)}</div>
                    <div class="print-breakdown-value print-faint">${money(officeHours * Number(job.settings.officeRate || 0))}</div>
                  </div>
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Expenses</div>
                    <div class="print-breakdown-value print-faint">${money(expenseTotal)}</div>
                  </div>
                  <div class="print-breakdown-cell">
                    <div class="print-breakdown-label">Total hours</div>
                    <div class="print-breakdown-value print-faint">${hrs(totalHours)}</div>
                  </div>
                </div>

                <div class="print-totals-right">
                  <div class="print-total-row">
                    <span>Invoice total</span>
                    <span>${money(labourTotal)}</span>
                  </div>
                  <div class="print-total-row">
                    <span>Expenses</span>
                    <span>${money(expenseTotal)}</span>
                  </div>
                  <div class="print-total-row print-grand-total">
                    <span class="print-bold">Total incl. expenses</span>
                    <span class="print-bold">${money(totalValue)}</span>
                  </div>
                </div>
              </div>
              ` : ""}
            </section>
          `);
          pageNumber += 1;
        });
      }

      refs.printRoot.innerHTML = pageSections.join("");
    }

    function renderAll() {
      ensureAtLeastOneJob();
      renderJobs();
      renderHeader();
      renderDays();
      renderSummary();
      renderTabs();
      renderPrint();
      updateMobileUI();
    }

    function updateMobileUI() {
      const job = activeJob();
      if (refs.mobileJobTitle) {
        refs.mobileJobTitle.textContent = job ? (job.title || "Untitled Job") : "No job";
      }
    }

    function bindTopInputs() {
      const jobBindings = [
        ["jobTitle", "title"],
        ["invoiceDate", "invoiceDate"],
        ["invoiceNumber", "invoiceNumber"],
        ["productionCompany", "productionCompany"],
        ["vehicleName", "vehicleName"],
        ["jobMileageStart", "jobMileageStart"],
        ["jobMileageEnd", "jobMileageEnd"],
        ["toName", "toName"],
        ["toAddress", "toAddress"],
        ["yourName", "yourName"],
        ["yourAddress", "yourAddress"],
        ["yourSortCode", "yourSortCode"],
        ["yourBankAccount", "yourBankAccount"],
        ["clientRef", "clientRef"],
        ["generalNotes", "generalNotes"]
      ];

      jobBindings.forEach(([id, key]) => {
        const node = refs[id];
        const handler = e => updateJobField(key, e.target.value);
        node.addEventListener("input", handler);
        node.addEventListener("change", handler);
      });

      if (refs.vatRate) refs.vatRate.addEventListener("input", e => updateSetting("vatRate", Number(e.target.value)));
    }


    function bindGlobalEvents() {
      document.addEventListener("click", async e => {
        const btn = e.target.closest("[data-action]");
        const dayCard = e.target.closest(".day-card");
        const toolbar = e.target.closest(".toolbar");
        
        // Click on day card header (not toolbar) - toggle collapse
        if (dayCard && !toolbar && !btn) {
          const dayHead = e.target.closest(".day-head");
          if (dayHead) {
            dayCard.classList.toggle("collapsed");
          }
          return;
        }
        
        if (!btn) return;
        
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        const tab = btn.dataset.tab;

        if (action === "new-job") createJob();
        if (action === "duplicate-job") duplicateJob();
        if (action === "toggle-theme") toggleTheme();
        if (action === "export-pdf") {
          renderPrint();
          setTimeout(() => window.print(), 100);
        }
        if (action === "download-pdf") {
          exportPDF();
        }
        if (action === "export-current-json") exportCurrentJSON();
        if (action === "backup-all") backupAllJobs();
        if (action === "reset-current") resetCurrentJob();
        if (action === "reset-all") resetAllJobs();
        if (action === "select-job") setActiveJob(id);
        if (action === "export-job-json") {
          const job = state.jobs.find(j => j.id === id);
          await exportSingleJob(job);
        }
        if (action === "remove-job") removeJob(id);
        if (action === "switch-tab") switchTab(tab);
        if (action === "add-day") addDay(type);
        if (action === "delete-day") await deleteDay(id);
        if (action === "duplicate-day") duplicateDay(id);
        if (action === "move-day-up") moveDay(id, -1);
        if (action === "move-day-down") moveDay(id, 1);
        if (action === "install-app") installApp();
        if (action === "dismiss-install") dismissInstall();
        if (action === "quick-add") toggleQuickAdd();
        if (action === "close-quick-add") toggleQuickAdd();
        if (action === "toggle-mobile-jobs") {
          document.querySelector(".sidebar").classList.toggle("mobile-show");
        }
        if (action === "toggle-day-collapse") {
          document.querySelector(`.day-card[data-id="${id}"]`)?.classList.toggle("collapsed");
        }
      });

      document.addEventListener("keydown", e => {
        if (e.key === "?" || (e.shiftKey && e.key === "ArrowRight")) {
          showModal("Keyboard Shortcuts", `
            <div class="help-content">
              <h4>General</h4>
              <ul>
                <li><kbd>N</kbd> — New job</li>
                <li><kbd>D</kbd> — Duplicate current job</li>
                <li><kbd>T</kbd> — Toggle dark/light theme</li>
                <li><kbd>Cmd/Ctrl + P</kbd> — Print / Print Invoice</li>
              </ul>
              <h4>Navigation</h4>
              <ul>
                <li><kbd>1</kbd> — Page 1, Timings</li>
                <li><kbd>2</kbd> — Page 2, Summary</li>
                <li><kbd>3</kbd> — Rates settings</li>
              </ul>
            </div>
          `, true);
        }
      });

      document.addEventListener("input", e => {
        const node = e.target.closest("[data-day-field]");
        if (!node) return;
        if (node.tagName === "SELECT") return;
        const dayId = node.dataset.dayField;
        const key = node.dataset.key;
        const value = node.type === "checkbox" ? node.checked : node.value;
        updateDay(dayId, key, value, { rerenderDays: false });
      });

      document.addEventListener("change", e => {
        const node = e.target.closest("[data-day-field]");
        if (node) {
          const dayId = node.dataset.dayField;
          const key = node.dataset.key;
          let value = node.type === "checkbox" ? node.checked : node.value;
          if (node.tagName === "SELECT" && ["cCharge", "ulez", "minCharge4h", "minCharge8h"].includes(key)) value = value === "true";
          updateDay(dayId, key, value, { rerenderDays: node.tagName === "SELECT" });
          return;
        }

        const typeNode = e.target.closest('[data-action="switch-day-type"]');
        if (typeNode) {
          switchDayType(typeNode.dataset.id, typeNode.value);
        }
      });

      document.getElementById("importJson").addEventListener("change", e => {
        const file = e.target.files && e.target.files[0];
        if (file) importJob(file);
        e.target.value = "";
      });
    }

    initTheme();
    loadState();
    bindTopInputs();
    bindGlobalEvents();
    refs.year.textContent = new Date().getFullYear();
    renderAll();
    registerServiceWorker();

    function registerServiceWorker() {
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", async () => {
          try {
            await navigator.serviceWorker.register("./sw.js", { scope: "./" });
          } catch (error) {
            console.error("Service worker registration failed", error);
          }
        });
      }
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setTimeout(() => {
        if (localStorage.getItem("install_dismissed")) return;
        refs.installBanner.classList.add("visible");
      }, 3000);
    });

    window.addEventListener("appinstalled", () => {
      refs.installBanner.classList.remove("visible");
      deferredPrompt = null;
      showToast("App installed successfully!");
    });

    async function installApp() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        refs.installBanner.classList.remove("visible");
      }
      deferredPrompt = null;
    }

    function dismissInstall() {
      refs.installBanner.classList.remove("visible");
      localStorage.setItem("install_dismissed", "1");
    }

    function toggleQuickAdd() {
      refs.quickAddPanel.classList.toggle("visible");
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveState(true);
      }
    });

    window.addEventListener("online", () => showToast("Back online", 2000));
    window.addEventListener("offline", () => showToast("Offline mode", 2000));

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        createJob();
        showToast("New job created");
      }
      if (e.key === "d" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        duplicateJob();
      }
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        renderPrint();
        window.print();
      }
      if (e.key === "t" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleTheme();
      }
      if (e.key === "1") switchTab("timings");
      if (e.key === "2") switchTab("summary");
      if (e.key === "3") switchTab("settings");
    });
  